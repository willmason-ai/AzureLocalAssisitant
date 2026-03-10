from flask import Blueprint, jsonify, current_app

from backend.auth.middleware import require_auth
from backend.app import get_ps_executor

cluster_bp = Blueprint('cluster', __name__)


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

    faults_result = ps.execute(
        'Get-HealthFault | Select-Object FaultId, FaultType, Severity, Description | ConvertTo-Json -Depth 3',
        target_node='any'
    )

    return jsonify({
        'nodes': result.parsed,
        'health_faults': faults_result.parsed if faults_result.success else []
    })


@cluster_bp.route('/nodes', methods=['GET'])
@require_auth
def cluster_nodes():
    ps = get_ps_executor(current_app)
    nodes_data = {}
    for node_name in ['dell-as01', 'dell-as02']:
        result = ps.execute(
            'Get-ComputerInfo | Select-Object CsName, OsUptime, CsNumberOfProcessors, '
            'CsPhysicallyInstalledMemory, WindowsProductName, OsVersion | ConvertTo-Json',
            target_node=node_name
        )
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
        'storage_pools': pools.parsed if pools.success else [],
        'virtual_disks': disks.parsed if disks.success else []
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

    return jsonify({'vms': result.parsed or []})
