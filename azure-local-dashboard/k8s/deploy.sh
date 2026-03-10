#!/bin/bash
# Deploy Azure Local Dashboard to AKS Arc cluster
# Usage: ./deploy.sh
set -e

NAMESPACE="azure-local-ops"
ACR_NAME="cravsnetmon"
ACR_SERVER="cravsnetmon.azurecr.io"

echo "=== Azure Local Dashboard - AKS Deployment ==="

# 1. Create namespace
echo "[1/5] Creating namespace..."
kubectl apply -f namespace.yaml

# 2. Create ACR pull secret
echo "[2/5] Creating ACR pull secret..."
ACR_USERNAME=$(az acr credential show --name $ACR_NAME --query "username" -o tsv)
ACR_PASSWORD=$(az acr credential show --name $ACR_NAME --query "passwords[0].value" -o tsv)
kubectl create secret docker-registry acr-secret \
  --namespace $NAMESPACE \
  --docker-server=$ACR_SERVER \
  --docker-username=$ACR_USERNAME \
  --docker-password=$ACR_PASSWORD \
  --dry-run=client -o yaml | kubectl apply -f -

# 3. Create app secrets from .env file
echo "[3/5] Creating app secrets from .env..."
kubectl create secret generic dashboard-secrets \
  --namespace $NAMESPACE \
  --from-env-file=../.env \
  --dry-run=client -o yaml | kubectl apply -f -

# 4. Create PVC
echo "[4/5] Creating persistent volume claim..."
kubectl apply -f pvc.yaml

# 5. Deploy app
echo "[5/5] Deploying application..."
kubectl apply -f deployment.yaml
kubectl apply -f service.yaml

echo ""
echo "=== Deployment complete ==="
echo "Waiting for pod to be ready..."
kubectl rollout status deployment/azure-local-dashboard -n $NAMESPACE --timeout=120s

echo ""
echo "=== Service Details ==="
kubectl get svc azure-local-dashboard -n $NAMESPACE
echo ""
echo "To get the external IP once assigned:"
echo "  kubectl get svc azure-local-dashboard -n $NAMESPACE -w"
