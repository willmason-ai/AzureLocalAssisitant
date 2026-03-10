# AKS Arc Deployment Guide

Step-by-step guide for deploying the Azure Local AI Operations Dashboard to an AKS Arc cluster running on Azure Local.

---

## Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [Upgrade Azure CLI](#2-upgrade-azure-cli)
3. [Authenticate to Azure](#3-authenticate-to-azure)
4. [Install the aksarc Extension](#4-install-the-aksarc-extension)
5. [Discover AKS Arc Clusters](#5-discover-aks-arc-clusters)
6. [Install kubelogin](#6-install-kubelogin)
7. [Get Kubernetes Credentials](#7-get-kubernetes-credentials)
8. [Verify Cluster Access](#8-verify-cluster-access)
9. [Build the Docker Image](#9-build-the-docker-image)
10. [Push Image to Azure Container Registry](#10-push-image-to-azure-container-registry)
11. [Review Kubernetes Manifests](#11-review-kubernetes-manifests)
12. [Deploy to AKS](#12-deploy-to-aks)
13. [Verify Deployment](#13-verify-deployment)
14. [Access the Dashboard](#14-access-the-dashboard)
15. [Updating the Deployment](#15-updating-the-deployment)
16. [Troubleshooting](#16-troubleshooting)

---

## 1. Prerequisites

Before starting, ensure you have the following installed on your workstation:

| Tool | Purpose | Install |
|------|---------|---------|
| Azure CLI (`az`) | Azure resource management | [Install Azure CLI](https://learn.microsoft.com/en-us/cli/azure/install-azure-cli) |
| Docker Desktop | Build and push container images | [Install Docker Desktop](https://www.docker.com/products/docker-desktop/) |
| kubectl | Kubernetes cluster management | Installed via `az aks install-cli` |
| kubelogin | AAD authentication for AKS | Installed via `az aks install-cli` |

You also need:
- An Azure account with access to the **Presidio Sandbox** subscription (`aaaaa147-fd6e-48fb-9a66-d044700dca17`)
- Access to the Azure Container Registry: `cravsnetmon.azurecr.io`
- A configured `.env` file in the `azure-local-dashboard/` directory with all required environment variables (see `.env.example`)

---

## 2. Upgrade Azure CLI

Ensure you are running a recent version of the Azure CLI. Older versions (e.g., v2.53) have module compatibility issues with the `aksarc` extension.

```bash
az upgrade
```

Verify the version after upgrade:

```bash
az --version
```

Expected output (version 2.84.0 or later):
```
azure-cli    2.84.0
core         2.84.0
```

> **Note:** The upgrade may take several minutes and may require a terminal restart.

---

## 3. Authenticate to Azure

Log in to Azure. This opens a browser window for interactive authentication.

```bash
az login
```

After login, set the subscription to **Presidio Sandbox**:

```bash
az account set --subscription aaaaa147-fd6e-48fb-9a66-d044700dca17
```

Verify:

```bash
az account show --query "{name:name, id:id}" -o table
```

Expected output:
```
Name              Id
----------------  ------------------------------------
Presidio Sandbox  aaaaa147-fd6e-48fb-9a66-d044700dca17
```

---

## 4. Install the aksarc Extension

The `aksarc` extension provides CLI commands for managing AKS Arc (AKS on Azure Local) clusters.

```bash
az extension add --name aksarc --yes
```

If already installed, this will confirm the existing version. To force an upgrade:

```bash
az extension update --name aksarc
```

---

## 5. Discover AKS Arc Clusters

List the AKS Arc clusters in the resource group:

```bash
az aksarc list --resource-group rg-azurestack -o table
```

Expected output:
```
Name            ResourceGroup
--------------  ---------------
Azurelocal-AKS  rg-azurestack
```

Record the cluster name (`Azurelocal-AKS`) for subsequent steps.

---

## 6. Install kubelogin

AKS Arc clusters use Azure Active Directory (AAD) authentication. The `kubelogin` tool is required for kubectl to authenticate via AAD.

Install both kubectl and kubelogin:

```bash
az aks install-cli
```

This installs:
- `kubectl` to `~/.azure-kubectl/`
- `kubelogin` to `~/.azure-kubelogin/`

Add both to your PATH. On Windows (Git Bash):

```bash
export PATH="$PATH:$HOME/.azure-kubectl:$HOME/.azure-kubelogin"
```

For persistent PATH configuration, add to your shell profile (`~/.bashrc` or `~/.bash_profile`):

```bash
echo 'export PATH="$PATH:$HOME/.azure-kubectl:$HOME/.azure-kubelogin"' >> ~/.bashrc
```

Verify installation:

```bash
kubelogin --version
kubectl version --client
```

---

## 7. Get Kubernetes Credentials

Download the kubeconfig for the AKS Arc cluster:

```bash
az aksarc get-credentials \
  --resource-group rg-azurestack \
  --name Azurelocal-AKS \
  --overwrite-existing
```

Expected output:
```
Merged "aad-user@azurelocal-aks-c3c8af96" as current context in ~/.kube/config
```

---

## 8. Verify Cluster Access

Confirm kubectl can reach the AKS Arc cluster:

```bash
kubectl get nodes
```

Expected output (3 nodes, all Ready):
```
NAME               STATUS   ROLES           AGE   VERSION
moc-l0g48a7tvs9    Ready    <none>          10d   v1.29.9
moc-ls2o2whivrq    Ready    control-plane   10d   v1.29.9
moc-lyl9t4xxc44    Ready    <none>          10d   v1.29.9
```

> **Troubleshooting:** If you see `kubelogin not found`, ensure Step 6 was completed and PATH is set correctly.

---

## 9. Build the Docker Image

From the project root (`azure-local-dashboard/`), build the Docker image:

```bash
cd azure-local-dashboard
docker compose build
```

This runs a multi-stage build:
1. **Stage 1 (Node 20 Alpine):** Builds the React/Vite frontend
2. **Stage 2 (Python 3.12 Slim):** Sets up the Flask backend and copies the built frontend assets

Verify the image was created:

```bash
docker images | grep azure-local
```

---

## 10. Push Image to Azure Container Registry

### Log in to ACR

```bash
az acr login --name cravsnetmon
```

Expected output: `Login Succeeded`

### Tag the image

```bash
docker tag azure-local-dashboard-azure-local-dashboard:latest \
  cravsnetmon.azurecr.io/azure-local-dashboard:latest
```

### Push to ACR

```bash
docker push cravsnetmon.azurecr.io/azure-local-dashboard:latest
```

Wait for all layers to push. This may take a few minutes on the first push; subsequent pushes will be faster as unchanged layers are cached.

---

## 11. Review Kubernetes Manifests

The `k8s/` directory contains four manifest files and an automated deploy script:

### `namespace.yaml`
Creates the `azure-local-ops` namespace to isolate the dashboard resources.

```yaml
apiVersion: v1
kind: Namespace
metadata:
  name: azure-local-ops
  labels:
    app: azure-local-dashboard
```

### `deployment.yaml`
Defines the pod specification:
- **Image:** `cravsnetmon.azurecr.io/azure-local-dashboard:latest`
- **Port:** 5230
- **Resources:** 250m–1 CPU, 256Mi–512Mi memory
- **Health probes:** Liveness and readiness on `/api/health`
- **Secrets:** Environment variables from `dashboard-secrets`, ACR pull secret from `acr-secret`
- **Storage:** Persistent volume mounted at `/app/data`

### `service.yaml`
Exposes the dashboard via a LoadBalancer:
- **External port:** 80
- **Target port:** 5230
- A NodePort is also assigned automatically for fallback access

### `pvc.yaml`
Creates a 1Gi PersistentVolumeClaim for conversation history and cached data.

### `deploy.sh`
Automates the full deployment in 5 steps:
1. Creates namespace
2. Creates ACR pull secret (from `az acr credential show`)
3. Creates app secrets (from `.env` file)
4. Creates PVC
5. Applies deployment and service, waits for rollout

---

## 12. Deploy to AKS

### Option A: Automated (Recommended)

The `deploy.sh` script handles everything:

```bash
cd k8s
bash deploy.sh
```

Expected output:
```
=== Azure Local Dashboard - AKS Deployment ===
[1/5] Creating namespace...
namespace/azure-local-ops created
[2/5] Creating ACR pull secret...
secret/acr-secret created
[3/5] Creating app secrets from .env...
secret/dashboard-secrets created
[4/5] Creating persistent volume claim...
persistentvolumeclaim/dashboard-data created
[5/5] Deploying application...
deployment.apps/azure-local-dashboard created
service/azure-local-dashboard created

=== Deployment complete ===
Waiting for pod to be ready...
deployment "azure-local-dashboard" successfully rolled out
```

### Option B: Manual Step-by-Step

If you prefer to run each step individually:

```bash
cd k8s

# Create namespace
kubectl apply -f namespace.yaml

# Create ACR pull secret
ACR_USERNAME=$(az acr credential show --name cravsnetmon --query "username" -o tsv)
ACR_PASSWORD=$(az acr credential show --name cravsnetmon --query "passwords[0].value" -o tsv)
kubectl create secret docker-registry acr-secret \
  --namespace azure-local-ops \
  --docker-server=cravsnetmon.azurecr.io \
  --docker-username=$ACR_USERNAME \
  --docker-password=$ACR_PASSWORD \
  --dry-run=client -o yaml | kubectl apply -f -

# Create app secrets from .env
kubectl create secret generic dashboard-secrets \
  --namespace azure-local-ops \
  --from-env-file=../.env \
  --dry-run=client -o yaml | kubectl apply -f -

# Create PVC
kubectl apply -f pvc.yaml

# Deploy
kubectl apply -f deployment.yaml
kubectl apply -f service.yaml

# Wait for rollout
kubectl rollout status deployment/azure-local-dashboard -n azure-local-ops --timeout=120s
```

---

## 13. Verify Deployment

Check that everything is running:

```bash
# Pod status (should be Running, 1/1 Ready)
kubectl get pods -n azure-local-ops

# Service status (check for External IP)
kubectl get svc azure-local-dashboard -n azure-local-ops

# Pod logs (check for errors)
kubectl logs -n azure-local-ops deployment/azure-local-dashboard --tail=50

# Detailed pod info (if troubleshooting)
kubectl describe pod -n azure-local-ops -l app=azure-local-dashboard
```

Expected pod output:
```
NAME                                     READY   STATUS    RESTARTS   AGE
azure-local-dashboard-75c5d959f9-ws77h   1/1     Running   0          5m
```

Expected service output:
```
NAME                    TYPE           CLUSTER-IP      EXTERNAL-IP    PORT(S)        AGE
azure-local-dashboard   LoadBalancer   10.111.146.74   <assigned-ip>  80:32346/TCP   5m
```

---

## 14. Access the Dashboard

### Via LoadBalancer External IP (Primary)

Once the LoadBalancer assigns an external IP:

```
http://<EXTERNAL-IP>/
```

Watch for the IP assignment:

```bash
kubectl get svc azure-local-dashboard -n azure-local-ops -w
```

### Via NodePort (Fallback)

If the LoadBalancer IP is pending, use any node IP with the assigned NodePort:

```
http://<NODE-IP>:<NODE-PORT>/
```

Find the NodePort from the service output (e.g., `32346` in `80:32346/TCP`). Find a node IP with:

```bash
kubectl get nodes -o wide
```

### Health Check

Verify the backend is responding:

```bash
curl http://<EXTERNAL-IP>/api/health
```

---

## 15. Updating the Deployment

To deploy a new version after code changes:

```bash
# 1. Rebuild the Docker image
cd azure-local-dashboard
docker compose build

# 2. Tag and push to ACR
docker tag azure-local-dashboard-azure-local-dashboard:latest \
  cravsnetmon.azurecr.io/azure-local-dashboard:latest
docker push cravsnetmon.azurecr.io/azure-local-dashboard:latest

# 3. Restart the deployment to pull the new image
kubectl rollout restart deployment/azure-local-dashboard -n azure-local-ops

# 4. Wait for rollout
kubectl rollout status deployment/azure-local-dashboard -n azure-local-ops --timeout=120s
```

To update environment variables:

```bash
# Recreate secrets from updated .env
kubectl create secret generic dashboard-secrets \
  --namespace azure-local-ops \
  --from-env-file=.env \
  --dry-run=client -o yaml | kubectl apply -f -

# Restart pods to pick up new secrets
kubectl rollout restart deployment/azure-local-dashboard -n azure-local-ops
```

---

## 16. Troubleshooting

### Pod stuck in `ImagePullBackOff`

The ACR pull secret may be missing or expired:

```bash
# Verify secret exists
kubectl get secret acr-secret -n azure-local-ops

# Recreate it
ACR_USERNAME=$(az acr credential show --name cravsnetmon --query "username" -o tsv)
ACR_PASSWORD=$(az acr credential show --name cravsnetmon --query "passwords[0].value" -o tsv)
kubectl create secret docker-registry acr-secret \
  --namespace azure-local-ops \
  --docker-server=cravsnetmon.azurecr.io \
  --docker-username=$ACR_USERNAME \
  --docker-password=$ACR_PASSWORD \
  --dry-run=client -o yaml | kubectl apply -f -

# Delete the stuck pod so it recreates
kubectl delete pod -n azure-local-ops -l app=azure-local-dashboard
```

### Pod stuck in `CrashLoopBackOff`

Check logs for the error:

```bash
kubectl logs -n azure-local-ops deployment/azure-local-dashboard --previous
```

Common causes:
- Missing environment variables (check `dashboard-secrets`)
- Python dependency issues (rebuild Docker image)
- Port conflict (verify nothing else uses 5230)

### LoadBalancer IP stays `<pending>`

On AKS Arc, the LoadBalancer depends on the cluster's network configuration. If an IP is never assigned:
- Verify the AKS Arc cluster has a load balancer IP range configured
- Use NodePort access as a fallback (see Step 14)
- Check with your cluster administrator

### `kubelogin not found`

Ensure the PATH includes the kubelogin install directory:

```bash
export PATH="$PATH:$HOME/.azure-kubectl:$HOME/.azure-kubelogin"
```

Or reinstall:

```bash
az aks install-cli
```

### Cannot reach Azure Local nodes from the pod

Unlike Docker Desktop (which has WSL2 networking limitations), pods running on AKS Arc on Azure Local are on the cluster network. They should have direct access to the Azure Local nodes (10.1.68.x). If connectivity fails:

```bash
# Exec into the pod
kubectl exec -it -n azure-local-ops deployment/azure-local-dashboard -- bash

# Test connectivity
ping dell-as01.presidiorocks.com
curl -k https://dell-as01.presidiorocks.com:5985
```

Check that DNS is resolving (the pod uses cluster DNS, which should be able to resolve the domain via the configured DNS servers).

### Complete teardown

To remove all dashboard resources:

```bash
kubectl delete namespace azure-local-ops
```

This deletes all resources (deployment, service, secrets, PVC) within the namespace.

---

## Reference

| Resource | Value |
|----------|-------|
| ACR | cravsnetmon.azurecr.io |
| Image | cravsnetmon.azurecr.io/azure-local-dashboard:latest |
| AKS Cluster | Azurelocal-AKS |
| Resource Group | rg-azurestack |
| Subscription | Presidio Sandbox (aaaaa147-fd6e-48fb-9a66-d044700dca17) |
| Namespace | azure-local-ops |
| Service Port | 80 (external) → 5230 (container) |
| Health Endpoint | /api/health |
