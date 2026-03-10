# Azure Local Troubleshooting Project
## Cluster: azurestack01 | Orlando Lab

---

## Cluster Details (Captured from Azure Portal)

| Property | Value |
|----------|-------|
| **Cluster Name** | azurestack01 |
| **Resource Type** | Azure Local |
| **Subscription ID** | aaaaa147-fd6e-48fb-9a66-d044700dca17 |
| **Resource Group** | rg-azurestack |
| **Location** | East US |
| **Custom Location** | Orlando-Lab-Azurestack |
| **Cloud ID** | 36f19206-7f7e-443e-a82f-fcd414623638 |
| **Tenant ID** | 2a731c61-a2b2-4661-8409-5b861cf40d0c |
| **Azure Connection** | Connected (Last: 2/19/2026 8:59 PM, Next Sync: 2/20/2026 8:59 AM) |
| **Registration Status** | Registered (since 10/31/2024) |
| **Health Status** | --- (unknown/blank in portal) |
| **Identity Provider** | Active Directory |
| **Cluster Type** | Standard |
| **Billing Status** | Included with Azure Hybrid Benefit |
| **IMDS Attestation** | Enabled |
| **Diagnostic Level** | Basic |

## Hardware

| Property | Value |
|----------|-------|
| **Machines** | 2 nodes (Dell-AS01, Dell-AS02) |
| **Manufacturer** | Dell Inc. |
| **Model** | AX-660 |
| **Total Physical Cores** | 32 (2 nodes x 16 cores) |

## Entra App Registrations (from Portal Investigation)

| App Name | Application (Client) ID | Created | Status | Purpose |
|----------|------------------------|---------|--------|---------|
| **azurestack01** | 02712b95-5104-408e-85ed-478ff717ac935 | 10/31/2024 | Current | HCI Cluster Registration |
| **azure-cli-2024-09-23-18-15-21** | 12c20bcd-43fe-4c8b-b582-c6a71cc026e8 | 9/23/2024 | Renewed 2/20/2026 | ARB Service Principal |
| **AVStoAzurestacb418authandaccessaadapp** | dced7027-1a35-4be3-bbf7-7a3e2bf7e465 | 11/12/2024 | Expired | AVS/Azure Stack auth (needs renewal) |
| **WindowsAdminCenter-https://azurestack-wac.presidiorocks.com** | 36b72904-0410-4f46-9311-fe0a17d4f215 | 10/31/2024 | -- | WAC Registration |

---

## ROOT CAUSE ANALYSIS (RCA)

### Incident Summary

| Field | Detail |
|-------|--------|
| **Incident** | 2025.03 Feature Update (Solution10.2503.0.13) repeatedly failing |
| **Impact** | Cluster stuck on 2411 platform, unable to receive feature updates since October 2025 |
| **Duration** | 10/18/2025 - 2/20/2026 (125 days) |
| **Resolution Date** | 2/20/2026 |
| **Resolution Time** | ~3 hours (active troubleshooting session 2) |
| **Resolved By** | W. Mason (Presidio Network Solutions) |

### Timeline of Events

| Date | Event |
|------|-------|
| **10/31/2024** | Cluster deployed and registered. ARB appliance created. KVA MOC token (`kvatoken.tok`) issued with 1-year expiry. |
| **9/23/2024** | ARB Service Principal (`azure-cli-2024-09-23-18-15-21`) created in Entra ID. |
| **10/18/2025** | First attempt at 2025.03 Feature Update. Ran for 5h 46m before failing at "update ARB and extensions" step. |
| **10/18/2025** | Second attempt same day. Failed at 19m at same step. |
| **10/27/2025** | Third attempt. Failed at 19m at same step. |
| **10/31/2025** | KVA MOC token (`kvatoken.tok`) expires (1-year anniversary of deployment). |
| **11/8/2025** | Fourth attempt. Failed at 19m at same step. |
| **2/19/2026** | Session 1: Initial investigation. Root cause identified as expired Entra ID SPN client secret (AADSTS7000222). |
| **2/20/2026** | Session 2: Remediation begins. SPN secret renewed, MOC login repaired, KVA token regenerated. Update succeeds. |

