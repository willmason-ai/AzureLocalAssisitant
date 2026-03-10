import { useClusterStatus, useClusterNodes, useClusterVMs, useClusterStorage } from '../hooks/useClusterStatus';
import NodeCard from '../components/dashboard/NodeCard';
import ClusterSummary from '../components/dashboard/ClusterSummary';
import QuickStats from '../components/dashboard/QuickStats';
import AlertsList from '../components/dashboard/AlertsList';
import LoadingSpinner from '../components/common/LoadingSpinner';

export default function DashboardPage() {
  const { data: status, isLoading: statusLoading } = useClusterStatus();
  const { data: nodesInfo } = useClusterNodes();
  const { data: vms } = useClusterVMs();
  const { data: storage } = useClusterStorage();

  if (statusLoading) {
    return <LoadingSpinner size="lg" className="mt-20" />;
  }

  const nodes = Array.isArray(status?.nodes) ? status.nodes : status?.nodes ? [status.nodes] : [];
  const faults = Array.isArray(status?.health_faults) ? status.health_faults : [];
  const vmList = Array.isArray(vms?.vms) ? vms.vms : [];

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
        totalCores={32}
        totalRamGB={1024}
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
