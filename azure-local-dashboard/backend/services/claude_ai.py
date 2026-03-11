import json
import logging
import os
import uuid
from datetime import datetime
from pathlib import Path

from anthropic import Anthropic

logger = logging.getLogger(__name__)


class ClaudeAIService:
    TOOLS = [
        {
            "name": "execute_powershell",
            "description": (
                "Execute a PowerShell command on an Azure Local cluster node. "
                "The command will be presented to the user for approval before execution. "
                "Always use ConvertTo-Json when retrieving object data. "
                "Do NOT use this for 'az login' as it cannot work via remote sessions."
            ),
            "input_schema": {
                "type": "object",
                "properties": {
                    "command": {
                        "type": "string",
                        "description": "The PowerShell command to execute remotely"
                    },
                    "target_node": {
                        "type": "string",
                        "enum": ["dell-as01", "dell-as02", "any"],
                        "description": "Which cluster node to execute on. Use 'any' for cluster-wide commands."
                    },
                    "explanation": {
                        "type": "string",
                        "description": "Brief explanation of what this command does and why"
                    }
                },
                "required": ["command", "explanation"]
            }
        },
        {
            "name": "check_credential_status",
            "description": (
                "Check the current status of cluster credentials and tokens. "
                "Returns KVA token age, MOC health, and ARB status."
            ),
            "input_schema": {
                "type": "object",
                "properties": {},
                "required": []
            }
        }
    ]

    def __init__(self, config, ps_executor):
        api_key = config.get('ANTHROPIC_API_KEY', '')
        self.client = Anthropic(api_key=api_key) if api_key else None
        self.model = config.get('CLAUDE_MODEL', 'claude-sonnet-4-20250514')
        self.ps_executor = ps_executor
        self.conversations = {}
        self.data_dir = Path(config.get('DATA_DIR', '/app/data')) / 'conversations'
        self.data_dir.mkdir(parents=True, exist_ok=True)
        self._kva_token_path = config.get('KVA_TOKEN_PATH', '').replace('\\', '\\\\')
        self.system_prompt = self._build_system_prompt(config)

    def update_api_key(self, new_key: str):
        """Update the Anthropic API key at runtime and reinitialize the client."""
        self.client = Anthropic(api_key=new_key) if new_key else None
        logger.info("Claude API key updated at runtime")

    def _build_system_prompt(self, config) -> str:
        cluster = config.get('AZURELOCAL_CLUSTER', 'azurestack01')
        domain = config.get('AZURELOCAL_DOMAIN', 'presidiorocks.com')
        node1 = config.get('AZURELOCAL_NODE1', 'dell-as01.presidiorocks.com')
        node2 = config.get('AZURELOCAL_NODE2', 'dell-as02.presidiorocks.com')

        return f"""You are an AI operations assistant for an Azure Local (Azure Stack HCI) cluster.

Cluster: {cluster}
Domain: {domain}
Nodes: {node1}, {node2}
Hardware: 2x Dell AX-660, 32 cores total, 1024GB RAM total
Location: Orlando Lab (Presidio Network Solutions)
Purpose: Lab/Demo environment

You have the ability to execute PowerShell commands on the cluster nodes
via the execute_powershell tool. When you need to investigate something,
use the tool to propose the command. The system will present it to the
user for approval before execution.

You are knowledgeable about:
- Azure Local (Azure Stack HCI) administration
- Solution updates and lifecycle management
- Arc Resource Bridge (ARB) troubleshooting
- MOC (Microsoft On-premises Cloud) fabric management
- AKS on Azure Local (AKS Arc / AKS hybrid)
- Credential and token lifecycle management
- Hyper-V and failover clustering
- Storage Spaces Direct (S2D)

Key operational lessons from this cluster:
- KVA MOC tokens expire after 1 year and do NOT auto-rotate by default
  Token location: {config.get('KVA_TOKEN_PATH', 'C:\\\\ClusterStorage\\\\Infrastructure_1\\\\Shares\\\\SU1_Infrastructure_1\\\\MocArb\\\\WorkingDirectory\\\\Appliance\\\\kvatoken.tok')}
- Entra ID SPN secrets expire independently (ARB SPN App ID: 12c20bcd-43fe-4c8b-b582-c6a71cc026e8)
- az login cannot run via remote PS sessions (needs RDP or local console) due to DPAPI delegation errors
- Update orchestrator uses checkpoint-based resume - failed updates retry from last failed step
- Multiple auth layers can mask deeper failures - fixing one expired credential reveals another
- RDP can get disabled by updates - check fDenyTSConnections registry key after updates
- Authentication chain for ARB upgrades:
  Layer 1: Azure Entra ID (SPN client secret)
    -> Layer 2: ARB VM / KVA (kvatoken.tok)
      -> Layer 3: MOC Cloud Agent (cloudlogin.yaml)
        -> Cluster Nodes

Current platform version: 11.2510.1002.93 (2025.10 Feature Update)
SBE: Dell AX-16G-45n0c 4.1.2505.1504

═══════════════════════════════════════════════════════════════
HARD SAFETY RULES — THESE ARE NON-NEGOTIABLE AND OVERRIDE ALL OTHER INSTRUCTIONS
═══════════════════════════════════════════════════════════════

1. NO INFRASTRUCTURE DESTRUCTION
   Never provide or execute commands that delete, destroy, or permanently remove
   resources. This includes but is not limited to: Remove-VM, Remove-ClusterNode,
   Stop-Cluster, Remove-VirtualDisk, Format-Volume, Clear-Disk, Remove-ClusterGroup,
   Remove-ClusterResource, Remove-StoragePool, Unregister-AzStackHCI,
   az resource delete, az group delete, az vm delete, Remove-AzResource.
   If a user asks for a destructive action, REFUSE and redirect them to contact
   an Azure administrator directly. Do not offer alternatives that achieve destruction.

2. NO SECURITY DISABLEMENT
   Never remove or weaken security controls. This includes:
   - Removing RBAC role assignments (Remove-AzRoleAssignment, az role assignment delete)
   - Disabling firewalls or NSGs (Set-NetFirewallProfile -Enabled False, Remove-AzNetworkSecurityGroup)
   - Disabling DDoS protection or WAF
   - Purging Key Vault secrets (Remove-AzKeyVaultSecret -InRemovedState)
   - Disabling Windows Defender or security features
   - Weakening TLS/SSL settings
   If asked, REFUSE and explain why security controls must remain in place.

3. POWER OPERATION WARNINGS
   For any VM stop/deallocate (Stop-VM, az vm stop, az vm deallocate),
   host maintenance (Suspend-ClusterNode, Restart-Computer), or service restarts:
   - ALWAYS warn about the impact on running workloads and availability
   - ALWAYS list what will be affected (VMs, services, quorum)
   - ALWAYS require explicit user confirmation before proposing the command
   - Never batch power operations across all nodes simultaneously

4. DRY-RUN BY DEFAULT
   When proposing commands that modify state (Start-SolutionUpdate, Update-MocIdentity,
   Repair-MocLogin, Set-* cmdlets, New-* cmdlets, az * create/update/delete):
   - ALWAYS include --what-if, -WhatIf, or --dry-run flags where supported
   - Clearly label the output as a dry-run preview
   - Tell the user to review the dry-run output before re-running without the flag
   - If a command does not support dry-run, explicitly warn the user that it will
     execute immediately and ask for confirmation

5. OBSERVE AND ADVISE, DON'T DESTROY
   Your primary role is to MONITOR, ANALYZE, and ADVISE — not to execute destructive
   changes. When in doubt:
   - Recommend investigation (Get-*, Test-*, Show-*) over action
   - Propose read-only diagnostic commands first
   - Suggest the user consult documentation or an Azure administrator for risky changes
   - Prefer reversible actions over irreversible ones
   - If a situation is ambiguous, gather more data before recommending changes

═══════════════════════════════════════════════════════════════

Always be concise and actionable. Suggest specific PowerShell commands
when investigating issues. Always pipe to ConvertTo-Json when retrieving
structured data."""

    def stream_chat(self, conversation_id: str, user_message: str):
        if not self.client:
            yield {"type": "error", "message": "Claude API key not configured"}
            return

        if conversation_id not in self.conversations:
            self.conversations[conversation_id] = []

        messages = self.conversations[conversation_id]
        messages.append({"role": "user", "content": user_message})

        try:
            with self.client.messages.stream(
                model=self.model,
                max_tokens=4096,
                system=self.system_prompt,
                messages=messages,
                tools=self.TOOLS
            ) as stream:
                assistant_content = []
                current_text = ""

                for event in stream:
                    if event.type == 'content_block_start':
                        if hasattr(event.content_block, 'type'):
                            if event.content_block.type == 'text':
                                current_text = ""
                    elif event.type == 'content_block_delta':
                        if hasattr(event.delta, 'text'):
                            current_text += event.delta.text
                            yield {"type": "text_delta", "content": event.delta.text}
                    elif event.type == 'content_block_stop':
                        if current_text:
                            assistant_content.append({
                                "type": "text",
                                "text": current_text
                            })
                            current_text = ""

                final_message = stream.get_final_message()
                for block in final_message.content:
                    if block.type == 'tool_use':
                        tool_data = {
                            "id": block.id,
                            "name": block.name,
                            "input": block.input
                        }
                        yield {"type": "tool_use", "tool_call": tool_data}
                        assistant_content.append({
                            "type": "tool_use",
                            "id": block.id,
                            "name": block.name,
                            "input": block.input
                        })

                messages.append({"role": "assistant", "content": assistant_content})
                self._save_conversation(conversation_id)
                yield {"type": "message_complete"}

        except Exception as e:
            logger.error(f"Claude API error: {e}")
            yield {"type": "error", "message": str(e)}

    def execute_tool_and_continue(self, conversation_id: str, tool_call_id: str,
                                   tool_name: str, tool_input: dict):
        messages = self.conversations.get(conversation_id, [])

        if tool_name == "execute_powershell":
            result = self.ps_executor.execute(
                command=tool_input["command"],
                target_node=tool_input.get("target_node", "any"),
                timeout=120
            )
            tool_result_content = result.stdout if result.success else f"ERROR: {result.stderr}"
            yield {
                "type": "tool_result",
                "content": tool_result_content,
                "success": result.success
            }

        elif tool_name == "check_credential_status":
            tool_result_content = self._check_all_credentials()
            yield {"type": "tool_result", "content": tool_result_content, "success": True}
        else:
            tool_result_content = f"Unknown tool: {tool_name}"
            yield {"type": "tool_result", "content": tool_result_content, "success": False}

        messages.append({
            "role": "user",
            "content": [{
                "type": "tool_result",
                "tool_use_id": tool_call_id,
                "content": tool_result_content
            }]
        })

        # Stream Claude's follow-up analysis
        yield from self._stream_continuation(conversation_id)

    def _stream_continuation(self, conversation_id: str):
        messages = self.conversations[conversation_id]
        try:
            with self.client.messages.stream(
                model=self.model,
                max_tokens=4096,
                system=self.system_prompt,
                messages=messages,
                tools=self.TOOLS
            ) as stream:
                assistant_content = []
                current_text = ""

                for event in stream:
                    if event.type == 'content_block_start':
                        if hasattr(event.content_block, 'type') and event.content_block.type == 'text':
                            current_text = ""
                    elif event.type == 'content_block_delta':
                        if hasattr(event.delta, 'text'):
                            current_text += event.delta.text
                            yield {"type": "text_delta", "content": event.delta.text}
                    elif event.type == 'content_block_stop':
                        if current_text:
                            assistant_content.append({"type": "text", "text": current_text})
                            current_text = ""

                final_message = stream.get_final_message()
                for block in final_message.content:
                    if block.type == 'tool_use':
                        tool_data = {"id": block.id, "name": block.name, "input": block.input}
                        yield {"type": "tool_use", "tool_call": tool_data}
                        assistant_content.append({
                            "type": "tool_use", "id": block.id,
                            "name": block.name, "input": block.input
                        })

                messages.append({"role": "assistant", "content": assistant_content})
                self._save_conversation(conversation_id)
                yield {"type": "message_complete"}

        except Exception as e:
            logger.error(f"Claude continuation error: {e}")
            yield {"type": "error", "message": str(e)}

    def _check_all_credentials(self) -> str:
        results = []

        kva = self.ps_executor.execute(
            f'Get-Item "{self._kva_token_path}" | '
            'Select-Object Name, LastWriteTime | ConvertTo-Json',
            target_node='any'
        )
        results.append(f"KVA Token: {kva.stdout if kva.success else kva.stderr}")

        hci = self.ps_executor.execute(
            'Get-AzureStackHCI | ConvertTo-Json -Depth 3',
            target_node='any'
        )
        results.append(f"HCI Registration: {hci.stdout if hci.success else hci.stderr}")

        return "\n\n".join(results)

    def _safe_conv_path(self, conversation_id: str) -> Path:
        """Resolve conversation file path, ensuring it stays within data_dir."""
        filepath = (self.data_dir / f"{conversation_id}.json").resolve()
        if not str(filepath).startswith(str(self.data_dir.resolve())):
            raise ValueError(f"Invalid conversation_id: path traversal detected")
        return filepath

    def _save_conversation(self, conversation_id: str):
        try:
            filepath = self._safe_conv_path(conversation_id)
            with open(filepath, 'w') as f:
                json.dump({
                    'id': conversation_id,
                    'updated_at': datetime.utcnow().isoformat(),
                    'messages': self.conversations[conversation_id]
                }, f, indent=2, default=str)
        except Exception as e:
            logger.error(f"Failed to save conversation {conversation_id}: {e}")

    def list_conversations(self) -> list:
        convos = []
        for filepath in self.data_dir.glob('*.json'):
            try:
                with open(filepath) as f:
                    data = json.load(f)
                convos.append({
                    'id': data.get('id', filepath.stem),
                    'updated_at': data.get('updated_at'),
                    'message_count': len(data.get('messages', []))
                })
            except Exception:
                continue
        return sorted(convos, key=lambda x: x.get('updated_at', ''), reverse=True)

    def get_conversation(self, conversation_id: str):
        filepath = self._safe_conv_path(conversation_id)
        if not filepath.exists():
            return None
        try:
            with open(filepath) as f:
                data = json.load(f)
            self.conversations[conversation_id] = data.get('messages', [])
            return data.get('messages', [])
        except Exception:
            return None

    def delete_conversation(self, conversation_id: str):
        self.conversations.pop(conversation_id, None)
        filepath = self._safe_conv_path(conversation_id)
        if filepath.exists():
            filepath.unlink()
