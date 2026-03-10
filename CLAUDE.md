# Azure Local AI Operations Dashboard - Build Instructions

## Project Overview

Build a **Dockerized React web application** that serves as an AI-powered operations dashboard for managing an Azure Local (formerly Azure Stack HCI) cluster. The application integrates with the **Claude API** to provide an intelligent local AI assistant that can directly interrogate, orchestrate, and plan maintenance for the Azure Local environment.

This is a **lab/demo environment** - prioritize functionality and developer experience over production hardening.

---

## AI Agent Safety Rules (NON-NEGOTIABLE)

These rules are enforced at three layers: Claude system prompt, backend command validation, and frontend UI. They cannot be overridden by user prompts to the AI assistant.

1. **No infrastructure destruction** — The AI agent must never provide or execute commands that delete, destroy, or permanently remove resources (VMs, disks, clusters, Azure resources). If asked, it must refuse and redirect to an Azure administrator.

2. **No security disablement** — The AI agent must never remove RBAC assignments, disable firewalls/NSGs/DDoS/WAF, purge Key Vault secrets, or weaken any security controls. These commands are hard-blocked at the backend level.

3. **Power operation warnings** — For VM stop/deallocate, host maintenance, or service restarts, the AI must always warn about impact on workloads and availability, and require explicit user confirmation before proposing the command.

4. **Dry-run by default** — All state-modifying commands must include `--what-if`, `-WhatIf`, or `--dry-run` flags where supported. The user must review dry-run output before re-executing without the flag. If dry-run is not supported, the AI must explicitly warn that the command will execute immediately.

5. **Observe and advise, don't destroy** — The AI's primary role is to monitor, analyze, and advise. When in doubt, it must recommend investigation (`Get-*`, `Test-*`, `Show-*`) over action, and suggest consulting documentation or an administrator for risky changes.

---

## Architecture

```
+--------------------------------------------------+
|  Docker Container                                 |
|                                                   |
|  +--------------------------------------------+  |
|  |  React Frontend (Vite + TypeScript)         |  |
|  |  - Dashboard UI                             |  |
|  |  - Update Status Panel                      |  |
|  |  - Health Monitoring                        |  |
|  |  - AI Chat Interface                        |  |
|  |  - Maintenance Planner                      |  |
|  +--------------------------------------------+  |
|                    |                              |
|  +--------------------------------------------+  |
|  |  Node.js / Express Backend API              |  |
|  |  - REST endpoints for cluster ops           |  |
|  |  - PowerShell execution engine              |  |
|  |  - Claude API integration                   |  |
|  |  - WebSocket for real-time updates          |  |
|  +--------------------------------------------+  |
|                    |                              |
+--------------------------------------------------+
         |                           |
         v                           v
+------------------+    +-------------------------+
|  Azure Local     |    |  Claude API             |
|  Cluster         |    |  (Anthropic)            |
|  via WinRM/SSH   |    |  AI Assistant           |
+------------------+    +-------------------------+
```

---

## Target Cluster Details

| Property | Value |
|----------|-------|
| **Cluster Name** | azurestack01 |
| **Domain** | presidiorocks.com |
| **Node 1** | dell-as01.presidiorocks.com |
| **Node 2** | dell-as02.presidiorocks.com |
| **Hardware** | Dell AX-660 (x2) |
| **Cores** | 32 total (16 per node) |
| **RAM** | 1024 GB total (512 GB per node) |
| **Resource Group** | rg-azurestack |
| **Location** | East US |
| **Custom Location** | Orlando-Lab-Azurestack |
| **Subscription ID** | aaaaa147-fd6e-48fb-9a66-d044700dca17 |
| **Tenant ID** | 2a731c61-a2b2-4661-8409-5b861cf40d0c |
| **Identity Provider** | Active Directory |
| **WAC URL** | https://azurestack-wac.presidiorocks.com |
| **Admin User** | hciadmin |
| **ARB Appliance** | azurestack01-arcbridge |
| **ARB Control Plane IP** | 10.1.68.22 |

---

## Tech Stack

### Frontend
- **React 18+** with TypeScript
- **Vite** for build tooling
- **Tailwind CSS** for styling
- **React Query (TanStack Query)** for data fetching/caching
- **Recharts** or **Chart.js** for visualizations
- **Lucide React** for icons
- Use a **dark theme** - this is an infrastructure ops dashboard

