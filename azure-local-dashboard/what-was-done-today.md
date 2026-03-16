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

## Work Completed Today (March 16, 2026)

### Version: 2.3.1 → 2.4.0 → 2.5.0 → 2.5.1 → 2.6.0 → 2.6.1 → 2.6.2 → 2.7.0 → 2.7.1

---

### v2.7.1 — AI Chat Streaming Performance

**Text delta batching**:
- Replaced per-delta React state updates with a batched flush approach — text deltas accumulate in a ref and flush to state every 50ms
- Dramatically reduces React re-renders during streaming (from hundreds of updates to ~20/sec)
- Proper cleanup on unmount, final flush on stream end to ensure no text is lost

**Streaming-aware markdown rendering**:
- While streaming: messages render as plain `<p>` text with a pulsing cursor — no markdown parsing overhead during active typing
- After streaming completes: full ReactMarkdown + Prism syntax highlighting kicks in
- `isLastAndStreaming` prop passed from ChatInterface to ChatMessage controls the switch

**Memoized markdown renderer**:
- Wrapped the full ReactMarkdown component in `React.memo()` (`RenderedMarkdown` component) — prevents re-rendering completed messages when new messages arrive or state changes elsewhere in the chat

---

### v2.7.0 — Get-VM Multi-Node Awareness

**Auto-expand Get-VM to query both cluster nodes**:
- `Get-VM` only returns VMs on the local node it runs on — this was causing the AI to report incomplete VM lists
- Added `_is_get_vm_command()` detection and `_execute_on_all_nodes()` to `claude_ai.py` — when the AI runs `Get-VM` with `target_node="any"`, the backend automatically queries both dell-as01 and dell-as02 and merges results
- Scheduler's `_check_cluster_vms()` also updated to query both nodes and merge
- System prompt updated with guidance on host-local vs cluster-wide commands

---

### v2.6.2 — Dashboard Crash Fix

**Fix: `l.toLowerCase is not a function` crash on Dashboard**
- **Root cause**: `node.Name?.toLowerCase()` on DashboardPage.tsx — optional chaining only guards against `null`/`undefined`, not against calling `.toLowerCase()` on a non-string value (e.g., a number returned by PowerShell). The minified `l` in the error was the minified variable for `node.Name`.
- **Fix**: Wrapped with `String(node.Name ?? '').toLowerCase()` to safely coerce any PowerShell return type to a string before calling string methods.
- Audited all `.toLowerCase()` calls across the frontend — all other locations were already protected with `String()` wrapping from previous fixes.

---

### v2.6.1 — Collapsible AI Command Output

**Collapsible tool results in AI chat**:
- Command output from executed PowerShell commands is now rendered as collapsible sections in the chat, collapsed by default
- Each section shows a summary bar: "Command Output (24 lines, JSON)" with expand/collapse toggle
- When expanded, shows full syntax-highlighted output with copy button
- Keeps the chat clean — users see Claude's humanized analysis by default and can drill into raw output when needed
- Changed `useAIChat.ts` to store tool results separately from message content (in `toolResults` array)
- Added `CollapsibleOutput` component to `ChatMessage.tsx` with ChevronDown/ChevronRight/Terminal icons

---

### v2.6.0 — AI Output Humanization + Update Data Fixes

**PowerShell output humanization for AI chat**:
- Added `_humanize_ps_output()` function to `claude_ai.py` that transforms raw PowerShell JSON into human-readable text
- Converts byte fields (MemoryAssigned, Size, AllocatedSize, etc.) to GB/MB with `_format_bytes()`
- Resolves .NET integer enums to labels: VM states (Running/Off/Saved/Paused), cluster node states (Up/Down/Paused), disk health/operational status
- Formats .NET TimeSpan objects to "3d 14h 22m" strings with `_format_timespan()`
- Pretty-prints with 2-space indent for readability

**Updates page data accuracy**:
- Fixed false "Update Available" badge — the 2025.10 Cumulative Update (12.2510.1002.531) was already installed but static data still showed it as "Ready"
- Updated KNOWN_UPDATES to include the 2025.10 Cumulative Update as "Installed" with InstalledDate
- Added install dates and descriptions to all static update entries
- Added update timeline with date display for each update entry (Calendar icon + formatted date)
- Added `StaticDataBanner` component with instructions for getting exact dates via RDP, including copyable PowerShell commands

