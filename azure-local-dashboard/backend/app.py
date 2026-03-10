import os
import logging

from flask import Flask, send_from_directory
from flask_cors import CORS
from dotenv import load_dotenv

from backend.config import Config
from backend.routes import register_blueprints

logger = logging.getLogger(__name__)


def create_app(config_class=Config):
    load_dotenv()

    static_folder = os.path.join(os.path.dirname(__file__), '..', 'frontend', 'dist')
    app = Flask(__name__, static_folder=static_folder, static_url_path='')

    app.config.from_object(config_class)
    CORS(app, resources={r"/api/*": {"origins": "*"}})

    # Initialize services lazily - they'll be created on first request
    app._ps_executor = None
    app._ai_service = None
    app._credential_store = None
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
