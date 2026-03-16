from flask import Blueprint, jsonify, current_app

from backend.auth.middleware import require_auth
from backend.app import get_ps_executor
from backend.utils.enums import (
    resolve_enums, CLUSTER_NODE_STATE, CLUSTER_NODE_STATUS, VM_STATE
)

cluster_bp = Blueprint('cluster', __name__)

# Cache TTL thresholds (seconds) — only used for fallback live queries
HEALTH_CACHE_TTL = 60


def _ensure_list(data):
    """BUG-029: PowerShell ConvertTo-Json returns object for single items."""
    if data is None:
        return []
    if isinstance(data, list):
        return data
    return [data]


def _get_scheduler():
    """Return the HealthScheduler from the app, or None."""
    return getattr(current_app, '_scheduler', None)


@cluster_bp.route('/status', methods=['GET'])
@require_auth
def cluster_status():
    scheduler = _get_scheduler()

    # Always serve from cache if available (stale-while-revalidate)
    if scheduler is not None and scheduler.has_cache('cluster_health'):
        cached_faults = scheduler.get_cache('health_faults') if scheduler.has_cache('health_faults') else None
        return jsonify({
            'nodes': _ensure_list(scheduler.get_cache('cluster_health')),
            'health_faults': _ensure_list(cached_faults),
            'from_cache': True,
            'cache_age_seconds': round(scheduler.get_cache_age('cluster_health'), 1),
        })

    # Cache miss — scheduler is warming up
    return jsonify({'nodes': [], 'health_faults': [], 'from_cache': False, 'warming_up': True})


@cluster_bp.route('/nodes', methods=['GET'])
@require_auth
def cluster_nodes():
    """Get node details using fast CIM queries instead of slow Get-ComputerInfo."""
    scheduler = _get_scheduler()

    # Always serve from cache if available
    if scheduler is not None and scheduler.has_cache('cluster_nodes_detail'):
        return jsonify(scheduler.get_cache('cluster_nodes_detail'))

    # Cache miss — scheduler is warming up
    return jsonify({'warming_up': True})


@cluster_bp.route('/storage', methods=['GET'])
@require_auth
def cluster_storage():
    scheduler = _get_scheduler()

    # Always serve from cache if available
    if scheduler is not None and scheduler.has_cache('storage_pools') and scheduler.has_cache('virtual_disks'):
        return jsonify({
            'storage_pools': _ensure_list(scheduler.get_cache('storage_pools')),
            'virtual_disks': _ensure_list(scheduler.get_cache('virtual_disks')),
            'from_cache': True,
            'cache_age_seconds': round(scheduler.get_cache_age('storage_pools'), 1),
        })

    # Cache miss — scheduler is warming up
    return jsonify({'storage_pools': [], 'virtual_disks': [], 'from_cache': False, 'warming_up': True})


@cluster_bp.route('/vms', methods=['GET'])
@require_auth
def cluster_vms():
    scheduler = _get_scheduler()

    if scheduler is not None and scheduler.has_cache('cluster_vms'):
        return jsonify({
            'vms': _ensure_list(scheduler.get_cache('cluster_vms')),
            'from_cache': True,
            'cache_age_seconds': round(scheduler.get_cache_age('cluster_vms'), 1),
        })

    # Cache miss — scheduler is warming up
    return jsonify({'vms': [], 'from_cache': False, 'warming_up': True})


@cluster_bp.route('/time', methods=['GET'])
@require_auth
def cluster_time():
    """Lightweight endpoint returning cluster node time."""
    ps = get_ps_executor(current_app)
    result = ps.execute(
        'Get-Date -Format "yyyy-MM-ddTHH:mm:ssK"',
        target_node='any',
        parse_json=False
    )
    return jsonify({
        'cluster_time': result.stdout.strip() if result.success else None,
        'error': result.stderr if not result.success else None
    })


@cluster_bp.route('/refresh', methods=['GET'])
@require_auth
def cluster_refresh():
    """Force an immediate refresh of all cached data."""
    scheduler = _get_scheduler()
    if scheduler is None:
        return jsonify({'error': 'Scheduler not available'}), 503
    scheduler.force_refresh()
    return jsonify({'message': 'Cache refreshed successfully'})
