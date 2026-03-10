# Azure Local AI Operations Dashboard

An AI-powered operations dashboard for managing an Azure Local (formerly Azure Stack HCI) cluster. Integrates with the Claude API to provide an intelligent assistant that can interrogate, orchestrate, and plan maintenance for the Azure Local environment.

## Version

**v1.1.0** — AKS Arc deployment support, K8s manifests, and deployment automation.

## Architecture

```
+--------------------------------------------------+
|  Container (Docker / AKS Pod)                     |
|                                                   |
|  +--------------------------------------------+  |
|  |  React Frontend (Vite + TypeScript)         |  |
|  |  - Dashboard UI (dark theme)                |  |
|  |  - Update Status Panel                      |  |
|  |  - Health Monitoring                        |  |
|  |  - AI Chat Interface                        |  |
|  |  - Maintenance Planner                      |  |
|  +--------------------------------------------+  |
|                    |                              |
|  +--------------------------------------------+  |
|  |  Python / Flask Backend API                 |  |
|  |  - REST endpoints for cluster ops           |  |
|  |  - PowerShell execution (WinRM / PyWinRM)   |  |
|  |  - Claude API integration (Anthropic SDK)   |  |
|  |  - Gunicorn + gevent workers                |  |
|  +--------------------------------------------+  |
|                    |                              |
+--------------------------------------------------+
         |                           |
         v                           v
+------------------+    +-------------------------+
|  Azure Local     |    |  Claude API             |
|  Cluster         |    |  (Anthropic)            |
|  via WinRM       |    |  AI Assistant           |
+------------------+    +-------------------------+
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, TypeScript, Vite, Tailwind CSS, Recharts, Lucide React |
| Backend | Python 3.12, Flask 3.1, Gunicorn (gevent), Anthropic SDK 0.43 |
| Remote Execution | PyWinRM (WinRM over HTTPS to Azure Local nodes) |
| Container | Multi-stage Docker (Node 20 Alpine build + Python 3.12 Slim runtime) |
| Orchestration | Kubernetes (AKS Arc on Azure Local) |
| Registry | Azure Container Registry (cravsnetmon.azurecr.io) |

## Target Cluster

| Property | Value |
|----------|-------|
| Cluster Name | azurestack01 |
| Domain | presidiorocks.com |
| Node 1 | dell-as01.presidiorocks.com |
| Node 2 | dell-as02.presidiorocks.com |
| Hardware | 2x Dell AX-660 (32 cores, 1024 GB RAM) |
| Resource Group | rg-azurestack |
| Subscription | Presidio Sandbox |
| AKS Cluster | Azurelocal-AKS |

## Features

- **Cluster Health Dashboard** — Real-time node status, CPU/memory usage, storage health, VM inventory
- **Update Management** — View update history, available updates, apply updates with confirmation
- **Credential & Token Monitor** — Track KVA MOC token expiry, Entra ID SPN secrets, MOC login health
- **AKS / Kubernetes Panel** — AKS Arc cluster status, node pools, available K8s versions
- **Extensions Monitor** — Installed Azure Local extensions and their status
- **AI Assistant (Claude)** — Context-aware chat that can propose and execute PowerShell commands with user approval
- **Settings** — System overview, configuration display

## Project Structure

```
azure-local-dashboard/
├── Dockerfile              # Multi-stage build (Node + Python)
├── docker-compose.yml      # Local development with Docker
├── .env.example            # Environment variable template
├── frontend/               # React/Vite/TypeScript frontend
│   ├── package.json
│   ├── vite.config.ts
│   ├── tailwind.config.js
│   └── src/
│       ├── components/     # UI components (dashboard, updates, ai, etc.)
│       ├── pages/          # Route pages
│       ├── hooks/          # React Query hooks
│       ├── services/       # API client
│       └── types/          # TypeScript types
├── backend/                # Python/Flask backend
│   ├── requirements.txt
│   ├── app.py              # Flask app factory
│   ├── wsgi.py             # Gunicorn entry point
│   ├── config.py           # Configuration
│   ├── routes/             # API route handlers
│   ├── services/           # Business logic (PowerShell, Claude, etc.)
│   ├── auth/               # Authentication
│   ├── models/             # Data models
│   └── utils/              # Utilities
├── k8s/                    # Kubernetes manifests for AKS deployment
│   ├── namespace.yaml      # azure-local-ops namespace
│   ├── deployment.yaml     # Pod spec, health probes, resource limits
│   ├── service.yaml        # LoadBalancer on port 80
│   ├── pvc.yaml            # 1Gi persistent volume for data
│   └── deploy.sh           # Automated deployment script
└── data/                   # Persistent data (conversations, cache)
```

## Quick Start

### Local Development (Docker Compose)

```bash
# 1. Clone and configure
cd azure-local-dashboard
cp .env.example .env
# Edit .env with your credentials

