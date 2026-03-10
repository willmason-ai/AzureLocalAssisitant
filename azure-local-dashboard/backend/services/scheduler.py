import logging

from apscheduler.schedulers.background import BackgroundScheduler

from backend.utils.enums import resolve_enums, CLUSTER_NODE_STATE, CLUSTER_NODE_STATUS

logger = logging.getLogger(__name__)


class HealthScheduler:
    def __init__(self, app, ps_executor, history_store=None):
        self.app = app
        self.ps_executor = ps_executor
        self.history_store = history_store
        self.scheduler = BackgroundScheduler()
        self._cache = {}

        interval = app.config.get('HEALTH_CHECK_INTERVAL', 60)
        self.scheduler.add_job(
            self._check_cluster_health,
            'interval',
            seconds=interval,
            id='cluster_health'
        )

        cred_interval = app.config.get('CREDENTIAL_CHECK_INTERVAL', 21600)
        self.scheduler.add_job(
            self._check_credentials,
            'interval',
            seconds=cred_interval,
            id='credential_check'
        )

        # Snapshot persistence every 5 minutes
        if self.history_store:
            self.scheduler.add_job(
                self._persist_snapshot,
                'interval',
                seconds=300,
                id='persist_snapshot'
            )
            # Daily purge of old records
            self.scheduler.add_job(
                self._purge_old_data,
                'interval',
                hours=24,
                id='purge_old'
            )

    def start(self):
        self.scheduler.start()
        logger.info("Health scheduler started")

    def stop(self):
        self.scheduler.shutdown()

    def get_cached(self, key: str):
        return self._cache.get(key)

    def _check_cluster_health(self):
        try:
            result = self.ps_executor.execute(
                'Get-ClusterNode | Select-Object Name, State, StatusInformation | ConvertTo-Json',
                target_node='any',
                timeout=30
            )
            if result.success:
                resolve_enums(result.parsed, {
                    'State': CLUSTER_NODE_STATE,
                    'StatusInformation': CLUSTER_NODE_STATUS,
                })
                self._cache['cluster_health'] = result.parsed
        except Exception as e:
            logger.error(f"Health check failed: {e}")

    def _check_credentials(self):
        try:
            result = self.ps_executor.execute(
                '$f = Get-Item "C:\\ClusterStorage\\Infrastructure_1\\Shares\\SU1_Infrastructure_1'
                '\\MocArb\\WorkingDirectory\\Appliance\\kvatoken.tok"; '
                '[PSCustomObject]@{ Name = $f.Name; LastWriteTime = $f.LastWriteTime.ToString("o") } '
                '| ConvertTo-Json',
                target_node='any',
                timeout=30
            )
            if result.success:
                self._cache['kva_token'] = result.parsed
        except Exception as e:
            logger.error(f"Credential check failed: {e}")

    def _persist_snapshot(self):
        """Save current cluster state to SQLite history."""
        if not self.history_store:
            return
        try:
            cached = self._cache.get('cluster_health')
            if not cached:
                return
            nodes = cached if isinstance(cached, list) else [cached]
            for node in nodes:
                if not isinstance(node, dict):
                    continue
                self.history_store.save_snapshot(
                    node_name=node.get('Name', 'unknown'),
                    node_state=node.get('State', 'Unknown'),
                    raw_data=node
                )
        except Exception as e:
            logger.error(f"Snapshot persistence failed: {e}")

    def _purge_old_data(self):
        """Remove records older than 60 days."""
        if not self.history_store:
            return
        try:
            self.history_store.purge_old(retention_days=60)
        except Exception as e:
            logger.error(f"Data purge failed: {e}")