### Backend
- **Node.js** with Express and TypeScript
- **node-powershell** or **ssh2** for remote command execution to Azure Local nodes
- **Anthropic SDK** (`@anthropic-ai/sdk`) for Claude API integration
- **ws** for WebSocket support (real-time updates)
- **node-cron** for scheduled health checks

### Docker
- Multi-stage Dockerfile
- Node.js base image
- Single container running both frontend (served by Express) and backend
- Expose port **3000**
- Environment variables for configuration (see below)

---

## Environment Variables

```env
# Claude API
ANTHROPIC_API_KEY=<user-provided>
CLAUDE_MODEL=claude-sonnet-4-20250514

# Azure Local Connection
AZURELOCAL_NODE1=dell-as01.presidiorocks.com
AZURELOCAL_NODE2=dell-as02.presidiorocks.com
AZURELOCAL_DOMAIN=presidiorocks.com
AZURELOCAL_CLUSTER=azurestack01
AZURELOCAL_USERNAME=hciadmin
AZURELOCAL_PASSWORD=<user-provided>

# Azure (optional, for Azure API calls)
AZURE_SUBSCRIPTION_ID=aaaaa147-fd6e-48fb-9a66-d044700dca17
AZURE_RESOURCE_GROUP=rg-azurestack
AZURE_TENANT_ID=2a731c61-a2b2-4661-8409-5b861cf40d0c

# App
PORT=3000
NODE_ENV=production
```

---

## Core Features

### 1. Cluster Health Dashboard (Home Page)

Display a real-time overview of the Azure Local cluster health:

- **Node Status Cards** - Show each node (dell-as01, dell-as02) with:
  - Online/Offline status
  - CPU usage
  - Memory usage
  - Uptime
  - Health state (from `Get-ClusterNode`)
- **Cluster Summary** - Overall cluster health, storage status, VM count
- **Quick Stats** - Total cores, total RAM, storage capacity/used
- **Recent Alerts** - Any issues or warnings

**PowerShell commands to use:**
```powershell
# Cluster node status
Get-ClusterNode | Select Name, State, StatusInformation

# Cluster health
Get-HealthFault

# Basic node info
Get-ComputerInfo | Select CsName, OsUptime, CsNumberOfProcessors, CsPhyicallyInstalledMemory

# Storage health
Get-VirtualDisk | Select FriendlyName, OperationalStatus, HealthStatus, Size, FootprintOnPool
Get-StoragePool | Select FriendlyName, HealthStatus, Size, AllocatedSize

# VM status
Get-VM | Select Name, State, CPUUsage, MemoryAssigned, Uptime
```

### 2. Update Management Panel

Monitor and manage Azure Local platform updates:

- **Current Version Display** - Show installed platform version
- **Update History Table** - All installed updates with dates, versions, status
- **Available Updates** - Show any updates in "Ready" or "Downloading" state
- **Update Status** - Real-time progress when an update is running (poll every 30s)
- **Apply Update Button** - Trigger `Start-SolutionUpdate` with confirmation dialog

**PowerShell commands to use:**
```powershell
# List all updates and their state
Get-SolutionUpdate | Select DisplayName, State, Version

# Check active update run progress
Get-SolutionUpdateRun | Sort-Object StartTimeUtc -Descending | Select -First 1 | Select DisplayName, State, StartTimeUtc, EndTimeUtc

# Detailed update run steps
Get-SolutionUpdateRun | Sort-Object StartTimeUtc -Descending | Select -First 1 | Get-SolutionUpdateRun

# Start an update
Get-SolutionUpdate | Where-Object { $_.State -eq "Ready" } | Start-SolutionUpdate

# Check solution update environment
Get-SolutionUpdateEnvironment
```

### 3. Credential & Token Health Monitor

This is CRITICAL based on operational experience. Monitor expiration of all auth tokens:

- **Entra ID SPN Secret Expiration** - Monitor App ID `12c20bcd-43fe-4c8b-b582-c6a71cc026e8`
- **KVA MOC Token Status** - Check age/expiry of `kvatoken.tok`
- **MOC Login Health** - Status of host-to-MOC authentication
- **Visual Warnings** - Red/yellow/green indicators based on days until expiry
- **Remediation Buttons** - Quick actions to renew tokens (with confirmation)