# 2. Build and run
docker-compose up --build

# 3. Access at http://localhost:5230
```

### AKS Arc Deployment

See [AKS-DEPLOYMENT-GUIDE.md](AKS-DEPLOYMENT-GUIDE.md) for the full step-by-step walkthrough.

Quick deploy (if prerequisites are already met):

```bash
cd k8s
bash deploy.sh
```

## Environment Variables

| Variable | Description |
|----------|-------------|
| `ANTHROPIC_API_KEY` | Claude API key |
| `CLAUDE_MODEL` | Model to use (default: claude-sonnet-4-20250514) |
| `AZURELOCAL_NODE1` | First cluster node FQDN |
| `AZURELOCAL_NODE2` | Second cluster node FQDN |
| `AZURELOCAL_DOMAIN` | Active Directory domain |
| `AZURELOCAL_CLUSTER` | Cluster name |
| `AZURELOCAL_USERNAME` | Admin username |
| `AZURELOCAL_PASSWORD` | Admin password |
| `AZURE_SUBSCRIPTION_ID` | Azure subscription ID |
| `AZURE_RESOURCE_GROUP` | Azure resource group |
| `AZURE_TENANT_ID` | Azure tenant ID |
| `PORT` | Application port (default: 5230) |

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/health` | GET | Backend health check |
| `/api/config` | GET | Non-sensitive cluster config |
| `/api/cluster/status` | GET | Overall cluster health |
| `/api/cluster/nodes` | GET | Node details and health |
| `/api/cluster/storage` | GET | Storage pools and virtual disks |
| `/api/updates` | GET | List all updates and states |
| `/api/updates/current` | GET | Active update run progress |
| `/api/updates/start` | POST | Trigger ready update |
| `/api/credentials/status` | GET | Token/secret expiration status |
| `/api/credentials/repair-moc` | POST | Run Repair-MocLogin |
| `/api/credentials/rotate-kva` | POST | Rotate KVA token |
| `/api/aks/clusters` | GET | List AKS clusters |
| `/api/extensions` | GET | List installed extensions |
| `/api/ai/chat` | POST | Send message to Claude (streaming) |
| `/api/ai/execute` | POST | Execute AI-proposed PowerShell command |

## AI Safety Rules

The AI assistant enforces hard safety rules at three layers (system prompt, backend validation, frontend UI):

1. **No infrastructure destruction** — Never delete/destroy VMs, disks, clusters, or Azure resources
2. **No security disablement** — Never remove RBAC, disable firewalls, purge Key Vault secrets
3. **Power operation warnings** — Always warn about impact before stop/deallocate/restart
4. **Dry-run by default** — State-modifying commands must include `--what-if` / `--dry-run` flags
5. **Observe and advise** — Prefer `Get-*`, `Test-*`, `Show-*` over destructive actions

## Changelog

### v1.1.0 (2026-03-10)
- Added Kubernetes manifests for AKS Arc deployment (`k8s/`)
- Automated deployment script (`deploy.sh`) with ACR pull secret and env secret creation
- LoadBalancer service for external access
- Persistent volume claim for data storage
- Health and readiness probes on deployment
- AKS deployment guide documentation

### v1.0.0 (2026-03-09)
- Initial release
- React/Vite frontend with dark theme ops dashboard
- Python/Flask backend with WinRM PowerShell execution
- Claude AI assistant integration with tool use
- Cluster health dashboard, update management, credential monitoring
- AKS panel, extensions panel, settings page
- Docker multi-stage build (Node 20 Alpine + Python 3.12 Slim)
- Docker Compose for local development
