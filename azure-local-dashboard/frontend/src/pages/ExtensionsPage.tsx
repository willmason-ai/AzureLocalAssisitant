import { useQuery } from '@tanstack/react-query';
import { Puzzle, CheckCircle, AlertCircle } from 'lucide-react';
import api from '../services/api';
import StatusBadge from '../components/common/StatusBadge';
import LoadingSpinner from '../components/common/LoadingSpinner';

export default function ExtensionsPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['extensions'],
    queryFn: async () => {
      const { data } = await api.get('/extensions');
      return data;
    },
  });

  if (isLoading) return <LoadingSpinner size="lg" className="mt-20" />;

  const arbExtensions = data?.arb_extensions || [];
  const nodeExtensions = data?.node_extensions || {};

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold text-slate-100">Extensions & Services</h2>

      {/* ARB Extensions */}
      <div className="bg-slate-800 border border-slate-700 rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-700">
          <h3 className="text-sm font-semibold text-slate-100">Arc Resource Bridge Extensions</h3>
        </div>
        <div className="divide-y divide-slate-700">
          {Array.isArray(arbExtensions) && arbExtensions.length > 0 ? (
            arbExtensions.map((ext: any, i: number) => (
              <div key={i} className="px-4 py-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Puzzle className="w-4 h-4 text-blue-400" />
                  <div>
                    <p className="text-sm text-slate-200">{ext.name || ext.extensionType}</p>
                    <p className="text-xs text-slate-500">v{ext.version || 'N/A'}</p>
                  </div>
                </div>
                <StatusBadge status={ext.provisioningState || ext.installState || 'Unknown'} />
              </div>
            ))
          ) : (
            <p className="p-4 text-sm text-slate-500">No ARB extensions data available</p>
          )}
        </div>
      </div>

      {/* Node Extensions */}
      {Object.entries(nodeExtensions).map(([nodeName, exts]: [string, any]) => (
        <div key={nodeName} className="bg-slate-800 border border-slate-700 rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-700">
            <h3 className="text-sm font-semibold text-slate-100">{nodeName} Extensions</h3>
          </div>
          <div className="divide-y divide-slate-700">
            {Array.isArray(exts) && exts.length > 0 ? (
              exts.map((ext: any, i: number) => (
                <div key={i} className="px-4 py-3 flex items-center justify-between">
                  <div>
                    <p className="text-sm text-slate-200">{ext.name}</p>
                    <p className="text-xs text-slate-500">{ext.type || ext.extensionType}</p>
                  </div>
                  <StatusBadge status={ext.provisioningState || 'Unknown'} />
                </div>
              ))
            ) : (
              <p className="p-4 text-sm text-slate-500">
                {exts?.error || 'No extensions found'}
              </p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
