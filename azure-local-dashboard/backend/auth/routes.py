import logging
import time
from collections import defaultdict
from datetime import datetime, timedelta, timezone

import jwt
from flask import Blueprint, request, jsonify, current_app

from backend.auth.middleware import require_auth

logger = logging.getLogger(__name__)

auth_bp = Blueprint('auth', __name__)

# BUG-015: Simple in-memory rate limiter for login attempts
_login_attempts: dict[str, list[float]] = defaultdict(list)
_MAX_ATTEMPTS = 5
_WINDOW_SECONDS = 60


def _check_rate_limit(ip: str) -> bool:
    """Return True if the IP is rate-limited."""
    now = time.time()
    cutoff = now - _WINDOW_SECONDS
    _login_attempts[ip] = [t for t in _login_attempts[ip] if t > cutoff]
    return len(_login_attempts[ip]) >= _MAX_ATTEMPTS


def _record_attempt(ip: str):
    _login_attempts[ip].append(time.time())


@auth_bp.route('/login', methods=['POST'])
def login():
    client_ip = request.remote_addr or '0.0.0.0'
    if _check_rate_limit(client_ip):
        logger.warning(f"Rate limited login attempt from {client_ip}")
        return jsonify({'error': 'Too many login attempts. Try again in 60 seconds.'}), 429

    data = request.get_json()
    if not data or 'password' not in data:
        return jsonify({'error': 'Password is required'}), 400

    _record_attempt(client_ip)

    if data['password'] != current_app.config['DASHBOARD_PASSWORD']:
        logger.warning(f"Failed login attempt from {client_ip}")
        return jsonify({'error': 'Invalid password'}), 401

    logger.info(f"Successful login from {client_ip}")

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
