# Fixes TODO

## Open Issues

### FIX-001: Init container permissions not applied on rolling restart
- **Status**: Fixed in v2.4.0
- **Problem**: `kubectl rollout restart` doesn't re-apply deployment.yaml changes. The init container `fix-data-permissions` was added to the YAML but never applied. Also, `runAsNonRoot: false` was missing on the init container, causing `CreateContainerConfigError`.
- **Fix**: Added `runAsNonRoot: false` to init container securityContext, re-applied deployment.yaml.

### FIX-002: Updates page shows superseded updates as "Installing"
- **Status**: Fixed in v2.5.0
- **Problem**: The UpdateTimeline component treats any State that isn't exactly "Installed" as pending/in-progress. Superseded updates with states like "HasPrerequisite", "NotApplicableBecauseAnotherUpdateIsInProgress" show with pulsing blue dots and "Installing" indicators.
- **Fix**: Added `SKIPPED_STATES` set and `isTerminalState()`/`stateLabel()` functions. Skipped updates now render as grey with opacity-60 and appropriate labels.

### FIX-003: Caching still slow on initial page loads
- **Status**: Fixed in v2.5.1
- **Problem**: Despite cache-first architecture, cache TTL checks caused routes to fall through to live PowerShell (2-5s) when cache expired. Also, 4 Gunicorn workers each ran their own HealthScheduler, quadrupling WinRM calls.
- **Fix**: Implemented stale-while-revalidate pattern — routes always serve cached data if available (`has_cache()` instead of TTL check). Scheduler refreshes in background. Reduced Gunicorn to 1 worker with gevent (async handles concurrency via greenlets).

### FIX-004: Kubernetes page shows minimal info — no running container images
- **Status**: Fixed in v2.5.0
- **Problem**: The Kubernetes page only shows cluster name, K8s version, and node count from `az aksarc`. Doesn't show what workloads/images are running.
- **Fix**: Rebuilt the Kubernetes page to use the in-cluster K8s API directly. Shows namespaces, deployments with container images, pods with state/restarts/node, and a full image list. Added RBAC ClusterRole for read-only access.

### FIX-005: API key not persisted across pod restarts
- **Status**: Open
- **Problem**: The API key saved via Settings UI is stored in the credential store file on the PVC, but the PVC permissions issue (FIX-001) prevented the file from being written. After fixing permissions, key must be re-entered.
- **Note**: This should now work after FIX-001 is resolved. Monitor.

---

## Uncommitted Changes (as of 2026-03-16)

All changes from v2.6.0 through v2.7.1 are locally modified but **not committed to git**. The last commit is `909b9c8` (v2.5.1). These changes have been deployed to AKS Arc via Docker image builds but the source code commits are pending.

**Files changed**: 14 files, +770 / -342 lines across backend routes, services, and frontend components.
