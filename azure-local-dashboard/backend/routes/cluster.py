from flask import Blueprint, jsonify, current_app

from backend.auth.middleware import require_auth
from backend.app import get_ps_executor
from backend.utils.enums import (
    resolve_enums, CLUSTER_NODE_STATE, CLUSTER_NODE_STATUS, VM_STATE
)

cluster_bp = Blueprint('cluster', __name__)

# Cache TTL thresholds (seconds)
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

    # Try cache first
    if scheduler is not None:
        nodes_age = scheduler.get_cache_age('cluster_health')
        faults_age = scheduler.get_cache_age('health_faults')
        if nodes_age < HEALTH_CACHE_TTL:
            cached_nodes = scheduler.get_cache('cluster_health')
            cached_faults = scheduler.get_cache('health_faults') if faults_age < HEALTH_CACHE_TTL else None
            return jsonify({
                'nodes': _ensure_list(cached_nodes),
                'health_faults': _ensure_list(cached_faults),
                'from_cache': True,
                'cache_age_seconds': round(nodes_age, 1),
            })

    # Cache miss or stale — execute live via parallel PS calls
    ps = get_ps_executor(current_app)

    results = ps.execute_parallel([
        {
            'command': 'Get-ClusterNode | Select-Object Name, State, StatusInformation | ConvertTo-Json',
            'target_node': 'any',
            'timeout': 30,
        },
        {
            'command': 'Get-HealthFault | Select-Object FaultId, FaultType, Severity, Description | ConvertTo-Json -Depth 3',
            'target_node': 'any',
            'timeout': 30,
        },
    ])

    nodes_result, faults_result = results[0], results[1]

    if not nodes_result.success:
        return jsonify({'error': nodes_result.stderr, 'raw': nodes_result.stdout}), 500

    resolve_enums(nodes_result.parsed, {
        'State': CLUSTER_NODE_STATE,
        'StatusInformation': CLUSTER_NODE_STATUS,
    })

    return jsonify({
        'nodes': _ensure_list(nodes_result.parsed),
        'health_faults': _ensure_list(faults_result.parsed) if faults_result.success else [],
        'from_cache': False,
    })


@cluster_bp.route('/nodes', methods=['GET'])
@require_auth
def cluster_nodes():
    """Get node details using fast CIM queries instead of slow Get-ComputerInfo."""
    scheduler = _get_scheduler()

    # Try cache first
    if scheduler is not None and scheduler.get_cache_age('cluster_nodes_detail') < HEALTH_CACHE_TTL:
        return jsonify(scheduler.get_cache('cluster_nodes_detail'))

    ps = get_ps_executor(current_app)

    # CIM-based query: much faster than Get-ComputerInfo (1-2s vs 15-30s).
    cim_query = (
        '$os = Get-CimInstance Win32_OperatingSystem; '
        '$ram = (Get-CimInstance Win32_PhysicalMemory | Measure-Object -Property Capacity -Sum).Sum; '
        '$cpu = (Get-CimInstance Win32_Processor | Measure-Object -Property NumberOfLogicalProcessors -Sum).Sum; '
        '[PSCustomObject]@{ '
        '  CsName = $os.CSName; '
        '  OsUptime = ((Get-Date) - $os.LastBootUpTime).ToString(); '
        '  CsNumberOfProcessors = $cpu; '
        '  PhysicalMemoryBytes = $ram; '
        '  WindowsProductName = $os.Caption; '
        '  OsVersion = $os.Version '
        '} | ConvertTo-Json'
    )

    # Run CIM queries on both nodes in parallel
    parallel_cmds = [
        {'command': cim_query, 'target_node': node_name, 'timeout': 30}
        for node_name in ps.nodes
    ]
    results = ps.execute_parallel(parallel_cmds)

    nodes_data = {}
    for node_name, result in zip(ps.nodes, results):
        if result.success:
            nodes_data[node_name] = result.parsed
        else:
            nodes_data[node_name] = {'error': result.stderr}

    return jsonify(nodes_data)


@cluster_bp.route('/storage', methods=['GET'])
@require_auth
def cluster_storage():
    scheduler = _get_scheduler()

    # Try cache first
    if scheduler is not None:
        pools_age = scheduler.get_cache_age('storage_pools')
        disks_age = scheduler.get_cache_age('virtual_disks')
        if pools_age < HEALTH_CACHE_TTL and disks_age < HEALTH_CACHE_TTL:
            return jsonify({
                'storage_pools': _ensure_list(scheduler.get_cache('storage_pools')),
                'virtual_disks': _ensure_list(scheduler.get_cache('virtual_disks')),
                'from_cache': True,
            })

    ps = get_ps_executor(current_app)

    results = ps.execute_parallel([
        {
            'command': (
                'Get-StoragePool | Where-Object IsPrimordial -eq $false | '
                'Select-Object FriendlyName, HealthStatus, OperationalStatus, Size, AllocatedSize | '
                'ConvertTo-Json'
            ),
            'target_node': 'any',
            'timeout': 30,
        },
        {
            'command': (
                'Get-VirtualDisk | Select-Object FriendlyName, OperationalStatus, HealthStatus, '
                'Size, FootprintOnPool | ConvertTo-Json'
            ),
            'target_node': 'any',
            'timeout': 30,
        },
    ])

    pools, disks = results[0], results[1]

    return jsonify({
        'storage_pools': _ensure_list(pools.parsed) if pools.success else [],
        'virtual_disks': _ensure_list(disks.parsed) if disks.success else [],
        'from_cache': False,
    })


@cluster_bp.route('/vms', methods=['GET'])
@require_auth
def cluster_vms():
    scheduler = _get_scheduler()

    if scheduler is not None and scheduler.get_cache_age('cluster_vms') < HEALTH_CACHE_TTL:
        return jsonify({
            'vms': _ensure_list(scheduler.get_cache('cluster_vms')),
            'from_cache': True,
        })

    ps = get_ps_executor(current_app)
    result = ps.execute(
        'Get-VM | Select-Object Name, State, CPUUsage, MemoryAssigned, Uptime, '
        'Status, ComputerName | ConvertTo-Json -Depth 2',
        target_node='any'
    )
    if not result.success:
        return jsonify({'error': result.stderr}), 500

    resolve_enums(result.parsed, {'State': VM_STATE})

    return jsonify({'vms': _ensure_list(result.parsed), 'from_cache': False})


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
