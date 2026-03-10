import json
import logging
from dataclasses import dataclass, field

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
        logger.info(f"Executing on {node_fqdn}: {command[:200]}...")

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
            logger.warning(f"Command failed on {node_fqdn} via {result.transport_used} ({elapsed:.0f}ms): {result.stderr[:200]}")

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
            return {
                "level": "destructive",
                "allowed": True,
                "reason": (
                    "This command modifies cluster state. Review the impact carefully "
                    "and confirm you understand the consequences before executing."
                ),
                "requires_confirmation": True,
            }
        return {
            "level": "safe",
            "allowed": True,
            "reason": "Read-only or low-risk command.",
            "requires_confirmation": False,
        }

    def _execute_winrm(self, node_fqdn: str, command: str, timeout: int) -> ExecutionResult:
        try:
            import winrm
            import socket

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
            import paramiko

            client = paramiko.SSHClient()
            client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
            client.connect(
                hostname=node_fqdn,
                port=22,
                username=f'{self.domain}\\{self.username}',
                password=self.password,
                timeout=10
            )

            ps_command = f'powershell.exe -NoProfile -Command "{command}"'
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
            return cleaned
