import logging
import time
import threading

from apscheduler.schedulers.background import BackgroundScheduler

from backend.utils.enums import (
    resolve_enums, CLUSTER_NODE_STATE, CLUSTER_NODE_STATUS,
    VM_STATE, SOLUTION_UPDATE_STATE, SOLUTION_UPDATE_RUN_STATE,
    MOC_HEALTH, MOC_STATE, HCI_CONNECTION_STATUS, HCI_REGISTRATION_STATUS,
)

logger = logging.getLogger(__name__)


def _emit_update(key: str):
    """Emit a SocketIO event to notify connected clients that cached data changed."""
    try:
        from backend.app import get_socketio
        sio = get_socketio()
        sio.emit('cluster_update', {'key': key})
        logger.debug(f"Emitted cluster_update for key={key}")
    except Exception as e:
        # Non-fatal: if SocketIO is not initialised yet, just skip
        logger.debug(f"Could not emit cluster_update: {e}")


class HealthScheduler:
    def __init__(self, app, ps_executor, history_store=None):
        self.app = app
        self.ps_executor = ps_executor
        self.history_store = history_store
        self.scheduler = BackgroundScheduler()
        self._cache = {}
        self._cache_timestamps = {}
        self._lock = threading.Lock()

        interval = app.config.get('HEALTH_CHECK_INTERVAL', 60)
        self.scheduler.add_job(
            self._check_cluster_health,
            'interval',
            seconds=interval,
            id='cluster_health'
        )

        # Collect storage, VMs, and node info on the same health interval
        self.scheduler.add_job(
            self._check_cluster_storage,
            'interval',
            seconds=interval,
            id='cluster_storage'
        )
        self.scheduler.add_job(
            self._check_cluster_vms,
            'interval',
            seconds=interval,
            id='cluster_vms'
        )
        self.scheduler.add_job(
            self._check_cluster_nodes,
            'interval',
            seconds=interval,
            id='cluster_nodes'
        )

        # Updates every 5 minutes
        update_interval = app.config.get('UPDATE_CHECK_INTERVAL', 300)
        self.scheduler.add_job(
            self._check_updates,
            'interval',
            seconds=update_interval,
            id='update_check'
        )
        self.scheduler.add_job(
            self._check_update_current,
            'interval',
            seconds=update_interval,
            id='update_current_check'
        )
        self.scheduler.add_job(
            self._check_update_history,
            'interval',
            seconds=update_interval,
            id='update_history_check'
        )

        cred_interval = app.config.get('CREDENTIAL_CHECK_INTERVAL', 3600)
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
        # Run initial data collection in background so cache is warm
        self.scheduler.add_job(self._initial_collect, id='initial_collect')
        logger.info("Health scheduler started")

    def stop(self):
        self.scheduler.shutdown()

    def _initial_collect(self):
        """Warm the cache on startup."""
        logger.info("Running initial cache warm-up")
        self._check_cluster_health()
        self._check_cluster_storage()
        self._check_cluster_vms()
        self._check_cluster_nodes()
        self._check_updates()
        self._check_update_current()
        self._check_update_history()
        self._check_credentials()
        logger.info("Initial cache warm-up complete")

    def _set_cache(self, key: str, value):
        """Store a value in the cache with a timestamp, then notify clients."""
        with self._lock:
            self._cache[key] = value
            self._cache_timestamps[key] = time.time()
        # Push a lightweight notification so the frontend can refetch
        _emit_update(key)

    def get_cache(self, key: str):
        """Return the cached value for *key*, or None if not present."""
        with self._lock:
            return self._cache.get(key)

    # Keep the old name as an alias for backward compatibility
    def get_cached(self, key: str):
        return self.get_cache(key)

    def get_cache_age(self, key: str) -> float:
        """Return the age of the cached value in seconds, or float('inf') if missing."""
        with self._lock:
            ts = self._cache_timestamps.get(key)
            if ts is None:
                return float('inf')
            return time.time() - ts

    def has_cache(self, key: str) -> bool:
        """Return True if there is any cached value for *key*, regardless of age."""
        with self._lock:
            return key in self._cache

    def force_refresh(self):
        """Force an immediate refresh of all cached data."""
        logger.info("Forcing full cache refresh")
        self._check_cluster_health()
        self._check_cluster_storage()
        self._check_cluster_vms()
        self._check_cluster_nodes()
        self._check_updates()
        self._check_update_current()
        self._check_update_history()
        self._check_credentials()
        logger.info("Full cache refresh complete")

    # ── health data collectors ──────────────────────────────────

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
                self._set_cache('cluster_health', result.parsed)

            # Also grab health faults
            faults_result = self.ps_executor.execute(
                'Get-HealthFault | Select-Object FaultId, FaultType, Severity, Description | ConvertTo-Json -Depth 3',
                target_node='any',
                timeout=30
            )
            if faults_result.success:
                self._set_cache('health_faults', faults_result.parsed)
        except Exception as e:
            logger.error(f"Health check failed: {e}")

    def _check_cluster_storage(self):
        try:
            pools = self.ps_executor.execute(
                'Get-StoragePool | Where-Object IsPrimordial -eq $false | '
                'Select-Object FriendlyName, HealthStatus, OperationalStatus, Size, AllocatedSize | '
                'ConvertTo-Json',
                target_node='any',
                timeout=30
            )
            if pools.success:
                self._set_cache('storage_pools', pools.parsed)

            disks = self.ps_executor.execute(
                'Get-VirtualDisk | Select-Object FriendlyName, OperationalStatus, HealthStatus, '
                'Size, FootprintOnPool | ConvertTo-Json',
                target_node='any',
                timeout=30
            )
            if disks.success:
                self._set_cache('virtual_disks', disks.parsed)
        except Exception as e:
            logger.error(f"Storage check failed: {e}")

    def _check_cluster_vms(self):
        try:
            result = self.ps_executor.execute(
                'Get-VM | Select-Object Name, State, CPUUsage, MemoryAssigned, Uptime, '
                'Status, ComputerName | ConvertTo-Json -Depth 2',
                target_node='any',
                timeout=30
            )
            if result.success:
                resolve_enums(result.parsed, {'State': VM_STATE})
                self._set_cache('cluster_vms', result.parsed)
        except Exception as e:
            logger.error(f"VM check failed: {e}")

    def _check_cluster_nodes(self):
        try:
            cim_query = (
                '$os = Get-CimInstance Win32_OperatingSystem; '
                '$ram = (Get-CimInstance Win32_PhysicalMemory | Measure-Object -Property Capacity -Sum).Sum; '
                '$cpu = (Get-CimInstance Win32_Processor | Measure-Object -Property NumberOfLogicalProcessors -Sum).Sum; '
                '[PSCustomObject]@{ '
                '  CsName = $os.CSName; '
                '  OsUptime = ((Get-Date) - $os.LastBootUpTime).ToString(); '
                '  CsNumberOfProcessors = $cpu; '
                '  PhysicalMemoryBytes = $ram; '
                '  WindowsProductName = $os.Caption; '
                '  OsVersion = $os.Version '
                '} | ConvertTo-Json'
            )
            nodes_data = {}
            for node_name in self.ps_executor.nodes:
                result = self.ps_executor.execute(cim_query, target_node=node_name, timeout=30)
                if result.success:
                    nodes_data[node_name] = result.parsed
                else:
                    nodes_data[node_name] = {'error': result.stderr}
            self._set_cache('cluster_nodes_detail', nodes_data)
        except Exception as e:
            logger.error(f"Node detail check failed: {e}")

    def _check_updates(self):
        try:
            result = self.ps_executor.execute(
                'Get-SolutionUpdate | Select-Object DisplayName, State, Version, '
                'DateCreated, InstalledDate, Description | ConvertTo-Json -Depth 3',
                target_node='any',
                timeout=60
            )
            if result.success:
                data = result.parsed if isinstance(result.parsed, list) else (
                    [result.parsed] if result.parsed else []
                )
                resolve_enums(data, {'State': SOLUTION_UPDATE_STATE})
                self._set_cache('updates', data)
        except Exception as e:
            logger.error(f"Update check failed: {e}")

    def _check_update_current(self):
        try:
            result = self.ps_executor.execute(
                'Get-SolutionUpdateRun | Sort-Object StartTimeUtc -Descending | '
                'Select-Object -First 1 | Select-Object DisplayName, State, '
                'StartTimeUtc, EndTimeUtc, Duration | ConvertTo-Json -Depth 3',
                target_node='any',
                timeout=60
            )
            if result.success:
                if result.parsed:
                    resolve_enums(result.parsed, {'State': SOLUTION_UPDATE_RUN_STATE})
                self._set_cache('update_current', result.parsed)
        except Exception as e:
            logger.error(f"Current update check failed: {e}")

    def _check_update_history(self):
        try:
            result = self.ps_executor.execute(
                'Get-SolutionUpdateRun | Sort-Object StartTimeUtc -Descending | '
                'Select-Object DisplayName, State, StartTimeUtc, EndTimeUtc | '
                'ConvertTo-Json -Depth 3',
                target_node='any',
                timeout=60
            )
            if result.success:
                data = result.parsed if isinstance(result.parsed, list) else (
                    [result.parsed] if result.parsed else []
                )
                resolve_enums(data, {'State': SOLUTION_UPDATE_RUN_STATE})
                self._set_cache('update_history', data)
        except Exception as e:
            logger.error(f"Update history check failed: {e}")

    def _check_credentials(self):
        try:
            kva_path = self.app.config.get('KVA_TOKEN_PATH', '').replace('\\', '\\\\')
            result = self.ps_executor.execute(
                f'$f = Get-Item "{kva_path}"; '
                '[PSCustomObject]@{ '
                '  Name = $f.Name; '
                '  LastWriteTime = $f.LastWriteTime.ToString("o"); '
                '  CreationTime = $f.CreationTime.ToString("o") '
                '} | ConvertTo-Json',
                target_node='any',
                timeout=30
            )
            if result.success:
                self._set_cache('kva_token', result.parsed)

            # HCI registration
            hci_result = self.ps_executor.execute(
                'Get-AzureStackHCI | ConvertTo-Json -Depth 3',
                target_node='any',
                timeout=30
            )
            if hci_result.success and hci_result.parsed:
                resolve_enums(hci_result.parsed, {
                    'ConnectionStatus': HCI_CONNECTION_STATUS,
                    'RegistrationStatus': HCI_REGISTRATION_STATUS,
                })
                self._set_cache('hci_registration', hci_result.parsed)

            # MOC node health
            moc_result = self.ps_executor.execute(
                'Get-MocNode -location "MocLocation" | '
                'Select-Object name, fqdn, health, state | ConvertTo-Json',
                target_node='any',
                timeout=30
            )
            if moc_result.success and moc_result.parsed:
                resolve_enums(moc_result.parsed, {
                    'health': MOC_HEALTH,
                    'state': MOC_STATE,
                })
                self._set_cache('moc_nodes', moc_result.parsed)
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
