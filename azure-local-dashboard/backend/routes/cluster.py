from flask import Blueprint, jsonify, current_app

from backend.auth.middleware import require_auth
from backend.app import get_ps_executor
from backend.utils.enums import (
    resolve_enums, CLUSTER_NODE_STATE, CLUSTER_NODE_STATUS, VM_STATE
)

cluster_bp = Blueprint('cluster', __name__)


def _ensure_list(data):
    """BUG-029: PowerShell ConvertTo-Json returns object for single items."""
    if data is None:
        return []
    if isinstance(data, list):
        return data
    return [data]


@cluster_bp.route('/status', methods=['GET'])
@require_auth
def cluster_status():
    ps = get_ps_executor(current_app)
    result = ps.execute(
        'Get-ClusterNode | Select-Object Name, State, StatusInformation | ConvertTo-Json',
        target_node='any'
    )
    if not result.success:
        return jsonify({'error': result.stderr, 'raw': result.stdout}), 500

    resolve_enums(result.parsed, {
        'State': CLUSTER_NODE_STATE,
        'StatusInformation': CLUSTER_NODE_STATUS,
    })

    faults_result = ps.execute(
        'Get-HealthFault | Select-Object FaultId, FaultType, Severity, Description | ConvertTo-Json -Depth 3',
        target_node='any'
    )

    return jsonify({
        'nodes': _ensure_list(result.parsed),
        'health_faults': _ensure_list(faults_result.parsed) if faults_result.success else []
    })


@cluster_bp.route('/nodes', methods=['GET'])
@require_auth
def cluster_nodes():
    """Get node details using fast CIM queries instead of slow Get-ComputerInfo."""
    ps = get_ps_executor(current_app)
    nodes_data = {}

    # CIM-based query: much faster than Get-ComputerInfo (1-2s vs 15-30s).
    # Returns RAM in bytes from Win32_PhysicalMemory sum.
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

    for node_name in ps.nodes:
        result = ps.execute(cim_query, target_node=node_name)
        if result.success:
            nodes_data[node_name] = result.parsed
        else:
            nodes_data[node_name] = {'error': result.stderr}

    return jsonify(nodes_data)


@cluster_bp.route('/storage', methods=['GET'])
@require_auth
def cluster_storage():
    ps = get_ps_executor(current_app)

    pools = ps.execute(
        'Get-StoragePool | Where-Object IsPrimordial -eq $false | '
        'Select-Object FriendlyName, HealthStatus, OperationalStatus, Size, AllocatedSize | '
        'ConvertTo-Json',
        target_node='any'
    )
    disks = ps.execute(
        'Get-VirtualDisk | Select-Object FriendlyName, OperationalStatus, HealthStatus, '
        'Size, FootprintOnPool | ConvertTo-Json',
        target_node='any'
    )

    return jsonify({
        'storage_pools': _ensure_list(pools.parsed) if pools.success else [],
        'virtual_disks': _ensure_list(disks.parsed) if disks.success else []
    })


@cluster_bp.route('/vms', methods=['GET'])
@require_auth
def cluster_vms():
    ps = get_ps_executor(current_app)
    result = ps.execute(
        'Get-VM | Select-Object Name, State, CPUUsage, MemoryAssigned, Uptime, '
        'Status, ComputerName | ConvertTo-Json -Depth 2',
        target_node='any'
    )
    if not result.success:
        return jsonify({'error': result.stderr}), 500

    resolve_enums(result.parsed, {'State': VM_STATE})

    return jsonify({'vms': _ensure_list(result.parsed)})


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
