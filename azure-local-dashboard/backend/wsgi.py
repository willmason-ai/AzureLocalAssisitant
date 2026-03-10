import os
from backend.app import create_app, get_ps_executor, get_history_store

app = create_app()

# Start the background health scheduler with history persistence
try:
    from backend.services.scheduler import HealthScheduler
    with app.app_context():
        ps = get_ps_executor(app)
        history = get_history_store(app)
        scheduler = HealthScheduler(app, ps, history_store=history)
        scheduler.start()
        app._scheduler = scheduler
except Exception as e:
    import logging
    logging.getLogger(__name__).warning(f"Scheduler failed to start: {e}")

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=app.config.get('PORT', 5230), debug=os.getenv('FLASK_DEBUG', 'false').lower() == 'true')
