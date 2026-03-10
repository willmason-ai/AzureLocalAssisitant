import { useQuery } from '@tanstack/react-query';
import { Container, Server } from 'lucide-react';
import api from '../services/api';
import StatusBadge from '../components/common/StatusBadge';
import LoadingSpinner from '../components/common/LoadingSpinner';
import ErrorAlert from '../components/common/ErrorAlert';

export default function KubernetesPage() {
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['aks', 'clusters'],
    queryFn: async () => {
      const { data } = await api.get('/aks/clusters');
      return data;
    },
  });

  if (isLoading) return <LoadingSpinner size="lg" className="mt-20" />;
  if (isError) return <ErrorAlert message={(error as any)?.response?.data?.error || (error as any)?.message} onRetry={() => refetch()} />;

  const clusters = data?.clusters || [];

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold text-slate-100">Kubernetes (AKS Arc)</h2>

      {clusters.length === 0 ? (
        <div className="bg-slate-800 border border-slate-700 rounded-lg p-8 text-center">
          <Container className="w-12 h-12 text-slate-600 mx-auto mb-3" />
          <p className="text-sm text-slate-400">No AKS clusters deployed</p>
          <p className="text-xs text-slate-500 mt-1">
            Deploy an AKS Arc cluster on your Azure Local environment to see it here.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {clusters.map((cluster: any, i: number) => (
            <div key={i} className="bg-slate-800 border border-slate-700 rounded-lg p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Container className="w-5 h-5 text-blue-400" />
                  <h3 className="text-sm font-semibold text-slate-100">
                    {cluster.name || 'AKS Cluster'}
                  </h3>
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
    </div>
  );
}
