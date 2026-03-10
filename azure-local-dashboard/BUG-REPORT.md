# Bug Report — Azure Local AI Operations Dashboard v1.1.0

**Date:** 2026-03-10
**Audited By:** Automated code review (Claude)
**Scope:** Full-stack audit — frontend, backend, Docker, Kubernetes manifests

---

## Summary

| Severity | Count |
|----------|-------|
| Critical | 2 |
| High | 12 |
| Medium | 22 |
| Low | 10 |
| **Total** | **46** |

---

## Critical

### BUG-001: Command Injection via URL Parameters (Backend)
- **File:** `backend/routes/aks.py` lines 27, 40-41
- **Description:** URL path parameters (`name`, `cluster`) are interpolated directly into `az` CLI commands without sanitization. An attacker could inject shell metacharacters (`;`, `|`, `&&`) to execute arbitrary commands on the host.
- **Example:** `GET /api/aks/clusters/foo;rm -rf /` would inject into the shell command.
- **Fix:** Validate inputs against an allowlist regex (alphanumeric + hyphens only), or use parameterized command construction.

### BUG-002: Command Injection via JSON Request Body (Backend)
- **File:** `backend/routes/credentials.py` line 79
- **Description:** The `validity_days` parameter from the request body is interpolated directly into a PowerShell command string. No type validation or escaping is performed.
- **Example:** `{"validity_days": "365; Remove-VM -Name *"}` would inject into the PowerShell command.
- **Fix:** Cast `validity_days` to `int`, validate range (1-3650), reject non-numeric values.

---

## High

### BUG-003: Path Traversal via Conversation ID (Backend)
- **File:** `backend/routes/ai.py` line 18, `backend/services/claude_ai.py` line 333
- **Description:** The `conversation_id` from the request body is used to construct file paths (`{conversation_id}.json`) without sanitization. A value like `../../../etc/passwd` could read or overwrite arbitrary files.
- **Fix:** Validate conversation ID format (alphanumeric + hyphens only), use `pathlib.resolve()` and verify the path stays within the data directory.

### BUG-004: SSH Command Injection (Backend)
- **File:** `backend/services/powershell.py` line 234
- **Description:** When executing PowerShell over SSH, commands are wrapped in double quotes without escaping. A command containing `"` followed by `|` could break out of the quoted string.
- **Fix:** Properly escape double quotes and special characters, or use base64-encoded command blocks.

### BUG-005: Weak Default Credentials (Backend)
- **File:** `backend/config.py` lines 6, 11
- **Description:** Default dashboard password is `admin` and default credential master key is `change-me-in-production`. If environment variables are not set, the dashboard is effectively unprotected.
- **Fix:** Require these values via environment variables — refuse to start if not explicitly set. Remove hardcoded defaults.

### BUG-006: Cleartext Credentials in Memory and Logs (Backend)
- **File:** `backend/services/powershell.py` lines 94-95, 112
- **Description:** The `AZURELOCAL_PASSWORD` is stored as a plaintext string in the executor instance. Command logging truncates to 100 chars but could still expose credentials in log output.
- **Fix:** Mask sensitive values in logs. Consider using a credential provider pattern instead of holding passwords in memory.

### BUG-007: PORT Configuration Mismatch Across Files
- **Files:** `backend/config.py` line 36 (default 3000), `backend/wsgi.py` line 6 (hardcoded 3000), `.env.example` (PORT=3000), `Dockerfile` (EXPOSE 5230), `docker-compose.yml` (5230:5230), `k8s/service.yaml` (targetPort 5230)
- **Description:** The backend config defaults to port 3000, but the Dockerfile, docker-compose, and K8s manifests all use 5230. If a user doesn't set `PORT=5230` in `.env`, the Flask dev server binds to port 3000 while Gunicorn binds to 5230, causing confusion. The `.env.example` template still shows `PORT=3000`.
- **Fix:** Update `config.py` default to 5230, update `.env.example` to `PORT=5230`, update `wsgi.py` to use `app.config.get('PORT', 5230)`.

