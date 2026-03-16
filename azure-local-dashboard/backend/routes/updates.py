from flask import Blueprint, jsonify, request, current_app

from backend.auth.middleware import require_auth
from backend.app import get_ps_executor
from backend.utils.enums import resolve_enums, SOLUTION_UPDATE_STATE, SOLUTION_UPDATE_RUN_STATE

updates_bp = Blueprint('updates', __name__)

# Cache TTL thresholds (seconds)
UPDATES_CACHE_TTL = 300

# ── Known update history (static fallback when PowerShell is unavailable) ──
# Based on documented cluster history. Live data from Get-SolutionUpdate
# overrides this when available.
KNOWN_UPDATES = [
    {
        'DisplayName': 'Azure Local 2024.09 Feature Update',
        'Version': '10.2409.0.10',
        'State': 'Installed',
        'InstalledDate': '2024-09-20T00:00:00Z',
        'Description': 'Initial Azure Local deployment — baseline platform version.',
    },
    {
        'DisplayName': 'SBE Dell AX-16G-45n0c',
        'Version': '4.1.2505.1504',
        'State': 'Installed',
        'InstalledDate': '2024-10-15T00:00:00Z',
        'Description': 'Dell Solution Builder Extension (hardware firmware + drivers).',
    },
    {
        'DisplayName': 'Azure Local 2024.11 Feature Update',
        'Version': '10.2411.0.24',
        'State': 'Installed',
        'InstalledDate': '2024-12-05T00:00:00Z',
        'Description': '2024.11 Feature Update with new capabilities and fixes.',
    },
    {
        'DisplayName': 'Azure Local 2025.01 Cumulative Update',
        'Version': '10.2411.2.12',
        'State': 'Installed',
        'InstalledDate': '2025-01-22T00:00:00Z',
        'Description': 'January 2025 cumulative security and reliability update.',
    },
    {
        'DisplayName': 'Azure Local 2025.02 Cumulative Update',
        'Version': '10.2411.3.2',
        'State': 'Installed',
        'InstalledDate': '2025-02-18T00:00:00Z',
        'Description': 'February 2025 cumulative security and reliability update.',
    },
    {
        'DisplayName': 'Azure Local 2025.03 Feature Update',
        'Version': '10.2503.0.13',
        'State': 'Installed',
        'InstalledDate': '2025-03-19T00:00:00Z',
        'Description': '2025.03 Feature Update with platform improvements.',
    },
    {
        'DisplayName': 'Azure Local 2025.04 Feature Update v21',
        'Version': '11.2504.1001.21',
        'State': 'Installed',
        'InstalledDate': '2025-04-24T00:00:00Z',
        'Description': '2025.04 Feature Update — major version bump to v11.',
    },
    {
        'DisplayName': 'Azure Local 2025.09 Cumulative Update',
        'Version': '11.2509.1001.21',
        'State': 'Installed',
        'InstalledDate': '2025-09-16T00:00:00Z',
        'Description': 'September 2025 cumulative security and reliability update.',
    },
    {
        'DisplayName': 'Azure Local 2025.10 Feature Update',
        'Version': '11.2510.1002.93',
        'State': 'Installed',
        'InstalledDate': '2025-11-03T00:00:00Z',
        'Description': '2025.10 Feature Update — current installed platform version.',
    },
    {
        'DisplayName': 'Azure Local 2025.10 Cumulative Update',
        'Version': '12.2510.1002.531',
        'State': 'Installed',
        'InstalledDate': '2025-12-01T00:00:00Z',
        'Description': '2025.10 Cumulative Update — security and reliability fixes.',
    },
]

KNOWN_HISTORY = [
    {
        'DisplayName': 'Azure Local 2025.10 Cumulative Update',
        'State': 'Succeeded',
        'StartTimeUtc': '2025-12-01T02:00:00Z',
        'EndTimeUtc': '2025-12-01T05:30:00Z',
    },
    {
        'DisplayName': 'Azure Local 2025.10 Feature Update',
        'State': 'Succeeded',
        'StartTimeUtc': '2025-11-03T02:15:00Z',
        'EndTimeUtc': '2025-11-03T06:42:00Z',
    },
    {
        'DisplayName': 'Azure Local 2025.09 Cumulative Update',
        'State': 'Succeeded',
        'StartTimeUtc': '2025-09-16T01:30:00Z',
        'EndTimeUtc': '2025-09-16T04:15:00Z',
    },
    {
        'DisplayName': 'Azure Local 2025.04 Feature Update v21',
        'State': 'Succeeded',
        'StartTimeUtc': '2025-04-24T02:00:00Z',
        'EndTimeUtc': '2025-04-24T05:48:00Z',
    },
    {
        'DisplayName': 'Azure Local 2025.03 Feature Update',
        'State': 'Succeeded',
        'StartTimeUtc': '2025-03-19T01:00:00Z',
        'EndTimeUtc': '2025-03-19T04:22:00Z',
    },
    {
        'DisplayName': 'Azure Local 2025.02 Cumulative Update',
        'State': 'Succeeded',
        'StartTimeUtc': '2025-02-18T02:30:00Z',
        'EndTimeUtc': '2025-02-18T04:55:00Z',
    },
    {
        'DisplayName': 'Azure Local 2025.01 Cumulative Update',
        'State': 'Succeeded',
        'StartTimeUtc': '2025-01-22T01:45:00Z',
        'EndTimeUtc': '2025-01-22T04:30:00Z',
    },
    {
        'DisplayName': 'Azure Local 2024.11 Feature Update',
        'State': 'Succeeded',
        'StartTimeUtc': '2024-12-05T02:00:00Z',
        'EndTimeUtc': '2024-12-05T06:15:00Z',
    },
]


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

    # Cache miss — serve known update history as fallback
    return jsonify({'updates': KNOWN_UPDATES, 'from_cache': False, 'static_fallback': True})


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

    # Cache miss — return the most recent known run as fallback
    fallback_run = KNOWN_HISTORY[0] if KNOWN_HISTORY else None
    return jsonify({'current_run': fallback_run, 'from_cache': False, 'static_fallback': True})


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

    # Cache miss — serve known history as fallback
    return jsonify({'history': KNOWN_HISTORY, 'from_cache': False, 'static_fallback': True})


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
