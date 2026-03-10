import { useClusterStatus, useClusterNodes, useClusterVMs, useClusterStorage } from '../hooks/useClusterStatus';
import NodeCard from '../components/dashboard/NodeCard';
import ClusterSummary from '../components/dashboard/ClusterSummary';
import QuickStats from '../components/dashboard/QuickStats';
import AlertsList from '../components/dashboard/AlertsList';
import LoadingSpinner from '../components/common/LoadingSpinner';
import { AlertTriangle, RefreshCw } from 'lucide-react';

export default function DashboardPage() {
  const { data: status, isLoading: statusLoading, isError: statusError, error: statusErrorObj, refetch: refetchStatus } = useClusterStatus();
  const { data: nodesInfo } = useClusterNodes();
  const { data: vms } = useClusterVMs();
  const { data: storage } = useClusterStorage();

  if (statusLoading) {
    return <LoadingSpinner size="lg" className="mt-20" />;
  }

  if (statusError) {
    const errMsg = (statusErrorObj as any)?.response?.data?.error
      || (statusErrorObj as any)?.message
      || 'Failed to connect to cluster';
    return (
      <div className="mt-20 max-w-lg mx-auto bg-slate-800 border border-slate-700 rounded-lg p-6 text-center">
        <AlertTriangle className="w-10 h-10 text-amber-500 mx-auto mb-3" />
        <h3 className="text-base font-semibold text-slate-100 mb-2">Cluster Unreachable</h3>
        <p className="text-sm text-slate-400 mb-2">
          Could not fetch cluster status. The cluster nodes may be unreachable from this environment.
        </p>
        <pre className="text-xs text-red-400 bg-slate-900 rounded p-3 mb-4 text-left overflow-auto max-h-24">
          {errMsg}
        </pre>
        <button
          onClick={() => refetchStatus()}
          className="flex items-center gap-2 mx-auto px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          Retry
        </button>
      </div>
    );
  }

  const nodes = Array.isArray(status?.nodes) ? status.nodes : status?.nodes ? [status.nodes] : [];
  const faults = Array.isArray(status?.health_faults) ? status.health_faults : [];
  const vmList = Array.isArray(vms?.vms) ? vms.vms : [];

  // Compute cores and RAM from live node data instead of hardcoded values
  let totalCores = 0;
  let totalRamGB = 0;
  if (nodesInfo) {
    for (const nodeData of Object.values(nodesInfo) as any[]) {
      if (nodeData && !nodeData.error) {
        totalCores += Number(nodeData.CsNumberOfProcessors) || 0;
        const ramBytes = nodeData.PhysicalMemoryBytes || 0;
        const ramKB = nodeData.CsPhysicallyInstalledMemory || 0;
        totalRamGB += ramBytes
          ? Math.round(ramBytes / 1024 / 1024 / 1024)
          : Math.round(ramKB / 1024 / 1024);
      }
    }
  }

  // Calculate storage usage
  let storagePercent: number | undefined;
  if (storage?.storage_pools) {
    const pools = Array.isArray(storage.storage_pools) ? storage.storage_pools : [storage.storage_pools];
    const totalSize = pools.reduce((sum: number, p: any) => sum + (p.Size || 0), 0);
    const allocatedSize = pools.reduce((sum: number, p: any) => sum + (p.AllocatedSize || 0), 0);
    if (totalSize > 0) {
      storagePercent = Math.round((allocatedSize / totalSize) * 100);
    }
  }

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold text-slate-100">Cluster Dashboard</h2>

      <QuickStats
        totalCores={totalCores || 32}
        totalRamGB={totalRamGB || 1024}
        vmCount={vmList.length}
        storageUsedPercent={storagePercent}
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <ClusterSummary nodes={nodes} healthFaults={faults} />

        {nodes.map((node: any) => (
          <NodeCard
            key={node.Name}
            node={node}
            info={nodesInfo?.[node.Name?.toLowerCase().replace('.presidiorocks.com', '')]}
          />
        ))}
      </div>

      <AlertsList faults={faults} />
    </div>
  );
}