### BUG-008: Debug Mode Enabled in Production Entry Point (Backend)
- **File:** `backend/wsgi.py` line 6
- **Description:** `app.run(debug=True)` is set in the WSGI module. While Gunicorn overrides this in Docker, if the app is run directly via `python -m backend.wsgi`, debug mode exposes stack traces, enables the interactive debugger, and allows remote code execution via the Werkzeug debugger console.
- **Fix:** Set `debug=False` or use `debug=os.getenv('FLASK_DEBUG', 'false').lower() == 'true'`.

### BUG-009: JWT Secret Differs Across Workers (Backend)
- **File:** `backend/config.py` line 7
- **Description:** `JWT_SECRET = os.getenv('JWT_SECRET', os.urandom(32).hex())` generates a random secret at import time. In a multi-worker Gunicorn deployment (4 workers), each worker process gets a different random secret, so a JWT token issued by one worker is rejected by another.
- **Fix:** Require `JWT_SECRET` as an environment variable. If not set, generate once and write to a shared file, or refuse to start.

### BUG-010: Hardcoded Azure Resource Names in Backend Routes
- **Files:** `backend/routes/extensions.py` lines 16, 26; `backend/routes/aks.py` lines 14, 54; `backend/routes/credentials.py` line 47
- **Description:** Resource group (`rg-azurestack`), ARB appliance name (`azurestack01-arcbridge`), and other Azure identifiers are hardcoded throughout the route handlers instead of reading from configuration.
- **Fix:** Read these values from `current_app.config` (which loads from env vars). Add `AZURE_ARB_NAME`, etc. to config.

### BUG-011: CommandBlock Defaults to "Safe" on Safety Check Failure (Frontend)
- **File:** `frontend/src/components/ai/CommandBlock.tsx` lines 34-36
- **Description:** If the `/api/ai/safety-check` API call fails (network error, timeout, backend down), the catch handler sets the safety status to `{ level: 'safe', allowed: true }`. This means a dangerous command could be marked as safe simply because the safety check endpoint was unreachable.
- **Fix:** Default to `{ level: 'danger', allowed: false, reason: 'Safety check unavailable' }` on failure.

### BUG-012: No Error States Displayed on Any Page (Frontend)
- **Files:** `frontend/src/pages/DashboardPage.tsx`, `UpdatesPage.tsx`, `CredentialsPage.tsx`, `KubernetesPage.tsx`, `ExtensionsPage.tsx`
- **Description:** All pages check `isLoading` to show a spinner, but none check `isError` or `error` from React Query. If the backend is unreachable or returns errors, the pages silently show empty content with no indication that data failed to load.
- **Fix:** Add error state handling to all pages — check `isError` and display an error banner with retry option.

### BUG-013: Scheduler Never Started (Backend)
- **File:** `backend/app.py` line 27
- **Description:** The scheduler service (for periodic health checks and credential monitoring) is initialized as `app._scheduler = None` but never instantiated or started. The health check and credential expiry monitoring cron jobs defined in `backend/services/scheduler.py` never execute.
- **Fix:** Instantiate and start the scheduler in the app factory, guarded by a config flag.

---

## Medium

### BUG-014: CORS Allows All Origins (Backend)
- **File:** `backend/app.py` line 21
- **Description:** `CORS(app, resources={r"/api/*": {"origins": "*"}})` allows any website to make authenticated API requests to the dashboard. If a user is logged in, a malicious site in another tab could call the dashboard API.
- **Fix:** Restrict origins to the dashboard's own URL or a configured allowlist.

### BUG-015: No Rate Limiting on Login Endpoint (Backend)
- **File:** `backend/auth/routes.py` lines 11-32
- **Description:** The `/api/auth/login` endpoint has no rate limiting. An attacker can brute-force the dashboard password with unlimited speed.
- **Fix:** Add rate limiting (e.g., `flask-limiter`) — 5 attempts per minute per IP.

### BUG-016: SSL Certificate Validation Disabled for WinRM (Backend)
- **File:** `backend/services/powershell.py` line 194
- **Description:** `server_cert_validation='ignore'` disables TLS certificate verification for WinRM connections, making them vulnerable to man-in-the-middle attacks.
- **Fix:** For lab use this is acceptable but should be documented. For production, configure proper certificate trust.

### BUG-017: SSH Connection Leak on Partial Failure (Backend)
- **File:** `backend/services/powershell.py` lines 221-258
- **Description:** The SSH execution path uses a broad `except Exception` catch. If `connect()` succeeds but `exec_command()` fails, the `client.close()` in the success path is skipped, leaking the SSH connection.
- **Fix:** Use a `try/finally` block to ensure `client.close()` is always called.

