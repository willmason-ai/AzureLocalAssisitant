from flask import Blueprint, jsonify, request, current_app

from backend.auth.middleware import require_auth
from backend.app import get_ps_executor
from backend.utils.enums import (
    resolve_enums, MOC_HEALTH, MOC_STATE,
    HCI_CONNECTION_STATUS, HCI_REGISTRATION_STATUS
)

credentials_bp = Blueprint('credentials', __name__)


CREDENTIALS_CACHE_TTL = 3600


def _get_scheduler():
    """Return the HealthScheduler from the app, or None."""
    return getattr(current_app, '_scheduler', None)


@credentials_bp.route('/status', methods=['GET'])
@require_auth
def credential_status():
    scheduler = _get_scheduler()

    # Always serve from cache if available (stale-while-revalidate)
    if scheduler is not None and scheduler.has_cache('kva_token'):
        return jsonify({
            'kva_token': scheduler.get_cache('kva_token'),
            'hci_registration': scheduler.get_cache('hci_registration'),
            'moc_nodes': scheduler.get_cache('moc_nodes'),
            'from_cache': True,
            'cache_age_seconds': round(scheduler.get_cache_age('kva_token'), 1),
        })

    # Cache miss — scheduler is warming up
    return jsonify({
        'kva_token': None, 'hci_registration': None, 'moc_nodes': None,
        'from_cache': False, 'warming_up': True
    })


@credentials_bp.route('/arb-status', methods=['GET'])
@require_auth
def arb_status():
    ps = get_ps_executor(current_app)
    rg = current_app.config.get('AZURE_RESOURCE_GROUP', 'rg-azurestack')
    cluster = current_app.config.get('AZURELOCAL_CLUSTER', 'azurestack01')
    arb_name = f'{cluster}-arcbridge'
    result = ps.execute(
        f'az arcappliance show --resource-group {rg} '
        f'--name {arb_name} --only-show-errors 2>&1',
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

    try:
        validity_days = int(data.get('validity_days', 365))
    except (TypeError, ValueError):
        return jsonify({'error': 'validity_days must be a number'}), 400
    if not 1 <= validity_days <= 3650:
        return jsonify({'error': 'validity_days must be between 1 and 3650'}), 400

    ps = get_ps_executor(current_app)
    cluster_fqdn = f"{current_app.config.get('AZURELOCAL_CLUSTER', 'azurestack01')}.{current_app.config.get('AZURELOCAL_DOMAIN', 'presidiorocks.com')}"
    kva_path = current_app.config.get('KVA_TOKEN_PATH', '').replace('\\', '\\\\')
    result = ps.execute(
        f'Update-MocIdentity -name "Appliance" -validityDays {validity_days} '
        f'-fqdn "{cluster_fqdn}" -location "MocLocation" '
        f'-outFile "{kva_path}" -enableTokenAutoRotate',
        target_node='any',
        timeout=300
    )
    return jsonify({
        'success': result.success,
        'output': result.stdout,
        'error': result.stderr if not result.success else None
    })