### Root Causes (Two Layered)

The update failure was caused by **two independent expired credentials** in the authentication chain between Azure, the ARB appliance, and the on-premises MOC fabric.

#### Root Cause 1: Expired Entra ID SPN Client Secret

| Field | Detail |
|-------|--------|
| **App Name** | azure-cli-2024-09-23-18-15-21 |
| **App ID** | 12c20bcd-43fe-4c8b-b582-c6a71cc026e8 |
| **Error Code** | AADSTS7000222 |
| **Error Message** | "The provided client secret keys for app '12c20bcd-43fe-4c8b-b582-c6a71cc026e8' are expired" |
| **Layer** | Azure Entra ID (cloud) |
| **Impact** | ARB could not authenticate to Azure during upgrade |

#### Root Cause 2: Expired KVA MOC Token (Primary Blocker)

| Field | Detail |
|-------|--------|
| **Token File** | `C:\ClusterStorage\Infrastructure_1\Shares\SU1_Infrastructure_1\MocArb\WorkingDirectory\Appliance\kvatoken.tok` |
| **Identity Name** | Appliance |
| **Token Type** | JWT (RS256) |
| **Issued** | 10/31/2024 (cluster deployment day) |
| **Expired** | 10/31/2025 (1-year lifespan) |
| **Error** | `failed to create MOC session: rpc error: code = Unauthenticated desc = Valid Token Required` |
| **Error Category** | LoginError / PrerequisitesError |
| **Layer** | On-premises MOC fabric (ARB VM to MOC cloudagent) |
| **Impact** | ARB appliance could not authenticate to MOC cloudagent to perform upgrade operations |

This was the **deeper and hidden root cause**. Even after fixing Root Cause 1, the update continued to fail because the ARB appliance's on-premises MOC authentication token had been expired for nearly 4 months. This token was never rotated since initial deployment.

### Authentication Chain

The ARB upgrade process requires three authentication layers, all of which must be valid:

```
Layer 1: Azure Entra ID        <-- SPN client secret authenticates to Azure
    |                               (Expired - fixed by renewing secret in Entra ID)
    v
Layer 2: ARB VM (KVA)          <-- kvatoken.tok authenticates ARB to MOC
    |                               (Expired since 10/31/2025 - fixed by Update-MocIdentity)
    v
Layer 3: MOC Cloud Agent       <-- cloudlogin.yaml authenticates host nodes to MOC
    |                               (Stale - fixed by Repair-MocLogin)
    v
Cluster Nodes (Dell-AS01, Dell-AS02)
```

### Failure Path (7 levels deep in update orchestration)

```
Solution10.2503.0.13 (2025.03 Feature Update)
  +-- Start update
      +-- Start applicable update
          +-- Update cluster
              +-- Perform update
                  +-- Update Arc infrastructure components
                      +-- Determine Deploy Or Update
                          +-- update ARB and extensions  <-- FAILED HERE
                              Error 1: AADSTS7000222 (expired SPN secret)
                              Error 2: PrerequisitesError (expired KVA MOC token)
                              Called: az arcappliance upgrade hci --config-file hci-appliance.yaml
                              Module: ArcHci v1.2.11, MocArb.LifeCycle v1.2502.0.12
```

### Update Attempt History