### BUG-018: JSON Parse Failure Returns Raw String (Backend)
- **File:** `backend/services/powershell.py` lines 260-269
- **Description:** When PowerShell output fails JSON parsing, `_parse_output()` returns the raw text string instead of `None` or raising an error. Callers expect either parsed JSON objects/lists or `None`, not a string. This causes type mismatches in the frontend.
- **Fix:** Return `None` on parse failure and log the raw output for debugging. Or wrap in a structured error object.

### BUG-019: No Input Validation on AI Message Content (Backend)
- **File:** `backend/routes/ai.py` lines 14-16
- **Description:** The `message` field is checked for presence but not type. Sending `"message": 12345` or `"message": []` would pass validation and be forwarded to the Claude API, potentially causing errors.
- **Fix:** Validate that `message` is a non-empty string.

### BUG-020: No Type Validation on Tool Execution Fields (Backend)
- **File:** `backend/routes/ai.py` lines 47-62
- **Description:** The tool execution endpoint checks field presence but not types. `tool_input` could be a string instead of a dict, causing `.get()` to fail. `conversation_id` could be an integer instead of a string.
- **Fix:** Validate types for all required fields.

### BUG-021: Dry-Run Not Enforced at Backend Level (Backend)
- **File:** `backend/services/claude_ai.py` lines 145-152
- **Description:** The system prompt instructs Claude to use `--what-if` / `--dry-run` flags for state-modifying commands, but the backend doesn't verify this. Claude could propose a command without the flag and the backend would execute it.
- **Fix:** Add backend validation for known state-modifying commands — check for `--what-if` / `-WhatIf` / `--dry-run` flags before execution.

### BUG-022: Hardcoded File Paths for Cluster Resources (Backend)
- **Files:** `backend/routes/credentials.py` lines 17-18, `backend/services/scheduler.py` lines 56-57, `backend/services/claude_ai.py` lines 316-317
- **Description:** Windows file paths like `C:\ClusterStorage\Infrastructure_1\Shares\SU1_Infrastructure_1\MocArb\WorkingDirectory\Appliance\kvatoken.tok` are hardcoded in multiple files.
- **Fix:** Move to a configuration constant or environment variable.

### BUG-023: Incomplete Command Logging for Audit Trail (Backend)
- **File:** `backend/services/powershell.py` line 112
- **Description:** Only the first 100 characters of executed commands are logged. For security auditing, the full command text should be recorded.
- **Fix:** Log full command text to a dedicated audit log file (with appropriate access controls).

### BUG-024: CVE Checker Endpoint Returns Placeholder (Backend)
- **File:** `backend/routes/updates.py` lines 85-89
- **Description:** The `/api/updates/cve` endpoint exists but always returns `{'cves': [], 'message': 'CVE checking not yet configured'}`. The `CVEChecker` class is implemented in `backend/services/cve_checker.py` but never wired up.
- **Fix:** Wire up the CVE checker service to the endpoint, or remove the endpoint if not planned.

### BUG-025: Hardcoded Cluster Values in Frontend (Frontend)
- **Files:** `frontend/src/components/layout/Sidebar.tsx` line 31 (`azurestack01`), line 38 (`presidiorocks.com`); `frontend/src/pages/DashboardPage.tsx` lines 38-39 (`totalCores={32}`, `totalRamGB={1024}`)
- **Description:** Cluster name, domain, total cores, and total RAM are hardcoded in the frontend instead of being fetched from the `/api/config` endpoint.
- **Fix:** Fetch from the config API and display dynamically.

### BUG-026: No Error Handling for AI Chat Streaming (Frontend)
- **File:** `frontend/src/hooks/useAIChat.ts` line 39-40
- **Description:** If the SSE fetch fails (network error, timeout), the error is appended as text to the last message but there is no retry mechanism or clear error state for the user.
- **Fix:** Add proper error state handling, display a retry button, and distinguish between network errors and API errors.

### BUG-027: Silent SSE Parse Failures (Frontend)
- **File:** `frontend/src/hooks/useAIChat.ts` line 51
- **Description:** Malformed SSE events are caught and silently discarded (`catch { /* Skip malformed events */ }`). If the backend sends corrupt data, the user has no visibility into the problem.
- **Fix:** Log parse failures to console and track error count. If multiple consecutive failures occur, surface an error to the user.

