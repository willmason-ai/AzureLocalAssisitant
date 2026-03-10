import { useState } from 'react';
import { Download, Clock, CheckCircle, Play, ChevronDown, ChevronUp } from 'lucide-react';
import { useUpdates, useCurrentUpdate, useUpdateHistory, useStartUpdate } from '../hooks/useUpdates';
import StatusBadge from '../components/common/StatusBadge';
import LoadingSpinner from '../components/common/LoadingSpinner';
import ConfirmModal from '../components/common/ConfirmModal';
import ErrorAlert from '../components/common/ErrorAlert';
import UpdateTimeline from '../components/updates/UpdateTimeline';
import { safeString } from '../utils/safeRender';

export default function UpdatesPage() {
  const { data: updates, isLoading, isError, error, refetch } = useUpdates();
  const { data: currentRun } = useCurrentUpdate();
  const { data: history } = useUpdateHistory();
  const startUpdate = useStartUpdate();
  const [showConfirm, setShowConfirm] = useState(false);
  const [historyExpanded, setHistoryExpanded] = useState(false);

  if (isLoading) return <LoadingSpinner size="lg" className="mt-20" />;
  if (isError) return <ErrorAlert message={(error as any)?.response?.data?.error || (error as any)?.message} onRetry={() => refetch()} />;

  const updateList = Array.isArray(updates?.updates) ? updates.updates : updates?.updates ? [updates.updates] : [];
  const historyList = Array.isArray(history?.history) ? history.history : history?.history ? [history.history] : [];
  const readyUpdates = updateList.filter((u: any) => String(u.State || '').toLowerCase() === 'ready');

  // Find current installed version (highest version with State=Installed)
  const installed = updateList
    .filter((u: any) => String(u.State || '').toLowerCase() === 'installed')
    .sort((a: any, b: any) => (b.Version || '').localeCompare(a.Version || ''));
  const currentVersion = installed.length > 0 ? installed[0] : null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-100">Update Management</h2>
        {readyUpdates.length > 0 && (
          <button
            onClick={() => setShowConfirm(true)}
            className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg transition-colors"
          >
            <Play className="w-4 h-4" />
            Apply Available Update
          </button>
        )}
      </div>

      {/* Section 1: Current State Hero Card */}
      <div className="bg-gradient-to-r from-slate-800 to-slate-800/80 border border-slate-700 rounded-lg p-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-slate-400 uppercase tracking-wider mb-1">Current Platform Version</p>
            {currentVersion ? (
              <>
                <h3 className="text-xl font-bold text-slate-100">{safeString(currentVersion.DisplayName)}</h3>
                <p className="text-sm font-mono text-blue-400 mt-1">v{safeString(currentVersion.Version)}</p>
              </>
            ) : (
              <h3 className="text-xl font-bold text-slate-400">Unknown</h3>
            )}
          </div>
          <div className="text-right">
            {readyUpdates.length > 0 ? (
              <div className="flex items-center gap-2 px-3 py-2 bg-amber-900/30 border border-amber-500/40 rounded-lg">
                <Download className="w-5 h-5 text-amber-400" />
                <div>
                  <p className="text-xs text-amber-300 font-semibold">{readyUpdates.length} Update Available</p>
                  <p className="text-[10px] text-amber-400/70">{safeString(readyUpdates[0]?.DisplayName)}</p>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2 px-3 py-2 bg-green-900/30 border border-green-500/40 rounded-lg">
                <CheckCircle className="w-5 h-5 text-green-400" />
                <p className="text-xs text-green-300 font-semibold">Up to Date</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Active Update Run */}
      {currentRun?.current_run && currentRun.current_run.State !== 'Succeeded' && (
        <div className="bg-slate-800 border border-blue-500/30 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <Clock className="w-5 h-5 text-blue-400 animate-pulse" />
            <h3 className="text-sm font-semibold text-slate-100">Active Update In Progress</h3>
          </div>
          <p className="text-sm text-slate-300">{safeString(currentRun.current_run.DisplayName)}</p>
          <div className="flex items-center gap-4 mt-2 text-xs text-slate-400">
            <StatusBadge status={currentRun.current_run.State} />
            <span>Started: {safeString(currentRun.current_run.StartTimeUtc)}</span>
          </div>
        </div>
      )}

      {/* Section 2: Update Timeline */}
      <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
        <h3 className="text-sm font-semibold text-slate-100 mb-4">Update Timeline</h3>
        {updateList.length > 0 ? (
          <UpdateTimeline updates={updateList} />
        ) : (
          <p className="text-sm text-slate-500">No updates found</p>
        )}
      </div>

      {/* Section 3: Update Run History (collapsible) */}
      <div className="bg-slate-800 border border-slate-700 rounded-lg overflow-hidden">
        <button
          onClick={() => setHistoryExpanded(!historyExpanded)}
          className="w-full px-4 py-3 border-b border-slate-700 flex items-center justify-between hover:bg-slate-700/30 transition-colors"
        >
          <h3 className="text-sm font-semibold text-slate-100">
            Update Run History ({historyList.length})
          </h3>
          {historyExpanded ? (
            <ChevronUp className="w-4 h-4 text-slate-400" />
          ) : (
            <ChevronDown className="w-4 h-4 text-slate-400" />
          )}
        </button>
        {historyExpanded && (
          <div className="divide-y divide-slate-700">
            {historyList.length === 0 ? (
              <p className="p-4 text-sm text-slate-500">No update runs found</p>
            ) : (
              historyList.map((run: any, i: number) => (
                <div key={i} className="px-4 py-3 flex items-center justify-between">
                  <div>
                    <p className="text-sm text-slate-200">{safeString(run.DisplayName)}</p>
                    <p className="text-xs text-slate-500">
                      {safeString(run.StartTimeUtc)} - {safeString(run.EndTimeUtc, 'In Progress')}
                    </p>
                  </div>
                  <StatusBadge status={run.State} />
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {showConfirm && (
        <ConfirmModal
          title="Start Update"
          message={`Apply the available update: ${readyUpdates[0]?.DisplayName}? This will initiate the solution update process on the cluster.`}
          confirmLabel="Start Update"
          variant="warning"
          onConfirm={() => {
            startUpdate.mutate();
            setShowConfirm(false);
          }}
          onCancel={() => setShowConfirm(false)}
        />
      )}
    </div>
  );
}
