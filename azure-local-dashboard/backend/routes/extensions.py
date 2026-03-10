from flask import Blueprint, jsonify, current_app

from backend.auth.middleware import require_auth
from backend.app import get_ps_executor

extensions_bp = Blueprint('extensions', __name__)


@extensions_bp.route('', methods=['GET'])
@require_auth
def list_extensions():
    ps = get_ps_executor(current_app)

    # Get Arc Resource Bridge extensions
    arb_result = ps.execute(
        'az k8s-extension list --cluster-name azurestack01-arcbridge '
        '--resource-group rg-azurestack --cluster-type appliances '
        '--output json 2>&1',
        target_node='any'
    )

    # Get Arc connected machine extensions for each node
    node_extensions = {}
    for node in ['dell-as01', 'dell-as02']:
        result = ps.execute(
            f'az connectedmachine extension list --machine-name {node} '
            f'--resource-group rg-azurestack --output json 2>&1',
            target_node='any'
        )
        if result.success:
            node_extensions[node] = result.parsed or []
        else:
            node_extensions[node] = {'error': result.stderr}

    return jsonify({
        'arb_extensions': arb_result.parsed if arb_result.success else [],
        'node_extensions': node_extensions
    })