| Attempt | Date | Duration | Result | Error |
|---------|------|----------|--------|-------|
| 1 | 10/18/2025 5:21 AM | 5h 46m | Failed | AADSTS7000222 (expired SPN secret) |
| 2 | 10/18/2025 8:06 PM | 19m | Failed | AADSTS7000222 (expired SPN secret) |
| 3 | 10/27/2025 2:06 PM | 19m | Failed | AADSTS7000222 (expired SPN secret) |
| 4 | 11/8/2025 2:26 PM | 19m | Failed | AADSTS7000222 (expired SPN secret) |
| 5 | 2/20/2026 4:18 AM | 9m | Failed | PrerequisitesError (expired KVA MOC token) |
| 6 | 2/20/2026 4:52 AM | 9m | Failed | PrerequisitesError (expired KVA MOC token) |
| **7** | **2/20/2026 6:11 AM** | **23m** | **Succeeded** | -- |

Note: Attempts 1-4 failed on the Entra ID SPN secret. After that was renewed, attempts 5-6 revealed the second root cause (expired KVA MOC token). After both were fixed, attempt 7 succeeded.

---

## REMEDIATION ACTIONS TAKEN (2/20/2026)

### Step 1: Renewed Entra ID SPN Client Secret
- **Action**: Created new client secret for App ID `12c20bcd-43fe-4c8b-b582-c6a71cc026e8` in Azure Portal > Entra ID > App registrations > Certificates & secrets
- **Expiration**: Set to 24 months
- **Updated on cluster**: Used `Set-AzureStackRPSpCredential` to push the new secret to the cluster

### Step 2: Repaired MOC Host Login
- **Action**: Ran `Repair-MocLogin` on cluster node to refresh the host-level MOC authentication
- **Result**: Successfully re-authenticated using `cloudlogin.yaml`
- **Note**: This fixed the host-to-MOC auth but NOT the ARB-to-MOC auth

### Step 3: Logged Azure CLI into Node Locally
- **Problem**: `az login` failed via remote PowerShell (WAC) due to WinError -2146892987 delegation error
- **Action**: RDP'd directly into Dell-AS01, ran `az login --use-device-code` locally
- **Result**: Azure CLI authenticated successfully, `az arcappliance show` confirmed ARB status as Running/Succeeded

### Step 4: Regenerated Expired KVA MOC Token (Critical Fix)
- **Problem**: `kvatoken.tok` was a JWT issued 10/31/2024, expired 10/31/2025. Never rotated.
- **Discovery**: Traced from error message > `hci-appliance.yaml` > `hci-infra.yaml` > `loginconfigfile` > `kvatoken.tok`
- **JWT Payload**: `"exp": 1761939544` (10/31/2025), `"iat": 1730403544` (10/31/2024), issuer: `wssdagentsvc`
- **Action**:
```powershell
Update-MocIdentity -name "Appliance" -validityDays 365 -fqdn "azurestack01.presidiorocks.com" -location "MocLocation" -outFile "C:\ClusterStorage\Infrastructure_1\Shares\SU1_Infrastructure_1\MocArb\WorkingDirectory\Appliance\kvatoken.tok" -enableTokenAutoRotate
```
- **Result**: New token written, file timestamp updated to 2/20/2026 5:39 AM. Auto-rotation enabled.

### Step 5: Manual ARB Upgrade (Verified Fix)
- **Action**: Ran `az arcappliance upgrade hci --config-file hci-appliance.yaml` manually from local PowerShell
- **Result**: All validations passed (identity, cloud entities, network, loadbalancer, proxy, CDN). Image `appliance-0.1.37.10128-v1.30.4` downloaded and provisioned. ARB upgraded to Running/Succeeded state.
- **Duration**: ~20 minutes

### Step 6: Retried Solution Update
- **Action**: `Get-SolutionUpdate -Id "redmond/Solution10.2503.0.13" | Start-SolutionUpdate`
- **Result**: **SUCCEEDED** in 23 minutes. All remaining steps completed (MAA endpoint, confidential computing agents, infrastructure VMs, Arc extensions, SyslogForwarder).

---

## Key Technical Details

### ARB Appliance Configuration Files