### BUG-028: Orphaned Assistant Message on Tool Call Failure (Frontend)
- **File:** `frontend/src/hooks/useAIChat.ts` line 126
- **Description:** When `executeToolCall` fails, an empty assistant message may be left in the conversation state without being cleaned up.
- **Fix:** Remove or mark the orphaned message on failure.

### BUG-029: Inconsistent API Response Array Handling (Frontend)
- **Files:** `frontend/src/pages/UpdatesPage.tsx` lines 17-18, `frontend/src/pages/DashboardPage.tsx` lines 18-20, `frontend/src/pages/SettingsPage.tsx` lines 90-91
- **Description:** Multiple pages have defensive array normalization code (`Array.isArray(x) ? x : x ? [x] : []`) suggesting the backend API inconsistently returns arrays vs single objects. This fragile pattern is duplicated across pages.
- **Fix:** Fix the backend to always return consistent array types. Remove frontend workarounds.

### BUG-030: ConfirmModal Icon Color Doesn't Match Variant (Frontend)
- **File:** `frontend/src/components/common/ConfirmModal.tsx` line 35
- **Description:** The modal always shows an amber `AlertTriangle` icon regardless of the `variant` prop (danger/warning/info). A danger variant should show red, info should show blue.
- **Fix:** Map icon color to variant prop.

### BUG-031: useMutation Invalidation May Miss Related Queries (Frontend)
- **Files:** `frontend/src/hooks/useUpdates.ts` lines 43-44, `frontend/src/hooks/useCredentials.ts` lines 33-34, 49-50
- **Description:** Mutation `onSuccess` callbacks invalidate the parent query key but may not invalidate more specific sub-keys (e.g., invalidating `'updates'` but not `['updates', 'current']`).
- **Fix:** Use broader invalidation patterns or explicitly list all related query keys.

### BUG-032: Missing `imagePullPolicy` in K8s Deployment
- **File:** `k8s/deployment.yaml` line 20
- **Description:** No `imagePullPolicy` is set. With the `:latest` tag, Kubernetes defaults to `IfNotPresent`, meaning updated images may not be pulled if the old one is cached on the node.
- **Fix:** Add `imagePullPolicy: Always` when using `:latest` tag.

### BUG-033: No SecurityContext in K8s Deployment
- **File:** `k8s/deployment.yaml`
- **Description:** No `securityContext` is set on the pod or container. Although the Dockerfile creates a non-root user, K8s doesn't enforce this — a container exploit could escalate to root.
- **Fix:** Add `securityContext: { runAsNonRoot: true, runAsUser: 1000 }`.

### BUG-034: No `.env` Validation in deploy.sh
- **File:** `k8s/deploy.sh`
- **Description:** The script doesn't verify that `../.env` exists before attempting to create the Kubernetes secret from it. If missing, the deployment proceeds with an empty or malformed secret.
- **Fix:** Add a pre-flight check: `[ -f ../.env ] || { echo "ERROR: .env not found"; exit 1; }`.

### BUG-035: No Health Probe Timeout in K8s Deployment
- **File:** `k8s/deployment.yaml` lines 34-45
- **Description:** Liveness and readiness probes lack `timeoutSeconds`. If `/api/health` hangs, K8s uses the default 1-second timeout, which may be too short for a cold start, or too generous if the health endpoint itself is hung.
- **Fix:** Add `timeoutSeconds: 5` to both probes.

---

## Low

### BUG-036: Conversation ID Collision Risk (Frontend)
- **File:** `frontend/src/hooks/useAIChat.ts` line 9
- **Description:** Conversation ID is generated as `conv-${Date.now()}`. Two sessions created in the same millisecond would collide.
- **Fix:** Use a UUID or add a random suffix.

### BUG-037: Hardcoded Chat Panel Height (Frontend)
- **File:** `frontend/src/components/ai/ChatInterface.tsx` line 39
- **Description:** `h-[calc(100vh-8rem)]` is hardcoded. If the sidebar or header height changes, or on mobile viewports, the chat panel layout may break.
- **Fix:** Use a more flexible layout (flex-grow, min-height).

