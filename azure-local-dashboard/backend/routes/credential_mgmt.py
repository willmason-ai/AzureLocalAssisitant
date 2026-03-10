"""CRUD endpoints for managing stored credential sets."""

from flask import Blueprint, jsonify, request, current_app

from backend.auth.middleware import require_auth
from backend.app import get_credential_store, get_ps_executor

credential_mgmt_bp = Blueprint('credential_mgmt', __name__)

# Fields that are never returned in responses
SENSITIVE_FIELDS = {'password', 'secret', 'client_secret'}


def _mask(value: str) -> str:
    if not value or len(value) < 4:
        return '****'
    return value[:2] + '*' * (len(value) - 4) + value[-2:]


def _sanitize(cred_data: dict) -> dict:
    """Return credential data with sensitive fields masked."""
    result = {}
    for k, v in cred_data.items():
        if k in SENSITIVE_FIELDS:
            result[k] = _mask(str(v)) if v else ''
        else:
            result[k] = v
    return result


@credential_mgmt_bp.route('', methods=['GET'])
@require_auth
def list_credential_sets():
    store = get_credential_store(current_app)
    sections = store.list_sections()
    result = {}
    for section in sections:
        data = store.get(section)
        result[section] = _sanitize(data)
    return jsonify({'credential_sets': result})


@credential_mgmt_bp.route('/<section>', methods=['GET'])
@require_auth
def get_credential_set(section):
    store = get_credential_store(current_app)
    data = store.get(section)
    if not data:
        return jsonify({'error': f'Credential set "{section}" not found'}), 404
    return jsonify({'section': section, 'credentials': _sanitize(data)})


@credential_mgmt_bp.route('/<section>', methods=['PUT'])
@require_auth
def upsert_credential_set(section):
    """Create or update a credential set. Expects JSON body with credential fields."""
    body = request.get_json()
    if not body:
        return jsonify({'error': 'JSON body required'}), 400

    store = get_credential_store(current_app)
    store.update(section, body)
    return jsonify({
        'success': True,
        'section': section,
        'credentials': _sanitize(store.get(section))
    })


@credential_mgmt_bp.route('/<section>', methods=['DELETE'])
@require_auth
def delete_credential_set(section):
    store = get_credential_store(current_app)
    creds = store.load()
    if section not in creds:
        return jsonify({'error': f'Credential set "{section}" not found'}), 404
    del creds[section]
    store.save(creds)
    return jsonify({'success': True, 'deleted': section})


@credential_mgmt_bp.route('/<section>/test', methods=['POST'])
@require_auth
def test_credential_set(section):
    """Test a stored credential set by running 'hostname' on the target node."""
    store = get_credential_store(current_app)
    cred = store.get(section)
    if not cred:
        return jsonify({'error': f'Credential set "{section}" not found'}), 404

    ps = get_ps_executor(current_app)
    target = cred.get('target_node', 'any')
    result = ps.execute('hostname', target_node=target, timeout=15)

    return jsonify({
        'section': section,
        'reachable': result.success,
        'hostname': result.stdout.strip() if result.success else None,
        'transport': result.transport_used,
        'error': result.stderr if not result.success else None
    })