| File | Path | Purpose |
|------|------|---------|
| hci-appliance.yaml | `C:\ClusterStorage\Infrastructure_1\Shares\SU1_Infrastructure_1\MocArb\WorkingDirectory\Appliance\` | Main ARB config, references infra yaml and resource yaml |
| hci-infra.yaml | Same directory | MOC cloud agent connection details, references kvatoken.tok |
| kvatoken.tok | Same directory | JWT token for ARB VM authentication to MOC cloudagent |

### ARB Appliance Details

| Property | Value |
|----------|-------|
| Name | azurestack01-arcbridge |
| Resource ID | /subscriptions/aaaaa147-fd6e-48fb-9a66-d044700dca17/resourceGroups/rg-azurestack/providers/Microsoft.ResourceConnector/appliances/azurestack01-arcbridge |
| Status | Running |
| Provisioning | Succeeded |
| Distro | AKSEdge |
| Version | 1.3.1 |
| K8s Version | v1.30.4 |
| Image | appliance-0.1.37.10128-v1.30.4 |
| Control Plane IP | 10.1.68.22 |
| System Assigned Identity | 15302a19-230c-4048-a67d-5ad9fd5317b2 |

### MOC Node Health (at time of troubleshooting)

| Node | FQDN | Health | State | Running |
|------|------|--------|-------|---------|
| dell-as01 | Dell-AS01.presidiorocks.com | OK | UPDATED / Active | Yes |
| dell-as02 | Dell-AS02.presidiorocks.com | OK | UPDATED / Active | Yes |

### Update Orchestration Steps (2503 Feature Update)

| Step | Status |
|------|--------|
| Update cloud management | Succeeded |
| Update storage and cluster configuration | Succeeded |
| Install OpenSSH client | Succeeded |
| update Moc | Succeeded |
| update ARB and extensions | **Succeeded** (after remediation) |
| Update MAA endpoint | Succeeded |
| Update agents for confidential computing | Succeeded |
| Update infrastructure VMs and VHDs | Succeeded |
| Update Arc Extensions | Succeeded |
| Enforce SyslogForwarder Configuration during update | Succeeded |

---

## Update History

| Update | Version | Status | Installed Date |
|--------|---------|--------|---------------|
| 2024.10 Cumulative | 10.2408.2.7 | Installed | 11/1/2024 |
| 2024.11 Feature | 10.2411.0.24 | Installed | 12/7/2024 |
| 2025.01 Cumulative | 10.2411.2.12 | Installed | 2/24/2025 |
| 2025.02 Cumulative | 10.2411.3.2 | Installed | 5/6/2025 |
| Dell SBE 16G/45n0c | 4.1.2505.1504 | Installed | 10/15/2025 |
| **2025.03 Feature** | **10.2503.0.13** | **Installed** | **2/20/2026** |

---

## LESSONS LEARNED & RECOMMENDATIONS

### 1. Multiple Independent Token Expirations
Azure Local has multiple authentication layers with independent expiration timelines. The Entra ID SPN secret, MOC host login, and KVA MOC token all expire independently. A failure in any one of them can block updates with different (or similar) error messages.

### 2. KVA Token Not Auto-Rotated by Default
The `kvatoken.tok` issued at deployment time has a 1-year lifespan and does **not** auto-rotate by default. If the cluster goes more than 12 months without an ARB-related operation that refreshes this token, it will silently expire. The `-enableTokenAutoRotate` flag on `Update-MocIdentity` should be set at deployment time.

### 3. Error Messages Can Be Misleading
The initial error (`AADSTS7000222`) pointed to the Entra ID SPN secret, which was correct but incomplete. After fixing that, a second error (`PrerequisitesError: Valid Token Required`) appeared at the same step, pointing to a different authentication layer. Layered auth failures can mask deeper issues.

### 4. Remote PowerShell Limitations
`az login` cannot be performed via remote PowerShell sessions (WAC, Enter-PSSession) due to DPAPI delegation constraints (WinError -2146892987). RDP directly to a cluster node for any Azure CLI operations.

### 5. Update Orchestrator Resume Model
Azure Local's update orchestrator uses checkpoint-based resume, not fresh starts. Failed updates retry from the last failed step, preserving previously completed work. This is by design and saves significant time on retry.

### Preventive Actions

| Action | Frequency | Purpose |
|--------|-----------|---------|
| Monitor Entra ID app secret expiration | Monthly | Prevent AADSTS7000222 errors |
| Check `kvatoken.tok` file date and JWT expiry | Quarterly | Prevent MOC session auth failures |
| Run `Repair-MocLogin` proactively | After extended downtime | Refresh host-to-MOC auth |
| Keep cluster updates current | Monthly/Quarterly | Prevent token drift and credential expiry |
| Renew `AVStoAzurestacb418authandaccessaadapp` certificate | Immediate | Expired cert, non-blocking but should be fixed |
| Review Defender security alerts | Immediate | 3 open alerts need attention |

### Command Reference (for Future Token Issues)

```powershell
# Check KVA token file age
Get-Item "C:\ClusterStorage\Infrastructure_1\Shares\SU1_Infrastructure_1\MocArb\WorkingDirectory\Appliance\kvatoken.tok"