**PowerShell commands to use:**
```powershell
# Check KVA token file age
Get-Item "C:\ClusterStorage\Infrastructure_1\Shares\SU1_Infrastructure_1\MocArb\WorkingDirectory\Appliance\kvatoken.tok" | Select Name, LastWriteTime

# Check MOC node health
Get-MocNode -location "MocLocation" | Select name, fqdn, health, state

# ARB appliance status (requires az cli on node)
az arcappliance show --resource-group rg-azurestack --name azurestack01-arcbridge --only-show-errors

# Repair MOC login if needed
Repair-MocLogin

# Regenerate KVA MOC token
Update-MocIdentity -name "Appliance" -validityDays 365 -fqdn "azurestack01.presidiorocks.com" -location "MocLocation" -outFile "C:\ClusterStorage\Infrastructure_1\Shares\SU1_Infrastructure_1\MocArb\WorkingDirectory\Appliance\kvatoken.tok" -enableTokenAutoRotate

# Check Azure Stack HCI registration
Get-AzureStackHCI
```

### 4. AKS / Kubernetes Management Panel

Monitor the AKS cluster running on Azure Local:

- **Cluster Status** - Show AKS cluster health, node pool info
- **Node Pool Details** - VM sizes, node counts, status
- **Available K8s Versions** - What versions are available for upgrade

**PowerShell/CLI commands to use:**
```powershell
# AKS Arc cluster info
az aksarc show --resource-group rg-azurestack --name <cluster-name>

# List AKS Arc clusters
az aksarc list --resource-group rg-azurestack

# Get available K8s versions
az aksarc get-versions --custom-location <custom-location-id> -g rg-azurestack

# Node pool info
az aksarc nodepool list --cluster-name <cluster-name> --resource-group rg-azurestack
```

### 5. AI Assistant (Claude Chat Interface)

This is the core differentiator. An embedded AI chat powered by Claude that:

- **Has full context** of the Azure Local environment (inject cluster details, current status, and troubleshooting history as system prompt context)
- **Can execute PowerShell commands** on the cluster nodes to answer questions (with user confirmation before execution)
- **Assists with troubleshooting** - User describes a problem, Claude investigates by running commands and analyzing output
- **Plans maintenance windows** - Claude can recommend update schedules, credential rotation plans
- **Provides recommendations** - Based on current cluster state, suggest improvements
- **Remembers conversation history** within a session

#### Claude System Prompt Context

When calling the Claude API, include this in the system prompt:

```
You are an AI operations assistant for an Azure Local (Azure Stack HCI) cluster.

Cluster: azurestack01
Domain: presidiorocks.com
Nodes: dell-as01.presidiorocks.com, dell-as02.presidiorocks.com
Hardware: 2x Dell AX-660, 32 cores total, 1024GB RAM total
Location: Orlando Lab (Presidio Network Solutions)
Purpose: Lab/Demo environment

You have the ability to execute PowerShell commands on the cluster nodes
via the backend API. When you need to investigate something, propose the
command you want to run and wait for user approval before executing.

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
- Entra ID SPN secrets expire independently and must be monitored
- az login cannot run via remote PS sessions (needs RDP or local console)
- Update orchestrator uses checkpoint-based resume
- Multiple auth layers can mask deeper failures

Always be concise and actionable. Suggest specific PowerShell commands
when investigating issues. Warn about destructive operations.
```

#### AI Chat UI
- Full-width chat panel (can be toggled as sidebar or main view)
- Markdown rendering for Claude responses
- Code blocks with copy buttons for PowerShell commands
- "Execute" button next to suggested commands (with confirmation modal)
- Show command output inline in the conversation
- Loading indicators during API calls and command execution

### 6. Extensions & Services Panel

Display installed Azure Local extensions and their status:

**Extensions to monitor:**
- AdminCenter
- AzureEdgeDeviceManagement
- AzureEdgeRemoteSupport
- AzureEdgeTelemetryAndDiagnostics
- AzureEdgeLifecycleManager
- LcmController

