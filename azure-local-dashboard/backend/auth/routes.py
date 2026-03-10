import logging
from datetime import datetime, timedelta, timezone

import jwt
from flask import Blueprint, request, jsonify, current_app

from backend.auth.middleware import require_auth

logger = logging.getLogger(__name__)

auth_bp = Blueprint('auth', __name__)


@auth_bp.route('/login', methods=['POST'])
def login():
    data = request.get_json()
    if not data or 'password' not in data:
        return jsonify({'error': 'Password is required'}), 400

    if data['password'] != current_app.config['DASHBOARD_PASSWORD']:
        logger.warning(f"Failed login attempt from {request.remote_addr}")
        return jsonify({'error': 'Invalid password'}), 401

    logger.info(f"Successful login from {request.remote_addr}")

    expiry = datetime.now(timezone.utc) + timedelta(
        hours=current_app.config['JWT_EXPIRY_HOURS']
    )
    token = jwt.encode(
        {'exp': expiry, 'iat': datetime.now(timezone.utc)},
        current_app.config['JWT_SECRET'],
        algorithm='HS256'
    )

    return jsonify({
        'token': token,
        'expires_at': expiry.isoformat()
    })


@auth_bp.route('/verify', methods=['GET'])
@require_auth
def verify():
    return jsonify({'valid': True, 'user': request.user})
