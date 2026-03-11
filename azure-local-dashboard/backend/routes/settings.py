import re

from flask import Blueprint, jsonify, request, current_app

from backend.auth.middleware import require_auth
from backend.app import get_ps_executor, get_credential_store, get_ai_service

settings_bp = Blueprint('settings', __name__)


@settings_bp.route('/system-overview', methods=['GET'])
@require_auth
def system_overview():
    """Get storage volumes, Azure Local version, and update status."""
    ps = get_ps_executor(current_app)

    # Get all Cluster Shared Volumes with usage info
    csv_result = ps.execute(
        'Get-ClusterSharedVolume | ForEach-Object { '
        '  $info = $_.SharedVolumeInfo; '
        '  [PSCustomObject]@{ '
        '    Name = $_.Name; '
        '    State = $_.State; '
        '    VolumeFriendlyName = $info.FriendlyVolumeName; '
        '    TotalSize = $info.Partition.Size; '
        '    FreeSpace = $info.Partition.FreeSpace; '
        '    UsedSpace = $info.Partition.UsedSpace; '
        '    PercentFree = $info.Partition.PercentFree; '
        '    FileSystem = $info.Partition.FileSystem; '
        '    OwnerNode = $_.OwnerNode.Name '
        '  } '
        '} | ConvertTo-Json -Depth 3',
        target_node='any'
    )

    # Get installed version from the most recent installed update
    version_result = ps.execute(
        'Get-SolutionUpdate | Select-Object DisplayName, State, Version | ConvertTo-Json -Depth 3',
        target_node='any'
    )

    # Get cluster node time
    time_result = ps.execute(
        'Get-Date -Format "yyyy-MM-ddTHH:mm:ssK"',
        target_node='any',
        parse_json=False
    )

    # Parse version info to determine current and available
    updates = version_result.parsed if version_result.success else []
    if isinstance(updates, dict):
        updates = [updates]

    current_version = None
    pending_updates = []
    for u in (updates or []):
        state = (u.get('State') or '').lower()
        if state == 'installed':
            if not current_version or (u.get('Version', '') > current_version.get('Version', '')):
                current_version = u
        elif state in ('ready', 'downloading', 'available'):
            pending_updates.append(u)

    return jsonify({
        'cluster_volumes': csv_result.parsed if csv_result.success else [],
        'current_version': current_version,
        'pending_updates': pending_updates,
        'is_up_to_date': len(pending_updates) == 0,
        'cluster_time': time_result.stdout.strip() if time_result.success else None,
        'errors': {
            'volumes': csv_result.stderr if not csv_result.success else None,
            'version': version_result.stderr if not version_result.success else None,
        }
    })


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
    for node_name in ps.nodes:
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


def _mask_api_key(key: str) -> str:
    """Mask an API key for display, showing prefix and last 4 chars."""
    if not key or len(key) < 12:
        return '****'
    return key[:7] + '...' + key[-4:]


@settings_bp.route('/ai-config', methods=['GET'])
@require_auth
def get_ai_config():
    """Check if an Anthropic API key is configured and return masked version."""
    store = get_credential_store(current_app)
    stored_key = store.get('ai_config', 'anthropic_api_key')
    env_key = current_app.config.get('ANTHROPIC_API_KEY', '')

    if stored_key:
        return jsonify({
            'has_key': True,
            'masked_key': _mask_api_key(stored_key),
            'source': 'user-configured'
        })
    elif env_key:
        return jsonify({
            'has_key': True,
            'masked_key': _mask_api_key(env_key),
            'source': 'environment'
        })
    else:
        return jsonify({
            'has_key': False,
            'masked_key': None,
            'source': None
        })


@settings_bp.route('/ai-config', methods=['PUT'])
@require_auth
def update_ai_config():
    """Update the Anthropic API key."""
    data = request.get_json()
    if not data or 'api_key' not in data:
        return jsonify({'error': 'api_key is required'}), 400

    api_key = data['api_key'].strip()
    if not api_key:
        return jsonify({'error': 'api_key cannot be empty'}), 400

    if not re.match(r'^sk-ant-', api_key):
        return jsonify({'error': 'Invalid API key format. Anthropic keys start with sk-ant-'}), 400

    # Store encrypted in credential store
    store = get_credential_store(current_app)
    store.update('ai_config', {'anthropic_api_key': api_key})

    # Update the running AI service if it's already initialized
    if current_app._ai_service is not None:
        current_app._ai_service.update_api_key(api_key)

    return jsonify({
        'success': True,
        'masked_key': _mask_api_key(api_key),
        'source': 'user-configured'
    })