**PowerShell commands:**
```powershell
# List extensions (via Azure CLI on node)
az k8s-extension list --cluster-name azurestack01-arcbridge --resource-group rg-azurestack --cluster-type appliances

# Or via Arc
az connectedmachine extension list --machine-name dell-as01 --resource-group rg-azurestack
```

---

## Backend API Endpoints

Design the following REST API:

```
# Cluster Health
GET    /api/cluster/status          - Overall cluster health
GET    /api/cluster/nodes           - Node details and health
GET    /api/cluster/storage         - Storage pools and virtual disks

# Updates
GET    /api/updates                 - List all updates and states
GET    /api/updates/current         - Active update run progress
POST   /api/updates/start           - Trigger ready update (requires body confirmation)
GET    /api/updates/history         - Historical update runs

# Credentials
GET    /api/credentials/status      - Token/secret expiration status
POST   /api/credentials/repair-moc  - Run Repair-MocLogin
POST   /api/credentials/rotate-kva  - Rotate KVA token

# AKS
GET    /api/aks/clusters            - List AKS clusters
GET    /api/aks/clusters/:name      - Cluster detail
GET    /api/aks/nodepools/:cluster   - Node pool info

# Extensions
GET    /api/extensions              - List installed extensions

# AI Assistant
POST   /api/ai/chat                 - Send message to Claude (streaming response)
POST   /api/ai/execute              - Execute a PS command (proposed by AI, approved by user)

# System
GET    /api/health                  - Backend health check
GET    /api/config                  - Non-sensitive cluster config for frontend
```

---

## PowerShell Execution Engine

The backend needs a module that can remotely execute PowerShell commands on the cluster nodes:

### Connection Options (implement one):

**Option A: WinRM over HTTPS (preferred for Windows-to-Windows)**
```javascript
// Using node-powershell or child_process
// Connect via Invoke-Command -ComputerName <node> -Credential <cred> -ScriptBlock { ... }
```

**Option B: SSH (if OpenSSH is configured on nodes)**
```javascript
// Using ssh2 package
// SSH into node, run PowerShell commands
```

**Option C: REST proxy via WAC**
```javascript
// Hit WAC APIs at https://azurestack-wac.presidiorocks.com
```

### Important Notes:
- **All commands require credentials** - use the AZURELOCAL_USERNAME/PASSWORD env vars
- **Some commands must run elevated** - solution update commands, MOC commands
- **az CLI commands need az login first** - may need to handle auth flow
- **Timeout handling** - some commands (updates) run for hours, use async patterns
- **Output parsing** - PowerShell output will be text, parse into structured JSON for the frontend
- **Error handling** - capture both stdout and stderr, surface errors clearly

---

## Docker Configuration

### Dockerfile
```dockerfile
# Build stage
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# Production stage
FROM node:20-alpine
WORKDIR /app
COPY --from=build /app/dist ./dist
COPY --from=build /app/server ./server
COPY --from=build /app/package*.json ./
RUN npm ci --production
EXPOSE 3000
CMD ["node", "server/index.js"]
```

### docker-compose.yml
```yaml
version: '3.8'
services:
  azure-local-dashboard:
    build: .
    ports:
      - "3000:3000"
    env_file:
      - .env
    restart: unless-stopped
    volumes:
      - ./data:/app/data  # For conversation history, cached data
```

---

## UI Layout

### Navigation (Left Sidebar)
```
[Logo/Icon] Azure Local Ops
-----------------------------
[Dashboard Icon]    Dashboard
[Update Icon]       Updates
[Shield Icon]       Credentials
[Container Icon]    Kubernetes
[Puzzle Icon]       Extensions
[Bot Icon]          AI Assistant
-----------------------------
[Settings Icon]     Settings
```

### Color Scheme (Dark Theme)
- Background: `#0f172a` (slate-900)
- Cards: `#1e293b` (slate-800)
- Borders: `#334155` (slate-700)
- Primary accent: `#3b82f6` (blue-500)
- Success: `#22c55e` (green-500)
- Warning: `#f59e0b` (amber-500)
- Error: `#ef4444` (red-500)
- Text primary: `#f1f5f9` (slate-100)
- Text secondary: `#94a3b8` (slate-400)

---

## Project Structure

