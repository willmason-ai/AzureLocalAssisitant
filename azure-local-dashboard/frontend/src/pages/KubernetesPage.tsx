import { useQuery } from '@tanstack/react-query';
import { Container, Server, Box, Layers, Image, RefreshCw } from 'lucide-react';
import api from '../services/api';
import StatusBadge from '../components/common/StatusBadge';
import LoadingSpinner from '../components/common/LoadingSpinner';
import ErrorAlert from '../components/common/ErrorAlert';

export default function KubernetesPage() {
  const { data: clusterData, isLoading: clustersLoading, isError: clustersError, error: clustersErr, refetch: refetchClusters } = useQuery({
    queryKey: ['aks', 'clusters'],
    queryFn: async () => {
      const { data } = await api.get('/aks/clusters');
      return data;
    },
  });

  const { data: workloads, isLoading: workloadsLoading, isError: workloadsError, error: workloadsErr, refetch: refetchWorkloads } = useQuery({
    queryKey: ['aks', 'workloads'],
    queryFn: async () => {
      const { data } = await api.get('/aks/workloads');
      return data;
    },
    refetchInterval: 30000,
  });

  const clusters = clusterData?.clusters || [];
  const pods = workloads?.pods || [];
  const deployments = workloads?.deployments || [];
  const images = workloads?.images || [];
  const summary = workloads?.summary || {};

  // Group pods by namespace
  const podsByNamespace: Record<string, any[]> = {};
  for (const pod of pods) {
    const ns = pod.namespace || 'default';
    if (!podsByNamespace[ns]) podsByNamespace[ns] = [];
    podsByNamespace[ns].push(pod);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-100">Kubernetes (AKS Arc)</h2>
        <button
          onClick={() => { refetchClusters(); refetchWorkloads(); }}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-slate-700 hover:bg-slate-600 text-slate-300 rounded transition-colors"
        >
          <RefreshCw className="w-3 h-3" />
          Refresh
        </button>
      </div>

      {/* AKS Arc Clusters */}
      {clustersLoading ? (
        <LoadingSpinner size="lg" className="mt-10" />
      ) : clustersError ? (
        <ErrorAlert message={(clustersErr as any)?.response?.data?.error || (clustersErr as any)?.message} onRetry={() => refetchClusters()} />
      ) : clusters.length === 0 ? (
        <div className="bg-slate-800 border border-slate-700 rounded-lg p-6 text-center">
          <Container className="w-10 h-10 text-slate-600 mx-auto mb-2" />
          <p className="text-sm text-slate-400">No AKS Arc clusters found via Azure API</p>
          <p className="text-xs text-slate-500 mt-1">az aksarc may require az login on the cluster nodes</p>
        </div>
      ) : (
        <div className="space-y-3">
          {clusters.map((cluster: any, i: number) => (
            <div key={i} className="bg-slate-800 border border-slate-700 rounded-lg p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Container className="w-5 h-5 text-blue-400" />
                  <h3 className="text-sm font-semibold text-slate-100">{cluster.name || 'AKS Cluster'}</h3>
                </div>
                <StatusBadge status={cluster.provisioningState || 'Unknown'} />
              </div>
              <div className="grid grid-cols-2 gap-4 text-xs">
                <div>
                  <span className="text-slate-400">K8s Version</span>
                  <p className="text-slate-200">{cluster.kubernetesVersion || 'N/A'}</p>
                </div>
                <div>
                  <span className="text-slate-400">Node Count</span>
                  <p className="text-slate-200">{cluster.agentPoolProfiles?.[0]?.count || 'N/A'}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Workload Summary */}
      {!workloadsLoading && !workloadsError && workloads && (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          {[
            { label: 'Namespaces', value: summary.total_namespaces, icon: Layers },
            { label: 'Deployments', value: summary.total_deployments, icon: Box },
            { label: 'Pods', value: summary.total_pods, icon: Container },
            { label: 'Running', value: summary.running_pods, icon: Server },
            { label: 'Images', value: summary.unique_images, icon: Image },
          ].map(({ label, value, icon: Icon }) => (
            <div key={label} className="bg-slate-800 border border-slate-700 rounded-lg p-3">
              <div className="flex items-center gap-2 mb-1">
                <Icon className="w-4 h-4 text-blue-400" />
                <span className="text-[10px] text-slate-400 uppercase tracking-wider">{label}</span>
              </div>
              <p className="text-xl font-bold text-slate-100">{value ?? '—'}</p>
            </div>
          ))}
        </div>
      )}

      {/* Deployments */}
      {workloadsLoading ? (
        <LoadingSpinner size="md" className="mt-4" />
      ) : workloadsError ? (
        <ErrorAlert message={(workloadsErr as any)?.response?.data?.error || (workloadsErr as any)?.message} onRetry={() => refetchWorkloads()} />
      ) : deployments.length > 0 && (
        <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
          <h3 className="text-sm font-semibold text-slate-100 mb-3 flex items-center gap-2">
            <Box className="w-4 h-4 text-blue-400" />
            Deployments ({deployments.length})
          </h3>
          <div className="space-y-2">
            {deployments.map((dep: any, i: number) => (
              <div key={i} className="bg-slate-900 rounded-lg p-3">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-slate-200">{dep.name}</span>
                    <span className="text-[10px] px-1.5 py-0.5 bg-slate-700 text-slate-400 rounded">{dep.namespace}</span>
                  </div>
                  <span className={`text-xs font-mono ${
                    dep.readyReplicas === dep.replicas && dep.replicas > 0
                      ? 'text-green-400' : 'text-amber-400'
                  }`}>
                    {dep.readyReplicas ?? 0}/{dep.replicas ?? 0} ready
                  </span>
                </div>
                {dep.images?.map((img: string, j: number) => (
                  <div key={j} className="flex items-center gap-2 text-[11px] text-slate-400 font-mono mt-1">
                    <Image className="w-3 h-3 text-slate-500 shrink-0" />
                    <span className="truncate" title={img}>{img}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Pods by Namespace */}
      {!workloadsLoading && !workloadsError && Object.keys(podsByNamespace).length > 0 && (
        <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
          <h3 className="text-sm font-semibold text-slate-100 mb-3 flex items-center gap-2">
            <Container className="w-4 h-4 text-blue-400" />
            Pods ({pods.length})
          </h3>
          <div className="space-y-4">
            {Object.entries(podsByNamespace)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([ns, nsPods]) => (
                <div key={ns}>
                  <h4 className="text-[10px] text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <Layers className="w-3 h-3" />
                    {ns} ({nsPods.length})
                  </h4>
                  <div className="space-y-1.5">
                    {nsPods.map((pod: any, i: number) => (
                      <div key={i} className="bg-slate-900 rounded p-2.5">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs text-slate-200 font-medium truncate max-w-[60%]" title={pod.name}>
                            {pod.name}
                          </span>
                          <div className="flex items-center gap-2">
                            {pod.node && (
                              <span className="text-[10px] text-slate-500 font-mono">{pod.node}</span>
                            )}
                            <StatusBadge status={pod.phase || 'Unknown'} />
                          </div>
                        </div>
                        {pod.containers?.map((c: any, j: number) => (
                          <div key={j} className="flex items-center justify-between text-[11px] mt-1">
                            <div className="flex items-center gap-1.5 text-slate-400 font-mono truncate max-w-[70%]" title={c.image}>
                              <Image className="w-3 h-3 text-slate-500 shrink-0" />
                              {c.image}
                            </div>
                            <div className="flex items-center gap-2">
                              <span className={c.ready ? 'text-green-400' : 'text-red-400'}>
                                {c.state}
                              </span>
                              {c.restarts > 0 && (
                                <span className="text-amber-400">{c.restarts}x</span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Unique Images */}
      {!workloadsLoading && !workloadsError && images.length > 0 && (
        <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
          <h3 className="text-sm font-semibold text-slate-100 mb-3 flex items-center gap-2">
            <Image className="w-4 h-4 text-blue-400" />
            Container Images ({images.length})
          </h3>
          <div className="space-y-1">
            {images.map((img: string, i: number) => (
              <div key={i} className="text-xs font-mono text-slate-400 bg-slate-900 rounded px-3 py-1.5 truncate" title={img}>
                {img}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
