import json
import logging
from dataclasses import dataclass, field

# BUG-043: Import at module level so missing packages are caught at startup
try:
    import winrm  # noqa: F401
except ImportError:
    winrm = None
    logging.getLogger(__name__).warning("pywinrm not installed — WinRM transport unavailable")

try:
    import paramiko  # noqa: F401
except ImportError:
    paramiko = None
    logging.getLogger(__name__).warning("paramiko not installed — SSH transport unavailable")

logger = logging.getLogger(__name__)

# ═══════════════════════════════════════════════════════════════
# HARD SAFETY ENFORCEMENT — Commands that are NEVER allowed to execute
# These act as a backstop regardless of what the AI proposes
# ═══════════════════════════════════════════════════════════════

# Rule 1: No infrastructure destruction
BLOCKED_COMMANDS = [
    # Cluster destruction
    'Remove-ClusterNode',
    'Stop-Cluster',
    'Destroy-Cluster',
    'Remove-ClusterGroup',
    'Remove-ClusterResource',
    'Remove-ClusterSharedVolume',
    # Storage destruction
    'Format-Volume',
    'Remove-VirtualDisk',
    'Clear-Disk',
    'Remove-StoragePool',
    'Remove-PhysicalDisk',
    # VM destruction
    'Remove-VM',
    'Remove-VMSnapshot',
    'Remove-VMHardDiskDrive',
    'Remove-VMSwitch',
    # Azure resource destruction
    'Unregister-AzStackHCI',
    'Remove-AzResource',
    'Remove-AzResourceGroup',
    'az resource delete',
    'az group delete',
    'az vm delete',
    'az aks delete',
    'az aksarc delete',
    'az arcappliance delete',
    # Rule 2: No security disablement
    'Remove-AzRoleAssignment',
    'az role assignment delete',
    'Remove-AzNetworkSecurityGroup',
    'Remove-AzNetworkSecurityRuleConfig',
    'Set-NetFirewallProfile -Enabled False',
    'Disable-NetFirewallRule',
    'Remove-AzKeyVaultSecret',
    'Remove-AzKeyVault',
    'Disable-WindowsOptionalFeature',
    'Set-MpPreference -DisableRealtimeMonitoring',
    'Uninstall-WindowsFeature',
]

# Commands that require explicit user confirmation + impact warning (Rule 3)
DESTRUCTIVE_COMMANDS = [
    'Start-SolutionUpdate',
    'Repair-MocLogin',
    'Update-MocIdentity',
    'Restart-Computer',
    'Stop-VM',
    'Suspend-ClusterNode',
    'Resume-ClusterNode',
    'Stop-ClusterNode',
    'Restart-Service',
    'Stop-Service',
    'Move-ClusterGroup',
    'az vm stop',
    'az vm deallocate',
    'az vm restart',
    'az aksarc upgrade',
]


@dataclass
class ExecutionResult:
    success: bool
    stdout: str = ''
    stderr: str = ''
    exit_code: int = -1
    node: str = ''
    transport_used: str = ''
    parsed: any = field(default=None)