```
azure-local-dashboard/
├── docker-compose.yml
├── Dockerfile
├── .env.example
├── package.json
├── tsconfig.json
├── vite.config.ts
├── tailwind.config.js
├── postcss.config.js
├── index.html
├── src/                          # React frontend
│   ├── main.tsx
│   ├── App.tsx
│   ├── index.css
│   ├── components/
│   │   ├── layout/
│   │   │   ├── Sidebar.tsx
│   │   │   ├── Header.tsx
│   │   │   └── Layout.tsx
│   │   ├── dashboard/
│   │   │   ├── NodeCard.tsx
│   │   │   ├── ClusterSummary.tsx
│   │   │   ├── QuickStats.tsx
│   │   │   └── AlertsList.tsx
│   │   ├── updates/
│   │   │   ├── UpdateList.tsx
│   │   │   ├── UpdateProgress.tsx
│   │   │   └── UpdateHistory.tsx
│   │   ├── credentials/
│   │   │   ├── TokenStatus.tsx
│   │   │   └── CredentialCard.tsx
│   │   ├── kubernetes/
│   │   │   ├── ClusterOverview.tsx
│   │   │   └── NodePoolCard.tsx
│   │   ├── extensions/
│   │   │   └── ExtensionList.tsx
│   │   ├── ai/
│   │   │   ├── ChatInterface.tsx
│   │   │   ├── ChatMessage.tsx
│   │   │   ├── CommandBlock.tsx
│   │   │   └── ExecuteModal.tsx
│   │   └── common/
│   │       ├── StatusBadge.tsx
│   │       ├── MetricCard.tsx
│   │       └── LoadingSpinner.tsx
│   ├── pages/
│   │   ├── DashboardPage.tsx
│   │   ├── UpdatesPage.tsx
│   │   ├── CredentialsPage.tsx
│   │   ├── KubernetesPage.tsx
│   │   ├── ExtensionsPage.tsx
│   │   ├── AIAssistantPage.tsx
│   │   └── SettingsPage.tsx
│   ├── hooks/
│   │   ├── useClusterStatus.ts
│   │   ├── useUpdates.ts
│   │   ├── useCredentials.ts
│   │   └── useAIChat.ts
│   ├── services/
│   │   └── api.ts
│   └── types/
│       └── index.ts
├── server/                       # Express backend
│   ├── index.ts
│   ├── routes/
│   │   ├── cluster.ts
│   │   ├── updates.ts
│   │   ├── credentials.ts
│   │   ├── aks.ts
│   │   ├── extensions.ts
│   │   └── ai.ts
│   ├── services/
│   │   ├── powershell.ts         # PS execution engine
│   │   ├── claude.ts             # Claude API integration
│   │   └── scheduler.ts         # Cron-based health checks
│   ├── middleware/
│   │   └── errorHandler.ts
│   └── types/
│       └── index.ts
└── data/                         # Persisted data (Docker volume)
    └── conversations/
```

---

## Key Implementation Notes

### PowerShell Output Parsing
PowerShell returns formatted text. You'll need to parse it into JSON. Use `-Format List` or `ConvertTo-Json` in the commands:

```powershell
# Instead of:
Get-SolutionUpdate | Select DisplayName, State, Version

# Use:
Get-SolutionUpdate | Select DisplayName, State, Version | ConvertTo-Json
```

This makes backend parsing much easier.

### Claude AI Tool Use Pattern
When the AI assistant suggests running a command:

1. Claude responds with a message containing the suggested command
2. Frontend renders the command in a styled code block with an "Execute" button
3. User clicks "Execute" -> confirmation modal appears
4. User confirms -> frontend calls `POST /api/ai/execute` with the command
5. Backend executes via PowerShell engine, returns output
6. Output is appended to the conversation
7. Output is sent back to Claude as a follow-up message for analysis

Consider using Claude's **tool_use** capability to formalize this:

```javascript
const tools = [
  {
    name: "execute_powershell",
    description: "Execute a PowerShell command on the Azure Local cluster node",
    input_schema: {
      type: "object",
      properties: {
        command: {
          type: "string",
          description: "The PowerShell command to execute"
        },
        target_node: {
          type: "string",
          enum: ["dell-as01", "dell-as02", "any"],
          description: "Which cluster node to run the command on"
        }
      },
      required: ["command"]
    }
  }
];
```

