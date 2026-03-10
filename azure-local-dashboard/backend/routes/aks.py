import re

from flask import Blueprint, jsonify, current_app

from backend.auth.middleware import require_auth
from backend.app import get_ps_executor

aks_bp = Blueprint('aks', __name__)

# BUG-001 fix: Validate URL path parameters to prevent command injection
_SAFE_NAME_RE = re.compile(r'^[a-zA-Z0-9][a-zA-Z0-9\-]{0,62}$')


def _validate_name(name: str) -> bool:
    return bool(_SAFE_NAME_RE.match(name))


@aks_bp.route('/clusters', methods=['GET'])
@require_auth
def list_clusters():
    ps = get_ps_executor(current_app)
    result = ps.execute(
        'az aksarc list --resource-group rg-azurestack --output json 2>&1',
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
        f'az aksarc show --resource-group rg-azurestack --name {name} --output json 2>&1',
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
        f'--resource-group rg-azurestack --output json 2>&1',
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
        'az aksarc get-versions --resource-group rg-azurestack --output json 2>&1',
        target_node='any'
    )
    if not result.success:
        return jsonify({'error': result.stderr}), 500
    return jsonify({'versions': result.parsed})
