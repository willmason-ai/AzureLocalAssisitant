# What Was Done Today - Azure Local AI Operations Dashboard

## About the App

The **Azure Local AI Operations Dashboard** is a custom-built, Dockerized web application that serves as an AI-powered operations center for managing a two-node Azure Local (formerly Azure Stack HCI) cluster. It's deployed on AKS Arc running on the same Azure Local infrastructure it monitors.

### What it does:
- **Real-time cluster health monitoring** — Displays live node status, CPU, memory, uptime, storage pools, VM counts, and health faults for a two-node Dell AX-660 Azure Local cluster (dell-as01/dell-as02)
- **Update lifecycle management** — Visual timeline of all platform updates (installed, pending, in-progress), with the ability to trigger updates directly from the UI
- **Credential and token health monitoring** — Tracks expiration of KVA MOC tokens, Entra ID SPN secrets, MOC login health, and Azure Stack HCI registration status with red/yellow/green visual warnings
- **AI-powered operations assistant** — Embedded Claude AI chat that has full context of the cluster environment, can propose and execute PowerShell commands (with user approval), and assists with troubleshooting and maintenance planning
- **Extensions monitoring** — Shows installed Azure Arc extensions and their status via Azure REST API
- **AKS/Kubernetes management** — Monitors AKS clusters running on the Azure Local infrastructure

### Tech stack:
- **Frontend**: React 18 + TypeScript + Vite + Tailwind CSS (dark theme ops dashboard)
- **Backend**: Python/Flask with WinRM-based PowerShell execution engine
- **AI**: Claude API (Anthropic) with tool use for interactive cluster interrogation
- **Infrastructure**: Docker container deployed to AKS Arc on Azure Local, pulling from Azure Container Registry
- **Real-time**: WebSocket push via Flask-SocketIO for instant UI updates when cluster state changes

### Architecture highlights:
- Cache-first architecture with background scheduler — PowerShell commands run on schedule, results cached, routes serve from cache for instant page loads
- Parallel PowerShell execution via ThreadPoolExecutor to reduce WinRM overhead
- React Query + WebSocket invalidation for real-time updates without polling
- Code-split lazy-loaded pages for fast initial load
- Secure by design: AI safety rules enforced at three layers (system prompt, backend validation, frontend UI), no destructive commands allowed

---

## Work Completed Today

### Version: 2.3.1 -> 2.4.0 -> 2.5.0

### 00. Updates Timeline Fix + Kubernetes Workloads + Init Container Fix (v2.5.0)

**Updates Timeline (FIX-002)**:
- Superseded/skipped updates were incorrectly shown as "Installing" with pulsing blue indicators
- States like `HasPrerequisite`, `NotApplicableBecauseAnotherUpdateIsInProgress`, `Recalled`, `Invalid`, and all `*Failed` states now render as grey with appropriate labels ("Skipped", "Superseded", "Recalled", "Failed")
- Only truly actionable updates (Ready, Downloading, Preparing, Installing) now pulse

**Kubernetes Workloads Page (FIX-004)**:
- Completely rebuilt the Kubernetes page to show live workload data via the in-cluster Kubernetes API (no `az login` required)
- Summary cards: namespace count, deployment count, pod count, running pods, unique images
- Deployments section: shows each deployment with namespace, ready/replica counts, and container images
- Pods section: grouped by namespace, showing container images, state, restart counts, and node assignment
- Container images section: full list of all unique images running on the cluster
- Added RBAC `ClusterRole` + `ClusterRoleBinding` (`k8s/rbac.yaml`) granting read-only access to pods, deployments, namespaces, services, replicasets, daemonsets, and statefulsets
- Auto-refreshes every 30 seconds

