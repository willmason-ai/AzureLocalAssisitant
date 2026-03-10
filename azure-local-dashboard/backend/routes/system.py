import time

from flask import Blueprint, jsonify, current_app

system_bp = Blueprint('system', __name__)

_start_time = time.time()


@system_bp.route('/health', methods=['GET'])
def health():
    return jsonify({
        'status': 'ok',
        'uptime_seconds': round(time.time() - _start_time, 1)
    })


@system_bp.route('/config', methods=['GET'])
def get_config():
    cfg = current_app.config
    return jsonify({
        'cluster_name': cfg.get('AZURELOCAL_CLUSTER', ''),
        'domain': cfg.get('AZURELOCAL_DOMAIN', ''),
        'nodes': [
            cfg.get('AZURELOCAL_NODE1', ''),
            cfg.get('AZURELOCAL_NODE2', '')
        ],
        'azure': {
            'subscription_id': cfg.get('AZURE_SUBSCRIPTION_ID', ''),
            'resource_group': cfg.get('AZURE_RESOURCE_GROUP', ''),
            'tenant_id': cfg.get('AZURE_TENANT_ID', '')
        },
        'ai_configured': bool(cfg.get('ANTHROPIC_API_KEY'))
    })
