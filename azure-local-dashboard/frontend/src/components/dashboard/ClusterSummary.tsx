import { Activity, Server } from 'lucide-react';
import type { ClusterNode, HealthFault } from '../../types';

interface ClusterSummaryProps {
  nodes: ClusterNode[];
  healthFaults: HealthFault[];
  platformVersion?: string | null;
  platformName?: string | null;
}

export default function ClusterSummary({ nodes, healthFaults, platformVersion, platformName }: ClusterSummaryProps) {
  const onlineCount = nodes.filter(n => String(n.State ?? '').toLowerCase() === 'up').length;
  const totalCount = nodes.length;
  const isHealthy = onlineCount === totalCount && healthFaults.length === 0;

  return (
    <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
      <div className="flex items-center gap-2 mb-3">
        <Activity className="w-5 h-5 text-blue-400" />
        <h3 className="text-sm font-semibold text-slate-100">Cluster Health</h3>
      </div>

      <div className="flex items-center gap-4">
        <div
          className={`w-16 h-16 rounded-full flex items-center justify-center text-lg font-bold border-4 ${
            isHealthy
              ? 'border-green-500 text-green-400'
              : healthFaults.length > 0
              ? 'border-red-500 text-red-400'
              : 'border-amber-500 text-amber-400'
          }`}
        >
          {isHealthy ? 'OK' : healthFaults.length}
        </div>

        <div>
          <p className="text-sm text-slate-300">
            {onlineCount}/{totalCount} Nodes Online
          </p>
          <p className="text-xs text-slate-500">
            {healthFaults.length === 0
              ? 'No health faults detected'
              : `${healthFaults.length} health fault(s)`}
          </p>
        </div>
      </div>

      {platformVersion && (
        <div className="mt-3 pt-3 border-t border-slate-700 flex items-center gap-2">
          <Server className="w-3.5 h-3.5 text-slate-500" />
          <span className="text-xs text-slate-400">Platform:</span>
          <span className="text-xs font-mono text-blue-400">v{platformVersion}</span>
        </div>
      )}
    </div>
  );
}