class PowerShellExecutor:
    def __init__(self, config):
        self.nodes = {
            'dell-as01': config.get('AZURELOCAL_NODE1', 'dell-as01.presidiorocks.com'),
            'dell-as02': config.get('AZURELOCAL_NODE2', 'dell-as02.presidiorocks.com'),
        }
        self.domain = config.get('AZURELOCAL_DOMAIN', 'presidiorocks.com')
        self.username = config.get('AZURELOCAL_USERNAME', 'hciadmin')
        self.password = config.get('AZURELOCAL_PASSWORD', '')
        self.cluster_name = config.get('AZURELOCAL_CLUSTER', 'azurestack01')
        self.transport = config.get('WINRM_TRANSPORT', 'ntlm')
        self.use_ssl = config.get('WINRM_USE_SSL', True)
        self.ssh_fallback = config.get('SSH_FALLBACK_ENABLED', True)

    def execute(self, command: str, target_node: str = 'any',
                timeout: int = 120, parse_json: bool = True) -> ExecutionResult:
        is_safe, reason = self._validate_command(command)
        if not is_safe:
            return ExecutionResult(
                success=False,
                stderr=reason,
                exit_code=-1
            )

        node_fqdn = self._select_node(target_node)
        # Mask any credentials that might appear in the command text
        # BUG-023: Log full command to audit logger for security trail
        audit_logger = logging.getLogger('audit')
        audit_cmd = command
        if self.password and self.password in audit_cmd:
            audit_cmd = audit_cmd.replace(self.password, '****')
        audit_logger.info(f"EXEC [{node_fqdn}]: {audit_cmd}")

        log_cmd = command[:200]
        if self.password and self.password in log_cmd:
            log_cmd = log_cmd.replace(self.password, '****')
        logger.info(f"Executing on {node_fqdn}: {log_cmd}...")

        import time
        start = time.time()

        # Try WinRM first
        result = self._execute_winrm(node_fqdn, command, timeout)

        # Fallback to SSH if WinRM fails and SSH is enabled
        if not result.success and self.ssh_fallback:
            logger.info(f"WinRM failed for {node_fqdn}, trying SSH fallback...")
            result = self._execute_ssh(node_fqdn, command, timeout)

        elapsed = (time.time() - start) * 1000
        if result.success:
            logger.info(f"Command succeeded on {node_fqdn} via {result.transport_used} ({elapsed:.0f}ms)")
        else:
            # Mask credentials in error output before logging
            err_msg = result.stderr[:200]
            if self.password and self.password in err_msg:
                err_msg = err_msg.replace(self.password, '****')
            logger.warning(f"Command failed on {node_fqdn} via {result.transport_used} ({elapsed:.0f}ms): {err_msg}")

        # Parse JSON output if requested
        if result.success and parse_json:
            result.parsed = self._parse_output(result.stdout)

        return result

    def execute_on_all_nodes(self, command: str, timeout: int = 120) -> dict:
        results = {}
        for name in self.nodes:
            results[name] = self.execute(command, target_node=name, timeout=timeout)
        return results

    def _select_node(self, target: str) -> str:
        if target in self.nodes:
            return self.nodes[target]
        # 'any' -> try first node
        return list(self.nodes.values())[0]

    def _validate_command(self, command: str) -> tuple:
        cmd_lower = command.lower()
        for blocked in BLOCKED_COMMANDS:
            if blocked.lower() in cmd_lower:
                return False, (
                    f"BLOCKED: '{blocked}' is permanently blocked by safety policy. "
                    f"This command could destroy infrastructure or disable security controls. "
                    f"Contact an Azure administrator to perform this action directly."
                )
        return True, ""

    def is_destructive(self, command: str) -> bool:
        cmd_lower = command.lower()
        return any(d.lower() in cmd_lower for d in DESTRUCTIVE_COMMANDS)

    def _has_dry_run_flag(self, command: str) -> bool:
        """Check if a command includes a dry-run/what-if flag."""
        cmd_lower = command.lower()
        return any(flag in cmd_lower for flag in ['--what-if', '-whatif', '--dry-run', '--dryrun'])

    def get_safety_classification(self, command: str) -> dict:
        """Classify a command's safety level for the frontend to display warnings."""
        is_safe, reason = self._validate_command(command)
        if not is_safe:
            return {
                "level": "blocked",
                "allowed": False,
                "reason": reason,
            }
        if self.is_destructive(command):
            has_dry_run = self._has_dry_run_flag(command)
            return {
                "level": "destructive",
                "allowed": True,
                "reason": (
                    "This command modifies cluster state. Review the impact carefully "
                    "and confirm you understand the consequences before executing."
                    + ("" if has_dry_run else
                       " WARNING: No --WhatIf/--dry-run flag detected. This command will execute immediately.")
                ),
                "requires_confirmation": True,
                "has_dry_run": has_dry_run,
            }
        return {
            "level": "safe",
            "allowed": True,
            "reason": "Read-only or low-risk command.",
            "requires_confirmation": False,
        }

    def _execute_winrm(self, node_fqdn: str, command: str, timeout: int) -> ExecutionResult:
        try:
            import socket
            if winrm is None:
                raise ImportError("pywinrm is not installed")

            protocol = 'https' if self.use_ssl else 'http'
            port = 5986 if self.use_ssl else 5985
            endpoint = f'{protocol}://{node_fqdn}:{port}/wsman'
            full_username = f'{self.domain}\\{self.username}'

            # Quick TCP connectivity check — fail fast if node is unreachable
            # instead of blocking for 120+ seconds on WinRM session creation
            try:
                sock = socket.create_connection((node_fqdn, port), timeout=10)
                sock.close()
            except (socket.timeout, socket.error, OSError) as e:
                logger.warning(f"Node {node_fqdn}:{port} unreachable (TCP check): {e}")
                return ExecutionResult(
                    success=False,
                    stderr=f"Node {node_fqdn} is unreachable on port {port}: {e}",
                    node=node_fqdn,
                    transport_used='winrm'
                )

            # BUG-016: SSL cert validation disabled — acceptable for lab/internal WinRM
            # with self-signed certs. For production, configure proper CA trust.
            session = winrm.Session(
                endpoint,
                auth=(full_username, self.password),
                transport=self.transport,
                server_cert_validation='ignore',
                operation_timeout_sec=timeout,
                read_timeout_sec=timeout + 30
            )

            result = session.run_ps(command)
            stdout = result.std_out.decode('utf-8', errors='replace')
            stderr = result.std_err.decode('utf-8', errors='replace')

            return ExecutionResult(
                success=(result.status_code == 0),
                stdout=stdout,
                stderr=stderr,
                exit_code=result.status_code,
                node=node_fqdn,
                transport_used='winrm'
            )
        except Exception as e:
            logger.error(f"WinRM execution failed on {node_fqdn}: {e}")
            return ExecutionResult(
                success=False,
                stderr=str(e),
                node=node_fqdn,
                transport_used='winrm'
            )

    def _execute_ssh(self, node_fqdn: str, command: str, timeout: int) -> ExecutionResult:
        client = None
        try:
            if paramiko is None:
                raise ImportError("paramiko is not installed")

            client = paramiko.SSHClient()
            client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
            client.connect(
                hostname=node_fqdn,
                port=22,
                username=f'{self.domain}\\{self.username}',
                password=self.password,
                timeout=10
            )

            # BUG-004 fix: Use -EncodedCommand to avoid shell injection via double quotes
            import base64
            encoded = base64.b64encode(command.encode('utf-16-le')).decode('ascii')
            ps_command = f'powershell.exe -NoProfile -EncodedCommand {encoded}'
            stdin, stdout, stderr = client.exec_command(ps_command, timeout=timeout)

            stdout_text = stdout.read().decode('utf-8', errors='replace')
            stderr_text = stderr.read().decode('utf-8', errors='replace')
            exit_code = stdout.channel.recv_exit_status()

            return ExecutionResult(
                success=(exit_code == 0),
                stdout=stdout_text,
                stderr=stderr_text,
                exit_code=exit_code,
                node=node_fqdn,
                transport_used='ssh'
            )
        except Exception as e:
            logger.error(f"SSH execution failed on {node_fqdn}: {e}")
            return ExecutionResult(
                success=False,
                stderr=str(e),
                node=node_fqdn,
                transport_used='ssh'
            )
        finally:
            if client:
                try:
                    client.close()
                except Exception:
                    pass

    def _parse_output(self, raw_output: str):
        if not raw_output or not raw_output.strip():
            return None
        cleaned = raw_output.strip()
        if cleaned.startswith('\ufeff'):
            cleaned = cleaned[1:]
        try:
            return json.loads(cleaned)
        except json.JSONDecodeError:
            # BUG-018: Return None instead of raw string to avoid type mismatches
            logger.debug(f"JSON parse failed, raw output: {cleaned[:200]}")
            return None
