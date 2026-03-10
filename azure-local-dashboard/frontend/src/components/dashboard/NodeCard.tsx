import { Server, Cpu, MemoryStick, Clock } from 'lucide-react';
import StatusBadge from '../common/StatusBadge';
import type { ClusterNode, NodeInfo } from '../../types';

interface NodeCardProps {
  node: ClusterNode;
  info?: NodeInfo | { error: string };
}

export default function NodeCard({ node, info }: NodeCardProps) {
  const hasInfo = info && !('error' in info);

  return (
    <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Server className="w-5 h-5 text-blue-400" />
          <h3 className="text-sm font-semibold text-slate-100">{node.Name}</h3>
        </div>
        <StatusBadge status={node.State || 'Unknown'} />
      </div>

      {hasInfo ? (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <Cpu className="w-3.5 h-3.5" />
            <span>{(info as NodeInfo).CsNumberOfProcessors} Processors</span>
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <MemoryStick className="w-3.5 h-3.5" />
            <span>
              {Math.round(((info as NodeInfo).CsPhysicallyInstalledMemory || 0) / 1024 / 1024)} GB RAM
            </span>
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <Clock className="w-3.5 h-3.5" />
            <span>Uptime: {(info as NodeInfo).OsUptime || 'N/A'}</span>
          </div>
          <div className="text-xs text-slate-500 mt-2">
            {(info as NodeInfo).WindowsProductName} {(info as NodeInfo).OsVersion}
          </div>
        </div>
      ) : (
        <div className="text-xs text-slate-500">
          {info && 'error' in info ? info.error : 'Loading node details...'}
        </div>
      )}
    </div>
  );
}
