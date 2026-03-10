from flask import Blueprint, jsonify, request, current_app

from backend.auth.middleware import require_auth

history_bp = Blueprint('history', __name__)


def _get_history_store():
    if not hasattr(current_app, '_history_store') or current_app._history_store is None:
        from backend.services.history_store import HistoryStore
        current_app._history_store = HistoryStore(current_app.config.get('DATA_DIR', '/app/data'))
    return current_app._history_store


@history_bp.route('/snapshots', methods=['GET'])
@require_auth
def get_snapshots():
    store = _get_history_store()
    hours = request.args.get('hours', 24, type=int)
    node = request.args.get('node', None)
    limit = request.args.get('limit', 500, type=int)
    snapshots = store.get_snapshots(hours=hours, node_name=node, limit=limit)
    return jsonify({'snapshots': snapshots, 'count': len(snapshots)})


@history_bp.route('/events', methods=['GET'])
@require_auth
def get_events():
    store = _get_history_store()
    hours = request.args.get('hours', 24, type=int)
    event_type = request.args.get('type', None)
    limit = request.args.get('limit', 200, type=int)
    events = store.get_events(hours=hours, event_type=event_type, limit=limit)
    return jsonify({'events': events, 'count': len(events)})


@history_bp.route('/stats', methods=['GET'])
@require_auth
def get_stats():
    store = _get_history_store()
    return jsonify(store.get_stats())
