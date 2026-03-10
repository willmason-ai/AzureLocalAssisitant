"""SQLite-backed history store for health snapshots and events."""

import json
import logging
import os
import sqlite3
import time
from contextlib import contextmanager
from datetime import datetime, timedelta

logger = logging.getLogger(__name__)


class HistoryStore:
    def __init__(self, data_dir: str = '/app/data'):
        os.makedirs(data_dir, exist_ok=True)
        self.db_path = os.path.join(data_dir, 'dashboard.db')
        self._init_db()

    @contextmanager
    def _conn(self):
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        conn.execute('PRAGMA journal_mode=WAL')
        try:
            yield conn
            conn.commit()
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()

    def _init_db(self):
        with self._conn() as conn:
            conn.execute('''
                CREATE TABLE IF NOT EXISTS health_snapshots (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    timestamp TEXT NOT NULL DEFAULT (datetime('now')),
                    node_name TEXT,
                    node_state TEXT,
                    ram_bytes INTEGER,
                    cpu_count INTEGER,
                    vm_count INTEGER,
                    storage_health TEXT,
                    raw_data TEXT
                )
            ''')
            conn.execute('''
                CREATE TABLE IF NOT EXISTS events (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    timestamp TEXT NOT NULL DEFAULT (datetime('now')),
                    event_type TEXT NOT NULL,
                    severity TEXT DEFAULT 'info',
                    source TEXT,
                    description TEXT,
                    raw_data TEXT
                )
            ''')
            conn.execute('''
                CREATE INDEX IF NOT EXISTS idx_snapshots_ts ON health_snapshots(timestamp)
            ''')
            conn.execute('''
                CREATE INDEX IF NOT EXISTS idx_events_ts ON events(timestamp)
            ''')
            conn.execute('''
                CREATE INDEX IF NOT EXISTS idx_events_type ON events(event_type)
            ''')
        logger.info(f"History store initialized at {self.db_path}")

    def save_snapshot(self, node_name: str, node_state: str, ram_bytes: int = None,
                      cpu_count: int = None, vm_count: int = None,
                      storage_health: str = None, raw_data: dict = None):
        with self._conn() as conn:
            conn.execute(
                'INSERT INTO health_snapshots (node_name, node_state, ram_bytes, cpu_count, vm_count, storage_health, raw_data) '
                'VALUES (?, ?, ?, ?, ?, ?, ?)',
                (node_name, node_state, ram_bytes, cpu_count, vm_count,
                 storage_health, json.dumps(raw_data) if raw_data else None)
            )

    def save_event(self, event_type: str, description: str, severity: str = 'info',
                   source: str = None, raw_data: dict = None):
        with self._conn() as conn:
            conn.execute(
                'INSERT INTO events (event_type, severity, source, description, raw_data) '
                'VALUES (?, ?, ?, ?, ?)',
                (event_type, severity, source, description,
                 json.dumps(raw_data) if raw_data else None)
            )

    def get_snapshots(self, hours: int = 24, node_name: str = None, limit: int = 500):
        since = (datetime.utcnow() - timedelta(hours=hours)).isoformat()
        query = 'SELECT * FROM health_snapshots WHERE timestamp >= ?'
        params = [since]
        if node_name:
            query += ' AND node_name = ?'
            params.append(node_name)
        query += ' ORDER BY timestamp DESC LIMIT ?'
        params.append(limit)

        with self._conn() as conn:
            rows = conn.execute(query, params).fetchall()
            return [dict(r) for r in rows]

    def get_events(self, hours: int = 24, event_type: str = None, limit: int = 200):
        since = (datetime.utcnow() - timedelta(hours=hours)).isoformat()
        query = 'SELECT * FROM events WHERE timestamp >= ?'
        params = [since]
        if event_type:
            query += ' AND event_type = ?'
            params.append(event_type)
        query += ' ORDER BY timestamp DESC LIMIT ?'
        params.append(limit)

        with self._conn() as conn:
            rows = conn.execute(query, params).fetchall()
            return [dict(r) for r in rows]

    def purge_old(self, retention_days: int = 60):
        cutoff = (datetime.utcnow() - timedelta(days=retention_days)).isoformat()
        with self._conn() as conn:
            snap_deleted = conn.execute(
                'DELETE FROM health_snapshots WHERE timestamp < ?', (cutoff,)
            ).rowcount
            evt_deleted = conn.execute(
                'DELETE FROM events WHERE timestamp < ?', (cutoff,)
            ).rowcount
        if snap_deleted or evt_deleted:
            logger.info(f"Purged {snap_deleted} snapshots and {evt_deleted} events older than {retention_days} days")

    def get_stats(self):
        with self._conn() as conn:
            snap_count = conn.execute('SELECT COUNT(*) FROM health_snapshots').fetchone()[0]
            evt_count = conn.execute('SELECT COUNT(*) FROM events').fetchone()[0]
            oldest_snap = conn.execute('SELECT MIN(timestamp) FROM health_snapshots').fetchone()[0]
            oldest_evt = conn.execute('SELECT MIN(timestamp) FROM events').fetchone()[0]
        return {
            'snapshot_count': snap_count,
            'event_count': evt_count,
            'oldest_snapshot': oldest_snap,
            'oldest_event': oldest_evt,
        }
