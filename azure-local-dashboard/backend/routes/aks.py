import json
import logging
import os
import re

import requests as http_requests

from flask import Blueprint, jsonify, current_app

from backend.auth.middleware import require_auth
from backend.app import get_ps_executor

logger = logging.getLogger(__name__)

aks_bp = Blueprint('aks', __name__)

# BUG-001 fix: Validate URL path parameters to prevent command injection
_SAFE_NAME_RE = re.compile(r'^[a-zA-Z0-9][a-zA-Z0-9\-]{0,62}$')


def _validate_name(name: str) -> bool:
    return bool(_SAFE_NAME_RE.match(name))


def _rg():
    return current_app.config.get('AZURE_RESOURCE_GROUP', 'rg-azurestack')


@aks_bp.route('/clusters', methods=['GET'])
@require_auth
def list_clusters():
    ps = get_ps_executor(current_app)
    result = ps.execute(
        f'az aksarc list --resource-group {_rg()} --output json 2>&1',
        target_node='any'
    )
    if not result.success:
        return jsonify({'error': result.stderr, 'clusters': []}), 500
    return jsonify({'clusters': result.parsed or []})


@aks_bp.route('/clusters/<name>', methods=['GET'])
@require_auth
def get_cluster(name):
    if not _validate_name(name):
        return jsonify({'error': 'Invalid cluster name. Only alphanumeric characters and hyphens allowed.'}), 400

    ps = get_ps_executor(current_app)
    result = ps.execute(
        f'az aksarc show --resource-group {_rg()} --name {name} --output json 2>&1',
        target_node='any'
    )
    if not result.success:
        return jsonify({'error': result.stderr}), 500
    return jsonify({'cluster': result.parsed})


@aks_bp.route('/nodepools/<cluster>', methods=['GET'])
@require_auth
def list_nodepools(cluster):
    if not _validate_name(cluster):
        return jsonify({'error': 'Invalid cluster name. Only alphanumeric characters and hyphens allowed.'}), 400

    ps = get_ps_executor(current_app)
    result = ps.execute(
        f'az aksarc nodepool list --cluster-name {cluster} '
        f'--resource-group {_rg()} --output json 2>&1',
        target_node='any'
    )
    if not result.success:
        return jsonify({'error': result.stderr}), 500
    return jsonify({'nodepools': result.parsed or []})


@aks_bp.route('/versions', methods=['GET'])
@require_auth
def get_versions():
    ps = get_ps_executor(current_app)
    result = ps.execute(
        f'az aksarc get-versions --resource-group {_rg()} --output json 2>&1',
        target_node='any'
    )
    if not result.success:
        return jsonify({'error': result.stderr}), 500
    return jsonify({'versions': result.parsed})


def _k8s_api_get(path: str) -> dict:
    """Query the in-cluster Kubernetes API using the mounted service account."""
    token_path = '/var/run/secrets/kubernetes.io/serviceaccount/token'
    ca_path = '/var/run/secrets/kubernetes.io/serviceaccount/ca.crt'

    if not os.path.exists(token_path):
        raise RuntimeError('Not running inside a Kubernetes pod (no service account token)')

    with open(token_path) as f:
        token = f.read().strip()

    host = os.environ.get('KUBERNETES_SERVICE_HOST', 'kubernetes.default.svc')
    port = os.environ.get('KUBERNETES_SERVICE_PORT', '443')
    url = f'https://{host}:{port}{path}'

    resp = http_requests.get(
        url,
        headers={'Authorization': f'Bearer {token}'},
        verify=ca_path if os.path.exists(ca_path) else False,
        timeout=10
    )
    resp.raise_for_status()
    return resp.json()


@aks_bp.route('/workloads', methods=['GET'])
@require_auth
def get_workloads():
    """Get pods, deployments, and container images running on this AKS cluster."""
    try:
        # Get all namespaces
        ns_data = _k8s_api_get('/api/v1/namespaces')
        namespaces = [
            ns['metadata']['name']
            for ns in ns_data.get('items', [])
        ]

        # Get all pods across all namespaces
        pods_data = _k8s_api_get('/api/v1/pods')
        pods = []
        for pod in pods_data.get('items', []):
            metadata = pod.get('metadata', {})
            spec = pod.get('spec', {})
            status = pod.get('status', {})

            containers = []
            for c in spec.get('containers', []):
                # Find matching container status
                c_status = next(
                    (cs for cs in status.get('containerStatuses', [])
                     if cs.get('name') == c.get('name')),
                    {}
                )
                state_info = c_status.get('state', {})
                if 'running' in state_info:
                    c_state = 'Running'
                elif 'waiting' in state_info:
                    c_state = state_info['waiting'].get('reason', 'Waiting')
                elif 'terminated' in state_info:
                    c_state = 'Terminated'
                else:
                    c_state = 'Unknown'

                containers.append({
                    'name': c.get('name'),
                    'image': c.get('image'),
                    'state': c_state,
                    'restarts': c_status.get('restartCount', 0),
                    'ready': c_status.get('ready', False),
                })

            pods.append({
                'name': metadata.get('name'),
                'namespace': metadata.get('namespace'),
                'node': spec.get('nodeName'),
                'phase': status.get('phase'),
                'containers': containers,
                'startTime': status.get('startTime'),
            })

        # Get deployments across all namespaces
        deploys_data = _k8s_api_get('/apis/apps/v1/deployments')
        deployments = []
        for dep in deploys_data.get('items', []):
            metadata = dep.get('metadata', {})
            spec = dep.get('spec', {})
            status = dep.get('status', {})
            template_containers = spec.get('template', {}).get('spec', {}).get('containers', [])

            deployments.append({
                'name': metadata.get('name'),
                'namespace': metadata.get('namespace'),
                'replicas': status.get('replicas', 0),
                'readyReplicas': status.get('readyReplicas', 0),
                'availableReplicas': status.get('availableReplicas', 0),
                'images': [c.get('image') for c in template_containers],
            })

        # Collect unique images
        all_images = set()
        for pod in pods:
            for c in pod.get('containers', []):
                if c.get('image'):
                    all_images.add(c['image'])

        return jsonify({
            'namespaces': namespaces,
            'pods': pods,
            'deployments': deployments,
            'images': sorted(all_images),
            'summary': {
                'total_pods': len(pods),
                'running_pods': sum(1 for p in pods if p['phase'] == 'Running'),
                'total_deployments': len(deployments),
                'total_namespaces': len(namespaces),
                'unique_images': len(all_images),
            }
        })
    except Exception as e:
        logger.error(f"Failed to get workloads: {e}")
        return jsonify({'error': str(e)}), 500
