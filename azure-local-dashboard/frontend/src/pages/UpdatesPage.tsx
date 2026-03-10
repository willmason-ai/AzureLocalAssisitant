import { useState } from 'react';
import { Download, Clock, CheckCircle, AlertTriangle, Play } from 'lucide-react';
import { useUpdates, useCurrentUpdate, useUpdateHistory, useStartUpdate } from '../hooks/useUpdates';
import StatusBadge from '../components/common/StatusBadge';
import LoadingSpinner from '../components/common/LoadingSpinner';
import ConfirmModal from '../components/common/ConfirmModal';

export default function UpdatesPage() {
  const { data: updates, isLoading } = useUpdates();
  const { data: currentRun } = useCurrentUpdate();
  const { data: history } = useUpdateHistory();
  const startUpdate = useStartUpdate();
  const [showConfirm, setShowConfirm] = useState(false);

  if (isLoading) return <LoadingSpinner size="lg" className="mt-20" />;

  const updateList = Array.isArray(updates?.updates) ? updates.updates : updates?.updates ? [updates.updates] : [];
  const historyList = Array.isArray(history?.history) ? history.history : history?.history ? [history.history] : [];
  const readyUpdates = updateList.filter((u: any) => u.State === 'Ready');

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

      {/* Active Update Run */}
      {currentRun?.current_run && currentRun.current_run.State !== 'Succeeded' && (
        <div className="bg-slate-800 border border-blue-500/30 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <Clock className="w-5 h-5 text-blue-400 animate-pulse" />
            <h3 className="text-sm font-semibold text-slate-100">Active Update</h3>
          </div>
          <p className="text-sm text-slate-300">{currentRun.current_run.DisplayName}</p>
          <div className="flex items-center gap-4 mt-2 text-xs text-slate-400">
            <StatusBadge status={currentRun.current_run.State} />
            <span>Started: {currentRun.current_run.StartTimeUtc}</span>
          </div>
        </div>
      )}

      {/* Update List */}
      <div className="bg-slate-800 border border-slate-700 rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-700">
          <h3 className="text-sm font-semibold text-slate-100">All Updates</h3>
        </div>
        <div className="divide-y divide-slate-700">
          {updateList.length === 0 ? (
            <p className="p-4 text-sm text-slate-500">No updates found</p>
          ) : (
            updateList.map((update: any, i: number) => (
              <div key={i} className="px-4 py-3 flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-200">{update.DisplayName}</p>
                  <p className="text-xs text-slate-500">Version: {update.Version}</p>
                </div>
                <StatusBadge status={update.State} />
              </div>
            ))
          )}
        </div>
      </div>

      {/* Update History */}
      <div className="bg-slate-800 border border-slate-700 rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-700">
          <h3 className="text-sm font-semibold text-slate-100">Update History</h3>
        </div>
        <div className="divide-y divide-slate-700">
          {historyList.length === 0 ? (
            <p className="p-4 text-sm text-slate-500">No update runs found</p>
          ) : (
            historyList.map((run: any, i: number) => (
              <div key={i} className="px-4 py-3 flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-200">{run.DisplayName}</p>
                  <p className="text-xs text-slate-500">
                    {run.StartTimeUtc} - {run.EndTimeUtc || 'In Progress'}
                  </p>
                </div>
                <StatusBadge status={run.State} />
              </div>
            ))
          )}
        </div>
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
