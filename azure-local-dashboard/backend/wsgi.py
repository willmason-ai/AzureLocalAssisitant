import os
from backend.app import create_app, get_ps_executor, get_history_store, get_socketio

app = create_app()
socketio = get_socketio()

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
    # Use socketio.run() instead of app.run() so WebSocket transport works in dev mode.
    # For production with gunicorn, add:
    #   --worker-class geventwebsocket.gunicorn.workers.GeventWebSocketWorker
    socketio.run(
        app,
        host='0.0.0.0',
        port=app.config.get('PORT', 5230),
        debug=os.getenv('FLASK_DEBUG', 'false').lower() == 'true',
        allow_unsafe_werkzeug=True,
    )
