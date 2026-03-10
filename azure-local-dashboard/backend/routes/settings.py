from flask import Blueprint, jsonify, request, current_app

from backend.auth.middleware import require_auth
from backend.app import get_ps_executor

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