### BUG-038: `scrollIntoView` Fires on Every Render (Frontend)
- **File:** `frontend/src/components/ai/ChatInterface.tsx` line 22
- **Description:** The `scrollIntoView` in the `useEffect` runs on every message array update, including edits to existing messages. Should only scroll on new messages.
- **Fix:** Track message count and only scroll when it increases.

### BUG-039: StatusBadge Normalization Could Mismatch (Frontend)
- **File:** `frontend/src/components/common/StatusBadge.tsx` line 41
- **Description:** Status values are normalized by lowercasing and removing spaces. If the backend returns unexpected casing or spacing (e.g., "In Progress" vs "InProgress"), the color mapping may miss.
- **Fix:** Document expected status values or normalize more aggressively.

### BUG-040: No StorageClass in PVC
- **File:** `k8s/pvc.yaml`
- **Description:** No `storageClassName` is specified. The PVC uses the cluster's default StorageClass, which may not exist or may not be appropriate on AKS on Azure Local.
- **Fix:** Explicitly set `storageClassName` or document the expected default.

### BUG-041: Hardcoded DNS in docker-compose.yml
- **File:** `docker-compose.yml` lines 15-17
- **Description:** DNS servers `10.20.10.5` and `8.8.8.8` are hardcoded. The internal DNS (10.20.10.5) is specific to the lab network and won't work in other environments.
- **Fix:** Remove hardcoded DNS or make configurable. Most deployments should inherit DNS from the host.

### BUG-042: docker-compose.yml Missing Version Declaration
- **File:** `docker-compose.yml`
- **Description:** The file starts with `services:` without a `version:` declaration. While modern Docker Compose doesn't require it, explicit versioning improves portability.
- **Fix:** Add `version: '3.8'` at the top, or leave as-is if targeting Compose V2 only.

### BUG-043: Late Import of pywinrm and paramiko (Backend)
- **Files:** `backend/services/powershell.py` lines 183, 222
- **Description:** `winrm` and `paramiko` are imported inside method bodies rather than at module load. If either package is missing, the error only surfaces at runtime when a command is executed, not at startup.
- **Fix:** Import at module level with a try/except to log a warning at startup if unavailable.

### BUG-044: NodeCard Memory Division May Produce NaN (Frontend)
- **File:** `frontend/src/components/dashboard/NodeCard.tsx` line 31
- **Description:** `.CsPhysicallyInstalledMemory` could be a string (from PowerShell output), causing arithmetic operations to produce `NaN`.
- **Fix:** Parse to number with `Number()` or `parseInt()` before arithmetic.

### BUG-045: CVE Checker Swallows Exceptions Silently (Backend)
- **File:** `backend/services/cve_checker.py` lines 28-34
- **Description:** Exceptions from the MSRC API are caught with `except Exception` and logged at `debug` level only. Failed CVE data loads are invisible in normal operation.
- **Fix:** Log at `warning` level and surface the error in the API response.

### BUG-046: Memory Limits May Be Too Low for AI Workloads (K8s)
- **File:** `k8s/deployment.yaml` lines 27-33
- **Description:** Memory limit is 512Mi. The Flask backend with Gunicorn (4 gevent workers), Claude API streaming, and potential PowerShell execution could exceed this under concurrent load, triggering OOMKill.
- **Fix:** Monitor actual memory usage and adjust. Consider 768Mi or 1Gi for safety.

---

## Recommended Priority

### Immediate (before next deployment)
1. BUG-001, BUG-002 — Command injection (Critical)
2. BUG-003 — Path traversal (High)
3. BUG-007 — Port mismatch (High)
4. BUG-008 — Debug mode (High)
5. BUG-009 — JWT secret (High)
6. BUG-011 — Safety check default (High)

### Short-term (next sprint)
7. BUG-005 — Default credentials
8. BUG-010 — Hardcoded resource names
9. BUG-012 — Missing error states in UI
10. BUG-013 — Scheduler not started
11. BUG-021 — Dry-run enforcement
12. BUG-032 — imagePullPolicy
13. BUG-034 — deploy.sh validation

### Medium-term (backlog)
- All remaining Medium and Low severity items
- BUG-024 — CVE checker integration
- BUG-029 — API response consistency
- Security hardening (CORS, rate limiting, cert validation)
