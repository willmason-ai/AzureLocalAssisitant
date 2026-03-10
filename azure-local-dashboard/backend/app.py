import os
import logging
import time

from flask import Flask, send_from_directory, request, g
from flask_cors import CORS
from dotenv import load_dotenv

from backend.config import Config
from backend.routes import register_blueprints

logger = logging.getLogger(__name__)


def setup_logging(app):
    """Configure structured logging for the application."""
    log_level = os.getenv('LOG_LEVEL', 'INFO').upper()
    log_format = '%(asctime)s [%(levelname)s] %(name)s: %(message)s'

    logging.basicConfig(
        level=getattr(logging, log_level, logging.INFO),
        format=log_format,
        datefmt='%Y-%m-%d %H:%M:%S',
    )

    # Quiet down noisy libraries
    logging.getLogger('urllib3').setLevel(logging.WARNING)
    logging.getLogger('paramiko').setLevel(logging.WARNING)

    logger.info(f"Logging configured at {log_level} level")


def create_app(config_class=Config):
    load_dotenv()

    static_folder = os.path.join(os.path.dirname(__file__), '..', 'frontend', 'dist')
    app = Flask(__name__, static_folder=static_folder, static_url_path='')

    app.config.from_object(config_class)
    setup_logging(app)
    CORS(app, resources={r"/api/*": {"origins": "*"}})

    # Request logging — log every API call with timing
    @app.before_request
    def log_request_start():
        if request.path.startswith('/api/'):
            g.request_start = time.time()

    @app.after_request
    def log_request_end(response):
        if request.path.startswith('/api/'):
            duration = (time.time() - g.get('request_start', time.time())) * 1000
            log_line = f"{request.method} {request.path} -> {response.status_code} ({duration:.0f}ms)"
            if response.status_code >= 500:
                logger.error(log_line)
            elif response.status_code >= 400:
                logger.warning(log_line)
            else:
                logger.info(log_line)
        return response

    logger.info(f"Azure Local Dashboard starting on port {app.config.get('PORT', 5230)}")
    logger.info(f"Cluster: {app.config.get('AZURELOCAL_CLUSTER', 'unknown')}")
    logger.info(f"Nodes: {app.config.get('AZURELOCAL_NODE1')}, {app.config.get('AZURELOCAL_NODE2')}")

    # Initialize services lazily - they'll be created on first request
    app._ps_executor = None
    app._ai_service = None
    app._credential_store = None
    app._history_store = None
    app._scheduler = None

    register_blueprints(app)

    @app.route('/', defaults={'path': ''})
    @app.route('/<path:path>')
    def serve_frontend(path):
        static_dir = app.static_folder
        if path and os.path.exists(os.path.join(static_dir, path)):
            return send_from_directory(static_dir, path)
        index_path = os.path.join(static_dir, 'index.html')
        if os.path.exists(index_path):
            return send_from_directory(static_dir, 'index.html')
        return {'message': 'Frontend not built yet. Run: cd frontend && npm run build'}, 404

    return app


def get_ps_executor(app):
    if app._ps_executor is None:
        from backend.services.powershell import PowerShellExecutor
        app._ps_executor = PowerShellExecutor(app.config)
    return app._ps_executor


def get_ai_service(app):
    if app._ai_service is None:
        from backend.services.claude_ai import ClaudeAIService
        app._ai_service = ClaudeAIService(app.config, get_ps_executor(app))
    return app._ai_service


def get_credential_store(app):
    if app._credential_store is None:
        from backend.services.credential_store import CredentialStore
        app._credential_store = CredentialStore(app.config['CREDENTIAL_MASTER_KEY'])
    return app._credential_store


def get_history_store(app):
    if app._history_store is None:
        from backend.services.history_store import HistoryStore
        app._history_store = HistoryStore(app.config.get('DATA_DIR', '/app/data'))
    return app._history_store
