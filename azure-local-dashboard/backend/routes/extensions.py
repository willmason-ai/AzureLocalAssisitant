from flask import Blueprint, jsonify, current_app

from backend.auth.middleware import require_auth

extensions_bp = Blueprint('extensions', __name__)


def _get_azure_api():
    if not hasattr(current_app, '_azure_api') or current_app._azure_api is None:
        from backend.services.azure_api import AzureAPIClient
        current_app._azure_api = AzureAPIClient(current_app.config)
    return current_app._azure_api


@extensions_bp.route('', methods=['GET'])
@require_auth
def list_extensions():
    azure_api = _get_azure_api()

    if not azure_api.is_configured:
        return jsonify({
            'arb_extensions': [],
            'node_extensions': {},
            'message': (
                'Azure SPN credentials not configured. '
                'Set AZURE_CLIENT_ID and AZURE_CLIENT_SECRET in .env to enable extension monitoring. '
                'Extensions cannot be retrieved via WinRM (az login fails remotely due to DPAPI).'
            )
        })

    try:
        result = azure_api.get_all_extensions()
        # Normalize the Azure API response to match the existing frontend contract
        arb = []
        for ext in result.get('arb_extensions', []):
            props = ext.get('properties', {})
            arb.append({
                'name': ext.get('name', ''),
                'extensionType': props.get('extensionType', ''),
                'version': props.get('version', ''),
                'provisioningState': props.get('provisioningState', 'Unknown'),
                'installState': props.get('installState', ''),
                'releaseTrain': props.get('releaseTrain', ''),
                'autoUpgradeMinorVersion': props.get('autoUpgradeMinorVersion', False),
            })

        node_exts = {}
        for node_name, exts in result.get('node_extensions', {}).items():
            normalized = []
            for ext in exts:
                props = ext.get('properties', {})
                normalized.append({
                    'name': ext.get('name', ''),
                    'type': props.get('type', ext.get('type', '')),
                    'provisioningState': props.get('provisioningState', 'Unknown'),
                    'publisher': props.get('publisher', ''),
                    'typeHandlerVersion': props.get('typeHandlerVersion', ''),
                })
            node_exts[node_name] = normalized

        return jsonify({
            'arb_extensions': arb,
            'node_extensions': node_exts
        })
    except Exception as e:
        return jsonify({
            'arb_extensions': [],
            'node_extensions': {},
            'error': str(e)
        }), 500
