from flask import Blueprint, jsonify, request, current_app

from backend.auth.middleware import require_auth
from backend.app import get_ps_executor

updates_bp = Blueprint('updates', __name__)


@updates_bp.route('', methods=['GET'])
@require_auth
def list_updates():
    ps = get_ps_executor(current_app)
    result = ps.execute(
        'Get-SolutionUpdate | Select-Object DisplayName, State, Version, '
        'DateCreated, InstalledDate, Description | ConvertTo-Json -Depth 3',
        target_node='any'
    )
    if not result.success:
        return jsonify({'error': result.stderr}), 500
    return jsonify({'updates': result.parsed or []})


@updates_bp.route('/current', methods=['GET'])
@require_auth
def current_update():
    ps = get_ps_executor(current_app)
    result = ps.execute(
        'Get-SolutionUpdateRun | Sort-Object StartTimeUtc -Descending | '
        'Select-Object -First 1 | Select-Object DisplayName, State, '
        'StartTimeUtc, EndTimeUtc, Duration | ConvertTo-Json -Depth 3',
        target_node='any'
    )
    if not result.success:
        return jsonify({'error': result.stderr}), 500
    return jsonify({'current_run': result.parsed})


@updates_bp.route('/history', methods=['GET'])
@require_auth
def update_history():
    ps = get_ps_executor(current_app)
    result = ps.execute(
        'Get-SolutionUpdateRun | Sort-Object StartTimeUtc -Descending | '
        'Select-Object DisplayName, State, StartTimeUtc, EndTimeUtc | '
        'ConvertTo-Json -Depth 3',
        target_node='any'
    )
    if not result.success:
        return jsonify({'error': result.stderr}), 500
    return jsonify({'history': result.parsed or []})


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
    # CVE checker will be implemented in Phase 8
    return jsonify({'cves': [], 'message': 'CVE checking not yet configured'})
