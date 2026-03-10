import logging

from apscheduler.schedulers.background import BackgroundScheduler

logger = logging.getLogger(__name__)


class HealthScheduler:
    def __init__(self, app, ps_executor):
        self.app = app
        self.ps_executor = ps_executor
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
                self._cache['cluster_health'] = result.parsed
        except Exception as e:
            logger.error(f"Health check failed: {e}")

    def _check_credentials(self):
        try:
            result = self.ps_executor.execute(
                'Get-Item "C:\\ClusterStorage\\Infrastructure_1\\Shares\\SU1_Infrastructure_1'
                '\\MocArb\\WorkingDirectory\\Appliance\\kvatoken.tok" | '
                'Select-Object Name, LastWriteTime | ConvertTo-Json',
                target_node='any',
                timeout=30
            )
            if result.success:
                self._cache['kva_token'] = result.parsed
        except Exception as e:
            logger.error(f"Credential check failed: {e}")
