from flask import Blueprint, jsonify, request, current_app

from backend.auth.middleware import require_auth
from backend.app import get_ps_executor

settings_bp = Blueprint('settings', __name__)


@settings_bp.route('/connection', methods=['GET'])
@require_auth
def get_connection():
    cfg = current_app.config
    return jsonify({
        'nodes': [cfg['AZURELOCAL_NODE1'], cfg['AZURELOCAL_NODE2']],
        'domain': cfg['AZURELOCAL_DOMAIN'],
        'cluster': cfg['AZURELOCAL_CLUSTER'],
        'username': cfg['AZURELOCAL_USERNAME'],
        'winrm_transport': cfg['WINRM_TRANSPORT'],
        'winrm_ssl': cfg['WINRM_USE_SSL'],
        'ssh_fallback': cfg['SSH_FALLBACK_ENABLED']
    })


@settings_bp.route('/test-connection', methods=['POST'])
@require_auth
def test_connection():
    ps = get_ps_executor(current_app)
    results = {}
    for node_name in ['dell-as01', 'dell-as02']:
        result = ps.execute(
            'hostname',
            target_node=node_name,
            timeout=15
        )
        results[node_name] = {
            'reachable': result.success,
            'hostname': result.stdout.strip() if result.success else None,
            'error': result.stderr if not result.success else None,
            'transport': result.transport_used if hasattr(result, 'transport_used') else 'unknown'
        }
    return jsonify(results)