# Regenerate KVA MOC token with auto-rotation
Update-MocIdentity -name "Appliance" -validityDays 365 -fqdn "azurestack01.presidiorocks.com" -location "MocLocation" -outFile "C:\ClusterStorage\Infrastructure_1\Shares\SU1_Infrastructure_1\MocArb\WorkingDirectory\Appliance\kvatoken.tok" -enableTokenAutoRotate

# Repair host-level MOC login
Repair-MocLogin

# Check ARB appliance status
az arcappliance show --resource-group rg-azurestack --name azurestack01-arcbridge --only-show-errors

# Manual ARB upgrade (if needed outside of update orchestrator)
az arcappliance upgrade hci --config-file "C:\ClusterStorage\Infrastructure_1\Shares\SU1_Infrastructure_1\MocArb\WorkingDirectory\Appliance\hci-appliance.yaml" --only-show-errors

# Check MOC node health
Get-MocNode -location "MocLocation"

# Start solution update
Get-SolutionUpdate -Id "redmond/Solution10.2503.0.13" | Start-SolutionUpdate

# Monitor update progress
Get-SolutionUpdateRun -UpdateId "redmond/Solution10.2503.0.13" | Select-Object State, TimeStarted, Duration | Format-List
```

---

## OUTSTANDING ITEMS

| Item | Priority | Status |
|------|----------|--------|
| Renew `AVStoAzurestacb418authandaccessaadapp` expired certificate | Medium | Pending |
| Review 3 Defender security alerts | Medium | Pending |
| Investigate blank cluster health status in portal | Low | Pending |
| Verify next cumulative update installs cleanly | Low | Pending (wait for next update release) |

---

## Extensions Installed
- AdminCenter
- AzureEdgeDeviceManagement
- AzureEdgeRemoteSupport
- AzureEdgeTelemetryAndDiagnostics
- AzureEdgeLifecycleManager

## Workloads
- Virtual machines: 0
- Kubernetes clusters: 0

---

## Research & References

- [Rotate Secrets on Azure Local 23H2](https://learn.microsoft.com/en-us/azure/azure-local/manage/manage-secrets-rotation)
- [Troubleshoot Azure Stack HCI Registration](https://learn.microsoft.com/en-us/azure-stack/hci/deploy/troubleshoot-hci-registration)
- [Troubleshoot Solution Updates 23H2](https://learn.microsoft.com/en-us/azure-stack/hci/update/update-troubleshooting-23h2)
- [Update via PowerShell 23H2](https://learn.microsoft.com/en-us/azure-stack/hci/update/update-via-powershell-23h2)
- [az arcappliance update-infracredentials](https://learn.microsoft.com/en-us/cli/azure/arcappliance/update-infracredentials)
- [Troubleshoot Azure Arc Resource Bridge](https://learn.microsoft.com/en-us/azure/azure-arc/resource-bridge/troubleshoot-resource-bridge)
- [Common Deployment Challenges HCI 23H2](https://techcommunity.microsoft.com/t5/fasttrack-for-azure/common-deployment-challenges-and-workarounds-for-hci-23h2/ba-p/4044172)

---

## Session Log

### Session 1 - 2/19/2026
- Captured cluster details from Azure Portal screenshot
- Identified 3 main issues: expired Entra secret, failed update, security alerts
- Noted cluster IS connected (not fully disconnected)
- Solution version confirms 23H2 platform (not 22H2 as initially thought)
- Connected to Azure Portal via Chrome, investigated Entra app registrations
- Found 3 expired app registrations, initially unclear which was tied to cluster
- Ran Get-AzureStackHCI on cluster node via WAC -- confirmed registration healthy
- Ran Get-SolutionUpdate -- discovered the actual failed update is 10.2503.0.13 (2025.03 Feature Update), not 10.2411.3.2
- Drilled through 7 levels of update run steps to reach the root cause
- **ROOT CAUSE 1 IDENTIFIED**: App ID 12c20bcd-43fe-4c8b-b582-c6a71cc026e8 (ARB SPN) has expired client secret
- Error: AADSTS7000222 during "update ARB and extensions" step
- 4 failed update attempts between 10/18/2025 and 11/8/2025, all at the same step
- Remediation plan created: Renew secret > Update on cluster > Retry update

### Session 2 - 2/20/2026
- Completed Step 1: Renewed Entra ID SPN client secret
- Completed Step 2: Updated secret on cluster via Set-AzureStackRPSpCredential
- Completed Step 3: Repaired MOC login via Repair-MocLogin
- **Update attempt 5 FAILED** (4:18 AM, 9m) -- new error: `PrerequisitesError: failed to create MOC session: Valid Token Required`
- Identified error is now MOC-layer, not Entra ID -- the SPN fix worked but revealed a second issue
- Confirmed both MOC nodes (dell-as01, dell-as02) healthy via Get-MocNode
- Attempted `az login` via remote session -- hit delegation error (WinError -2146892987)
- RDP'd directly into Dell-AS01, successfully ran `az login --use-device-code`
- Confirmed ARB appliance Running/Succeeded via `az arcappliance show`
- **Update attempt 6 FAILED** (4:52 AM, 9m) -- same MOC token error
- Ran manual `az arcappliance upgrade hci` -- reproduced the exact error interactively
- Traced config chain: `hci-appliance.yaml` > `hci-infra.yaml` > `loginconfigfile: kvatoken.tok`
- **ROOT CAUSE 2 IDENTIFIED**: `kvatoken.tok` last modified 10/31/2024, JWT expired 10/31/2025
- Decoded JWT: `exp: 1761939544` (10/31/2025), `iat: 1730403544` (10/31/2024), issuer: `wssdagentsvc`
- No ArcHci module commands for token/login/repair -- searched with Get-Command
- Found `Update-MocIdentity` in Moc module with `-validityDays`, `-outFile`, `-enableTokenAutoRotate` parameters
- **FIXED**: Ran `Update-MocIdentity -name "Appliance" -validityDays 365 ... -enableTokenAutoRotate`
- Confirmed kvatoken.tok updated to 2/20/2026 5:39 AM
- Manual `az arcappliance upgrade hci` -- ALL VALIDATIONS PASSED, image downloaded, ARB upgraded successfully
- **Update attempt 7 SUCCEEDED** (6:11 AM, 23m) -- 2025.03 Feature Update installed
- **INCIDENT RESOLVED** after 125 days of failed updates
