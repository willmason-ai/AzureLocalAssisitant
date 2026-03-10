// Cluster types
export interface ClusterNode {
  Name: string;
  State: string;
  StatusInformation: string;
}

export interface NodeInfo {
  CsName: string;
  OsUptime: string;
  CsNumberOfProcessors: number;
  CsPhysicallyInstalledMemory: number;
  WindowsProductName: string;
  OsVersion: string;
}

export interface HealthFault {
  FaultId: string;
  FaultType: string;
  Severity: string;
  Description: string;
}

export interface StoragePool {
  FriendlyName: string;
  HealthStatus: string;
  OperationalStatus: string;
  Size: number;
  AllocatedSize: number;
}

export interface VirtualDisk {
  FriendlyName: string;
  OperationalStatus: string;
  HealthStatus: string;
  Size: number;
  FootprintOnPool: number;
}

export interface VM {
  Name: string;
  State: string;
  CPUUsage: number;
  MemoryAssigned: number;
  Uptime: string;
  Status: string;
  ComputerName: string;
}

// Update types
export interface SolutionUpdate {
  DisplayName: string;
  State: string;
  Version: string;
  DateCreated?: string;
  InstalledDate?: string;
  Description?: string;
}

export interface UpdateRun {
  DisplayName: string;
  State: string;
  StartTimeUtc: string;
  EndTimeUtc?: string;
  Duration?: string;
}

// Credential types
export interface CredentialStatus {
  kva_token: {
    Name?: string;
    LastWriteTime?: string;
    CreationTime?: string;
    error?: string;
  };
  hci_registration: Record<string, unknown>;
  moc_nodes: Array<{
    name: string;
    fqdn: string;
    health: string;
    state: string;
  }> | { error: string };
}

// AI types
export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  toolCalls?: ToolCall[];
  toolResults?: ToolResult[];
  timestamp?: string;
}

export interface ToolCall {
  id: string;
  name: string;
  input: {
    command: string;
    target_node?: string;
    explanation: string;
  };
  status?: 'pending' | 'approved' | 'executing' | 'completed' | 'rejected';
}

export interface ToolResult {
  toolCallId: string;
  content: string;
  success: boolean;
}

export interface SSEEvent {
  type: 'text_delta' | 'tool_use' | 'tool_result' | 'message_complete' | 'error';
  content?: string;
  tool_call?: ToolCall;
  message?: string;
  success?: boolean;
}

// Config types
export interface AppConfig {
  cluster_name: string;
  domain: string;
  nodes: string[];
  azure: {
    subscription_id: string;
    resource_group: string;
    tenant_id: string;
  };
  ai_configured: boolean;
}
