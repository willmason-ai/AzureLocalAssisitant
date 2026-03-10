def register_blueprints(app):
    from .cluster import cluster_bp
    from .updates import updates_bp
    from .credentials import credentials_bp
    from .aks import aks_bp
    from .extensions import extensions_bp
    from .ai import ai_bp
    from .settings import settings_bp
    from .system import system_bp
    from .history import history_bp
    from .credential_mgmt import credential_mgmt_bp
    from backend.auth.routes import auth_bp

    app.register_blueprint(auth_bp, url_prefix='/api/auth')
    app.register_blueprint(cluster_bp, url_prefix='/api/cluster')
    app.register_blueprint(updates_bp, url_prefix='/api/updates')
    app.register_blueprint(credentials_bp, url_prefix='/api/credentials')
    app.register_blueprint(aks_bp, url_prefix='/api/aks')
    app.register_blueprint(extensions_bp, url_prefix='/api/extensions')
    app.register_blueprint(ai_bp, url_prefix='/api/ai')
    app.register_blueprint(settings_bp, url_prefix='/api/settings')
    app.register_blueprint(system_bp, url_prefix='/api')
    app.register_blueprint(history_bp, url_prefix='/api/history')
    app.register_blueprint(credential_mgmt_bp, url_prefix='/api/credential-sets')
