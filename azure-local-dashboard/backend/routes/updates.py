from flask import Blueprint, jsonify, request, current_app

from backend.auth.middleware import require_auth
from backend.app import get_ps_executor
from backend.utils.enums import resolve_enums, SOLUTION_UPDATE_STATE, SOLUTION_UPDATE_RUN_STATE

updates_bp = Blueprint('updates', __name__)

# Cache TTL thresholds (seconds)
UPDATES_CACHE_TTL = 300


def _ensure_list(data):
    """BUG-029: PowerShell ConvertTo-Json returns object for single items. Normalize to list."""
    if data is None:
        return []
    if isinstance(data, list):
        return data
    return [data]


def _get_scheduler():
    """Return the HealthScheduler from the app, or None."""
    return getattr(current_app, '_scheduler', None)


@updates_bp.route('', methods=['GET'])
@require_auth
def list_updates():
    scheduler = _get_scheduler()

    # Always serve from cache if available (stale-while-revalidate)
    if scheduler is not None and scheduler.has_cache('updates'):
        return jsonify({
            'updates': _ensure_list(scheduler.get_cache('updates')),
            'from_cache': True,
            'cache_age_seconds': round(scheduler.get_cache_age('updates'), 1),
        })

    # No cache at all — must fetch live (only happens on cold start before scheduler warms)
    ps = get_ps_executor(current_app)
    result = ps.execute(
        'Get-SolutionUpdate | Select-Object DisplayName, State, Version, '
        'DateCreated, InstalledDate, Description | ConvertTo-Json -Depth 3',
        target_node='any'
    )
    if not result.success:
        return jsonify({'error': result.stderr}), 500
    updates = _ensure_list(result.parsed)
    resolve_enums(updates, {'State': SOLUTION_UPDATE_STATE})
    return jsonify({'updates': updates, 'from_cache': False})


@updates_bp.route('/current', methods=['GET'])
@require_auth
def current_update():
    scheduler = _get_scheduler()

    if scheduler is not None and scheduler.has_cache('update_current'):
        return jsonify({
            'current_run': scheduler.get_cache('update_current'),
            'from_cache': True,
            'cache_age_seconds': round(scheduler.get_cache_age('update_current'), 1),
        })

    ps = get_ps_executor(current_app)
    result = ps.execute(
        'Get-SolutionUpdateRun | Sort-Object StartTimeUtc -Descending | '
        'Select-Object -First 1 | Select-Object DisplayName, State, '
        'StartTimeUtc, EndTimeUtc, Duration | ConvertTo-Json -Depth 3',
        target_node='any'
    )
    if not result.success:
        return jsonify({'error': result.stderr}), 500
    if result.parsed:
        resolve_enums(result.parsed, {'State': SOLUTION_UPDATE_RUN_STATE})
    return jsonify({'current_run': result.parsed, 'from_cache': False})


@updates_bp.route('/history', methods=['GET'])
@require_auth
def update_history():
    scheduler = _get_scheduler()

    if scheduler is not None and scheduler.has_cache('update_history'):
        return jsonify({
            'history': _ensure_list(scheduler.get_cache('update_history')),
            'from_cache': True,
            'cache_age_seconds': round(scheduler.get_cache_age('update_history'), 1),
        })

    ps = get_ps_executor(current_app)
    result = ps.execute(
        'Get-SolutionUpdateRun | Sort-Object StartTimeUtc -Descending | '
        'Select-Object DisplayName, State, StartTimeUtc, EndTimeUtc | '
        'ConvertTo-Json -Depth 3',
        target_node='any'
    )
    if not result.success:
        return jsonify({'error': result.stderr}), 500
    hist = _ensure_list(result.parsed)
    resolve_enums(hist, {'State': SOLUTION_UPDATE_RUN_STATE})
    return jsonify({'history': hist, 'from_cache': False})


@updates_bp.route('/environment', methods=['GET'])
@require_auth
def update_environment():
    ps = get_ps_executor(current_app)
    result = ps.execute(
        'Get-SolutionUpdateEnvironment | ConvertTo-Json -Depth 3',
        target_node='any'
    )
    if not result.success:
        return jsonify({'error': result.stderr}), 500
    return jsonify({'environment': result.parsed})


@updates_bp.route('/start', methods=['POST'])
@require_auth
def start_update():
    data = request.get_json()
    if not data or not data.get('confirm'):
        return jsonify({'error': 'Confirmation required. Send {"confirm": true}'}), 400

    ps = get_ps_executor(current_app)
    result = ps.execute(
        'Get-SolutionUpdate | Where-Object { $_.State -eq "Ready" } | '
        'Start-SolutionUpdate | ConvertTo-Json',
        target_node='any',
        timeout=300
    )
    if not result.success:
        return jsonify({'error': result.stderr}), 500
    return jsonify({'message': 'Update started', 'result': result.parsed})


@updates_bp.route('/cve', methods=['GET'])
@require_auth
def get_cves():
    from backend.services.cve_checker import CVEChecker
    try:
        checker = CVEChecker()
        cves = checker.get_recent_cves(months_back=3)
        return jsonify({'cves': cves})
    except Exception as e:
        return jsonify({'cves': [], 'error': str(e)}), 500