**Init Container Fix (FIX-001)**:
- The `fix-data-permissions` init container was failing with `CreateContainerConfigError` because its `runAsUser: 0` conflicted with the pod-level `runAsNonRoot: true` security context
- Added `runAsNonRoot: false` to the init container's securityContext to override the pod-level policy
- Re-applied `deployment.yaml` (previous deploys only used `kubectl rollout restart` which doesn't pick up manifest changes)

**Tracking**:
- Created `FIXES-TODO.md` to track open issues (caching performance, API key persistence across restarts)

### 0. Sidebar Reorder + AI API Key Settings (v2.4.0)
- **Sidebar reorder**: Moved "AI Assistant" from position 6 to position 2 (below Dashboard, above Updates) for faster access to the AI chat
- **AI Configuration in Settings**: Added a new "AI Configuration" section to the Settings page that allows configuring the Anthropic API key directly from the UI instead of requiring environment variable changes and container restarts
  - Shows current key status (masked display, source: environment vs user-configured)
  - Password input with show/hide toggle for entering new keys
  - Validates key format (must start with `sk-ant-`)
  - Stores key encrypted (AES-256-GCM) in the credential store, persisted across restarts
  - Hot-reloads the Claude AI service at runtime — no restart needed
  - On startup, checks for a stored key and uses it over the env var
- **Backend changes**: Added `GET /api/settings/ai-config` and `PUT /api/settings/ai-config` endpoints, plus `update_api_key()` method on `ClaudeAIService`

### 1. Major Performance Overhaul (v2.3.0)
Addressed the primary complaint that the dashboard was slow due to PowerShell-driven data fetching:

- **Cache-first architecture**: Built a background scheduler that pre-fetches all cluster data (health, storage, VMs, updates, credentials) on configurable intervals. API routes now serve from cache with TTL checks instead of running live PowerShell commands on every request.
- **Parallel PowerShell execution**: Added `execute_parallel()` method using `concurrent.futures.ThreadPoolExecutor` so multiple WinRM commands run simultaneously instead of sequentially (e.g., cluster status + health faults + storage in one batch).
- **WinRM connection pooling**: Implemented session caching with 300-second expiry and auto-retry on stale sessions, eliminating the 3-10 second TCP+TLS+NTLM handshake overhead on every command.
- **WebSocket push updates**: Integrated Flask-SocketIO on the backend and socket.io-client on the frontend. When the scheduler refreshes cached data, it emits `cluster_update` events that instantly invalidate the matching React Query cache keys — the UI updates in real-time without waiting for the next polling interval.
- **Frontend code splitting**: Converted all page imports to `React.lazy()` with `<Suspense>` boundaries, plus Vite `manualChunks` configuration to split vendor bundles (react, tanstack-query, recharts, markdown) for faster initial load.

### 2. Bug Fix: Updates Page Crash (v2.3.0)
- **Root cause**: PowerShell's `ConvertTo-Json` serializes .NET enums as integers. The `State` field on update objects was arriving as `7` instead of `"Installed"`, causing `(O.State || "").toLowerCase()` to throw "is not a function" on a number.
- **Fix**: Added `SOLUTION_UPDATE_STATE` and `SOLUTION_UPDATE_RUN_STATE` enum resolution maps in the backend (`backend/utils/enums.py`). All update routes now resolve numeric enum values to human-readable strings before sending to the frontend.

### 3. Bug Fix: Update Timeline State Display (v2.3.1)
- **Problem**: The Update Timeline component showed states like "Installing" and "HasPrerequisite" for updates that are actually fully installed, because the enum resolution was mapping correctly but the timeline visualization didn't handle all possible state strings.
- **Fix**: Updated `UpdateTimeline.tsx` state icon and dot color functions to handle the full set of states: HasPrerequisite, Preparing, Installing, HealthChecking, ScanInProgress, ReadyToInstall, and more. Added `String()` coercion around all `.toLowerCase()` calls as a safety net.

### 4. New Feature: Platform Version Display on Dashboard (v2.3.1)
- **Problem**: The current platform version was only visible on the Updates page. Users wanted it prominently displayed on the main dashboard.
- **Fix**: Added platform version display to the Cluster Health summary card on the Dashboard page. It pulls the highest-version installed update from the updates API and shows it as "Platform: v11.2510.1002.93" with a server icon.

### 5. Bug Fix: AI Assistant 500 Error (v2.3.1)
- **Root cause**: `PermissionError: [Errno 13] Permission denied: '/app/data/conversations'`. The Kubernetes PVC mount at `/app/data` overwrites the directory created during Docker build. The container runs as uid 1000 but the PVC volume has root ownership.
- **Fix**: Added an `initContainer` to the Kubernetes deployment that runs as root (busybox) to `mkdir -p /app/data/conversations && chown -R 1000:1000 /app/data` before the main container starts.

### 6. Version Auto-Increment System
- Set up version display in the sidebar showing the current app version (pulled from package.json at build time via Vite's `define` plugin)
- Bumped from 2.3.0 to 2.3.1 with this deploy
- Version is now tagged on both Docker images (`:latest` and `:2.3.1`)

### 7. Deployment Pipeline
- Full pipeline executed: git commit -> git push -> Docker build -> ACR push -> AKS rolling restart
- App is live on AKS Arc at the cluster's LoadBalancer IP

### Previously completed (earlier today):
- Fixed 26 bugs from a comprehensive bug report (enum resolution, credential page fixes, hardcoded values, error handling improvements, audit logging, etc.)
- Added version number display in the UI sidebar
- Multiple build/push/deploy cycles throughout the day

---

## Current State
- **Version**: 2.5.0
- **Deployed to**: AKS Arc (Azurelocal-AKS cluster, namespace: azure-local-ops)
- **Container Registry**: cravsnetmon.azurecr.io/azure-local-dashboard:2.5.0
- **Status**: Live and operational
- **Remaining roadmap items**: History/data retention (SQLite), Extensions page Azure API rewrite, caching performance improvements, time display in header
