from flask import Blueprint, jsonify, request, current_app

from backend.auth.middleware import require_auth
from backend.app import get_ps_executor
from backend.utils.enums import (
    resolve_enums, MOC_HEALTH, MOC_STATE,
    HCI_CONNECTION_STATUS, HCI_REGISTRATION_STATUS
)

credentials_bp = Blueprint('credentials', __name__)


@credentials_bp.route('/status', methods=['GET'])
@require_auth
def credential_status():
    ps = get_ps_executor(current_app)
    results = {}

    # KVA token file age — normalize DateTime to ISO string
    kva_result = ps.execute(
        '$f = Get-Item "C:\\ClusterStorage\\Infrastructure_1\\Shares\\SU1_Infrastructure_1'
        '\\MocArb\\WorkingDirectory\\Appliance\\kvatoken.tok"; '
        '[PSCustomObject]@{ '
        '  Name = $f.Name; '
        '  LastWriteTime = $f.LastWriteTime.ToString("o"); '
        '  CreationTime = $f.CreationTime.ToString("o") '
        '} | ConvertTo-Json',
        target_node='any'
    )
    results['kva_token'] = kva_result.parsed if kva_result.success else {'error': kva_result.stderr}

    # Azure Stack HCI registration
    hci_result = ps.execute(
        'Get-AzureStackHCI | ConvertTo-Json -Depth 3',
        target_node='any'
    )
    if hci_result.success and hci_result.parsed:
        resolve_enums(hci_result.parsed, {
            'ConnectionStatus': HCI_CONNECTION_STATUS,
            'RegistrationStatus': HCI_REGISTRATION_STATUS,
        })
    results['hci_registration'] = hci_result.parsed if hci_result.success else {'error': hci_result.stderr}

    # MOC node health
    moc_result = ps.execute(
        'Get-MocNode -location "MocLocation" | '
        'Select-Object name, fqdn, health, state | ConvertTo-Json',
        target_node='any'
    )
    if moc_result.success and moc_result.parsed:
        resolve_enums(moc_result.parsed, {
            'health': MOC_HEALTH,
            'state': MOC_STATE,
        })
    results['moc_nodes'] = moc_result.parsed if moc_result.success else {'error': moc_result.stderr}

    return jsonify(results)


@credentials_bp.route('/arb-status', methods=['GET'])
@require_auth
def arb_status():
    ps = get_ps_executor(current_app)
    result = ps.execute(
        'az arcappliance show --resource-group rg-azurestack '
        '--name azurestack01-arcbridge --only-show-errors 2>&1',
        target_node='any'
    )
    if not result.success:
        return jsonify({'error': result.stderr}), 500
    return jsonify({'arb': result.parsed})


@credentials_bp.route('/repair-moc', methods=['POST'])
@require_auth
def repair_moc():
    data = request.get_json()
    if not data or not data.get('confirm'):
        return jsonify({'error': 'Confirmation required. Send {"confirm": true}'}), 400

    ps = get_ps_executor(current_app)
    result = ps.execute('Repair-MocLogin', target_node='any', timeout=180)
    return jsonify({
        'success': result.success,
        'output': result.stdout,
        'error': result.stderr if not result.success else None
    })


@credentials_bp.route('/rotate-kva', methods=['POST'])
@require_auth
def rotate_kva():
    data = request.get_json()
    if not data or not data.get('confirm'):
        return jsonify({'error': 'Confirmation required. Send {"confirm": true}'}), 400

    validity_days = data.get('validity_days', 365)
    ps = get_ps_executor(current_app)
    result = ps.execute(
        f'Update-MocIdentity -name "Appliance" -validityDays {validity_days} '
        f'-fqdn "azurestack01.presidiorocks.com" -location "MocLocation" '
        f'-outFile "C:\\ClusterStorage\\Infrastructure_1\\Shares\\SU1_Infrastructure_1'
        f'\\MocArb\\WorkingDirectory\\Appliance\\kvatoken.tok" -enableTokenAutoRotate',
        target_node='any',
        timeout=300
    )
    return jsonify({
        'success': result.success,
        'output': result.stdout,
        'error': result.stderr if not result.success else None
    })
