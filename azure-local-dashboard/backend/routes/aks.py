from flask import Blueprint, jsonify, current_app

from backend.auth.middleware import require_auth
from backend.app import get_ps_executor

aks_bp = Blueprint('aks', __name__)


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