### Streaming Responses
Use Claude's streaming API for the chat interface so responses appear in real-time:

```javascript
const stream = await anthropic.messages.stream({
  model: process.env.CLAUDE_MODEL,
  max_tokens: 4096,
  system: systemPrompt,
  messages: conversationHistory,
  tools: tools
});
```

Pipe the stream through a WebSocket or SSE connection to the frontend.

### Security Notes (Lab Context)
- This is a lab environment, but still store credentials in env vars, not in code
- The `.env` file should be in `.gitignore`
- The AI assistant should require user confirmation before executing any command
- Destructive operations (starting updates, rotating tokens) should have a confirmation step
- Do NOT expose this dashboard to the public internet

---

## Operational Context

### Known Issues and Lessons Learned
Include this knowledge in the AI assistant's context so it can help troubleshoot:

1. **KVA MOC tokens** expire after 1 year and do NOT auto-rotate by default. Token location: `C:\ClusterStorage\Infrastructure_1\Shares\SU1_Infrastructure_1\MocArb\WorkingDirectory\Appliance\kvatoken.tok`

2. **Entra ID SPN secrets** expire independently. The ARB SPN (App ID: `12c20bcd-43fe-4c8b-b582-c6a71cc026e8`) must be monitored.

3. **`az login` cannot run via remote PowerShell sessions** (WAC, Enter-PSSession) due to DPAPI delegation errors. It requires RDP or local console.

4. **Update orchestrator uses checkpoint-based resume** - failed updates retry from the last failed step.

5. **Multiple auth layers can mask deeper failures** - fixing one expired credential can reveal another underneath.

6. **RDP can get disabled by updates** - check `fDenyTSConnections` registry key and Remote Desktop firewall rules after applying updates.

7. **Authentication chain for ARB upgrades:**
   ```
   Layer 1: Azure Entra ID (SPN client secret)
       -> Layer 2: ARB VM / KVA (kvatoken.tok)
           -> Layer 3: MOC Cloud Agent (cloudlogin.yaml)
               -> Cluster Nodes
   ```

### Current Installed Extensions
- AdminCenter
- AzureEdgeDeviceManagement
- AzureEdgeRemoteSupport
- AzureEdgeTelemetryAndDiagnostics
- AzureEdgeLifecycleManager
- LcmController

### Current Update Baseline
- Platform: 11.2510.1002.93 (2025.10 Feature Update)
- SBE: Dell AX-16G-45n0c 4.1.2505.1504
- Pending: 2025.10 Cumulative Update (12.2510.1002.531) - may be installed by the time you read this

### Full Update History
| Update | Version | State |
|--------|---------|-------|
| SBE Dell AX-16G-45n0c | 4.1.2505.1504 | Installed |
| 2024.11 Feature Update | 10.2411.0.24 | Installed |
| 2025.01 Cumulative Update | 10.2411.2.12 | Installed |
| 2025.02 Cumulative Update | 10.2411.3.2 | Installed |
| 2025.03 Feature Update | 10.2503.0.13 | Installed |
| 2025.04 Feature Update v21 | 11.2504.1001.21 | Installed |
| 2025.09 Cumulative Update | 11.2509.1001.21 | Installed |
| 2025.10 Feature Update | 11.2510.1002.93 | Installed |
| 2025.10 Cumulative Update | 12.2510.1002.531 | Ready |

---

## Getting Started

1. Clone the repo
2. Copy `.env.example` to `.env` and fill in credentials
3. `docker-compose up --build`
4. Open `http://localhost:3000`

For development without Docker:
```bash
npm install
npm run dev        # Starts Vite dev server + Express backend concurrently
```

---

## Definition of Done

The project is complete when:
- [ ] Dashboard shows live node health status from the cluster
- [ ] Update management panel displays update history and available updates
- [ ] Credential monitor shows token/secret expiration status with visual warnings
- [ ] AKS panel shows basic cluster and node pool info
- [ ] AI chat interface connects to Claude API and can have conversations about the cluster
- [ ] AI can propose PowerShell commands and user can execute them with confirmation
- [ ] Command output feeds back into the AI conversation for analysis
- [ ] Everything runs in a single Docker container
- [ ] Dark theme ops dashboard look and feel
- [ ] Basic error handling and loading states throughout
