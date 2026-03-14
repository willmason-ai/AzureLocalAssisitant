# Fixes TODO

## Open Issues

### FIX-001: Init container permissions not applied on rolling restart
- **Status**: Fixed in v2.4.0
- **Problem**: `kubectl rollout restart` doesn't re-apply deployment.yaml changes. The init container `fix-data-permissions` was added to the YAML but never applied. Also, `runAsNonRoot: false` was missing on the init container, causing `CreateContainerConfigError`.
- **Fix**: Added `runAsNonRoot: false` to init container securityContext, re-applied deployment.yaml.

### FIX-002: Updates page shows superseded updates as "Installing"
- **Status**: In Progress
- **Problem**: The UpdateTimeline component treats any State that isn't exactly "Installed" as pending/in-progress. Superseded updates with states like "HasPrerequisite", "NotApplicableBecauseAnotherUpdateIsInProgress" show with pulsing blue dots and "Installing" indicators.
- **Fix**: Treat additional states as "completed/skipped" in the timeline: NotApplicableBecauseAnotherUpdateIsInProgress, Recalled, Invalid should render as grey/completed. HasPrerequisite for old versions should not pulse.

### FIX-003: Caching still slow on initial page loads
- **Status**: Open
- **Problem**: Despite cache-first architecture, initial loads and cache misses still hit WinRM which takes 2-5 seconds per command. Cold starts are especially slow.
- **Potential improvements**: Reduce scheduler warm-up to parallel execution, serve stale cache while refreshing in background, add loading skeletons instead of blocking.

### FIX-004: Kubernetes page shows minimal info — no running container images
- **Status**: In Progress
- **Problem**: The Kubernetes page only shows cluster name, K8s version, and node count from `az aksarc`. Doesn't show what workloads/images are running.
- **Fix**: Use kubectl commands via PowerShell to get pods, deployments, and container images. Add workloads section showing running pods with their container images.

### FIX-005: API key not persisted across pod restarts
- **Status**: Open
- **Problem**: The API key saved via Settings UI is stored in the credential store file on the PVC, but the PVC permissions issue (FIX-001) prevented the file from being written. After fixing permissions, key must be re-entered.
- **Note**: This should now work after FIX-001 is resolved. Monitor.
