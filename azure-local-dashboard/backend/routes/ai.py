import json

from flask import Blueprint, request, jsonify, current_app, Response, stream_with_context

from backend.auth.middleware import require_auth
from backend.app import get_ai_service, get_ps_executor

ai_bp = Blueprint('ai', __name__)


@ai_bp.route('/chat', methods=['POST'])
@require_auth
def chat():
    data = request.get_json()
    if not data or 'message' not in data:
        return jsonify({'error': 'Message is required'}), 400

    conversation_id = data.get('conversation_id', 'default')
    message = data['message']

    ai = get_ai_service(current_app)

    def generate():
        try:
            for event in ai.stream_chat(conversation_id, message):
                yield f"data: {json.dumps(event)}\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'type': 'error', 'message': str(e)})}\n\n"

    return Response(
        stream_with_context(generate()),
        mimetype='text/event-stream',
        headers={
            'Cache-Control': 'no-cache',
            'X-Accel-Buffering': 'no'
        }
    )


@ai_bp.route('/execute', methods=['POST'])
@require_auth
def execute_tool():
    data = request.get_json()
    if not data:
        return jsonify({'error': 'Request body required'}), 400

    required = ['conversation_id', 'tool_call_id', 'tool_name', 'tool_input']
    for field in required:
        if field not in data:
            return jsonify({'error': f'{field} is required'}), 400

    # Pre-execution safety check for PowerShell commands
    if data['tool_name'] == 'execute_powershell':
        ps = get_ps_executor(current_app)
        command = data['tool_input'].get('command', '')
        safety = ps.get_safety_classification(command)
        if not safety['allowed']:
            return jsonify({
                'error': safety['reason'],
                'safety_level': safety['level'],
                'blocked': True
            }), 403

    ai = get_ai_service(current_app)

    def generate():
        try:
            for event in ai.execute_tool_and_continue(
                data['conversation_id'],
                data['tool_call_id'],
                data['tool_name'],
                data['tool_input']
            ):
                yield f"data: {json.dumps(event)}\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'type': 'error', 'message': str(e)})}\n\n"

    return Response(
        stream_with_context(generate()),
        mimetype='text/event-stream',
        headers={
            'Cache-Control': 'no-cache',
            'X-Accel-Buffering': 'no'
        }
    )


@ai_bp.route('/safety-check', methods=['POST'])
@require_auth
def safety_check():
    """Pre-check a command's safety classification before execution."""
    data = request.get_json()
    if not data or 'command' not in data:
        return jsonify({'error': 'command is required'}), 400

    ps = get_ps_executor(current_app)
    classification = ps.get_safety_classification(data['command'])
    return jsonify(classification)


@ai_bp.route('/conversations', methods=['GET'])
@require_auth
def list_conversations():
    ai = get_ai_service(current_app)
    return jsonify({'conversations': ai.list_conversations()})


@ai_bp.route('/conversations/<conversation_id>', methods=['GET'])
@require_auth
def get_conversation(conversation_id):
    ai = get_ai_service(current_app)
    messages = ai.get_conversation(conversation_id)
    if messages is None:
        return jsonify({'error': 'Conversation not found'}), 404
    return jsonify({'messages': messages})


@ai_bp.route('/conversations/<conversation_id>', methods=['DELETE'])
@require_auth
def delete_conversation(conversation_id):
    ai = get_ai_service(current_app)
    ai.delete_conversation(conversation_id)
    return jsonify({'deleted': True})