---

### v2.5.1 — Stale-While-Revalidate Caching + Worker Dedup

**Caching Performance (FIX-003)**:
- Routes were falling through to live PowerShell (2-5s) whenever cache TTL expired, causing visible page load delays
- Implemented stale-while-revalidate pattern: all routes (`cluster.py`, `updates.py`, `credentials.py`) now serve cached data immediately if any cache exists (`has_cache()` instead of TTL check)
- Background scheduler continues refreshing data on its own intervals — users never wait for PowerShell
- Only cold starts (before scheduler warms up) fall through to live queries
- Added static fallback data (KNOWN_UPDATES, KNOWN_HISTORY) for Updates page — never blocks on live PowerShell even on cold start

**Gunicorn Worker Deduplication**:
- Discovered 4 Gunicorn workers were each starting their own `HealthScheduler`, quadrupling WinRM calls to the cluster
- Reduced to 1 worker with gevent async (`--workers 1 --worker-class gevent --worker-connections 200`)
- Gevent handles concurrency via greenlets — no loss in throughput, 75% reduction in WinRM load

**Node failover for update commands**:
- Added `_execute_with_node_failover()` method to scheduler — tries both cluster nodes for update commands
- Increased timeout from 60s to 120s for update commands
- `Get-SolutionUpdate` cmdlets still consistently fail via remote WinRM/SSH (OOM killed) — static fallback data ensures the page always loads

---

### v2.5.0 — Updates Timeline Fix + Kubernetes Workloads + Init Container Fix

**Updates Timeline (FIX-002)**:
- Superseded/skipped updates were incorrectly shown as "Installing" with pulsing blue indicators
- States like `HasPrerequisite`, `NotApplicableBecauseAnotherUpdateIsInProgress`, `Recalled`, `Invalid`, and all `*Failed` states now render as grey with appropriate labels

**Kubernetes Workloads Page (FIX-004)**:
- Completely rebuilt the Kubernetes page to show live workload data via the in-cluster Kubernetes API
- Summary cards: namespace count, deployment count, pod count, running pods, unique images
- Deployments and pods sections with full detail
- Added RBAC ClusterRole + ClusterRoleBinding for read-only access

**Init Container Fix (FIX-001)**:
- Fixed `CreateContainerConfigError` — init container's `runAsUser: 0` conflicted with pod-level `runAsNonRoot: true`

---

### v2.4.0 — Sidebar Reorder + AI API Key Settings

- **Sidebar reorder**: Moved "AI Assistant" from position 6 to position 2 (below Dashboard, above Updates)
- **AI Configuration in Settings**: Added UI for configuring the Anthropic API key — encrypted storage (AES-256-GCM), hot-reload without restart, masked display

---

### v2.3.1 — Bug Fixes + Platform Version Display

- Fixed Update Timeline state display for all PowerShell enum states
- Added platform version display to Dashboard cluster health card
- Fixed AI Assistant 500 error (permission denied on `/app/data/conversations` — added init container)
- Version auto-increment system with sidebar display

---

### v2.3.0 — Major Performance Overhaul

- Cache-first architecture with background scheduler
- Parallel PowerShell execution via ThreadPoolExecutor
- WinRM connection pooling with 300s expiry
- WebSocket push updates via Flask-SocketIO
- Frontend code splitting with React.lazy()
- Fixed Updates page crash (PowerShell numeric enum resolution)

---

### Previously completed (earlier in the week):
- Fixed 26 bugs from a comprehensive bug report
- Added version number display in UI sidebar
- Multiple build/push/deploy cycles

---

## Current State
- **Version**: 2.7.1
- **Deployed to**: AKS Arc (Azurelocal-AKS cluster, namespace: azure-local-ops)
- **Container Registry**: cravsnetmon.azurecr.io/azure-local-dashboard (latest tag TBD — v2.6.0+ changes are uncommitted)
- **Git status**: Last commit is v2.5.1 (`909b9c8`). All changes from v2.6.0 through v2.7.1 are modified but **not yet committed**.
- **Total versions worked on today**: 9 (2.3.1 → 2.7.1)
- **Versions committed**: 2.3.1, 2.4.0, 2.5.0, 2.5.1
- **Versions uncommitted**: 2.6.0, 2.6.1, 2.6.2, 2.7.0, 2.7.1
