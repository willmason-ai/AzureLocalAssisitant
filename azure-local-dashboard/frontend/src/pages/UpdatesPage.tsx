import { useState } from 'react';
import { Download, Clock, CheckCircle, Play, ChevronDown, ChevronUp, Calendar, Terminal, Copy, Check } from 'lucide-react';
import { useUpdates, useCurrentUpdate, useUpdateHistory, useStartUpdate } from '../hooks/useUpdates';
import StatusBadge from '../components/common/StatusBadge';
import LoadingSpinner from '../components/common/LoadingSpinner';
import ConfirmModal from '../components/common/ConfirmModal';
import ErrorAlert from '../components/common/ErrorAlert';
import UpdateTimeline from '../components/updates/UpdateTimeline';
import { safeString } from '../utils/safeRender';

function formatDateTime(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString('en-US', {
      year: 'numeric', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return dateStr;
  }
}

function durationStr(start: string | null | undefined, end: string | null | undefined): string | null {
  if (!start || !end) return null;
  try {
    const ms = new Date(end).getTime() - new Date(start).getTime();
    if (isNaN(ms) || ms < 0) return null;
    const h = Math.floor(ms / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  } catch {
    return null;
  }
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
      className="p-1 rounded hover:bg-slate-600 transition-colors"
      title="Copy to clipboard"
    >
      {copied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5 text-slate-400" />}
    </button>
  );
}

function StaticDataBanner() {
  const [expanded, setExpanded] = useState(false);
  const updatesCmd = 'Get-SolutionUpdate | Select-Object DisplayName, Version, State, InstalledDate, DateCreated | Format-Table -AutoSize';
  const historyCmd = 'Get-SolutionUpdateRun | Sort-Object StartTimeUtc -Descending | Select-Object DisplayName, State, StartTimeUtc, EndTimeUtc | Format-Table -AutoSize';

  return (
    <div className="bg-amber-900/15 border border-amber-500/30 rounded-lg overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-4 py-2.5 flex items-center gap-3 hover:bg-amber-900/10 transition-colors"
      >
        <Terminal className="w-4 h-4 text-amber-400 shrink-0" />
        <p className="text-xs text-amber-300 text-left flex-1">
          Showing approximate dates. To get exact install dates, RDP to a cluster node and run the commands below.
        </p>
        <ChevronDown className={`w-4 h-4 text-amber-400 transition-transform ${expanded ? 'rotate-180' : ''}`} />
      </button>
      {expanded && (
        <div className="px-4 pb-3 space-y-3">
          <div>
            <div className="flex items-center justify-between mb-1">
              <p className="text-[10px] text-amber-400/70 uppercase tracking-wider font-semibold">Update install dates</p>
              <CopyButton text={updatesCmd} />
            </div>
            <pre className="bg-slate-900/80 rounded px-3 py-2 text-xs text-slate-300 font-mono overflow-x-auto">{updatesCmd}</pre>
          </div>
          <div>
            <div className="flex items-center justify-between mb-1">
              <p className="text-[10px] text-amber-400/70 uppercase tracking-wider font-semibold">Update run history with timestamps</p>
              <CopyButton text={historyCmd} />
            </div>
            <pre className="bg-slate-900/80 rounded px-3 py-2 text-xs text-slate-300 font-mono overflow-x-auto">{historyCmd}</pre>
          </div>
          <p className="text-[10px] text-slate-500">
            These commands must be run locally on dell-as01 or dell-as02 via RDP (they timeout over remote WinRM).
            Paste the output to the AI Assistant and it can update the stored dates.
          </p>
        </div>
      )}
    </div>
  );
}

export default function UpdatesPage() {
  const { data: updates, isLoading, isError, error, refetch } = useUpdates();
  const { data: currentRun } = useCurrentUpdate();
  const { data: history } = useUpdateHistory();
  const startUpdate = useStartUpdate();
  const [showConfirm, setShowConfirm] = useState(false);
  const [historyExpanded, setHistoryExpanded] = useState(true);

  if (isLoading) return <LoadingSpinner size="lg" className="mt-20" />;
  if (isError) return <ErrorAlert message={(error as any)?.response?.data?.error || (error as any)?.message} onRetry={() => refetch()} />;

  const isStaticFallback = updates?.static_fallback;

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

      {isStaticFallback && <StaticDataBanner />}

      {/* Section 1: Current State Hero Card */}
      <div className="bg-gradient-to-r from-slate-800 to-slate-800/80 border border-slate-700 rounded-lg p-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-slate-400 uppercase tracking-wider mb-1">Current Platform Version</p>
            {currentVersion ? (
              <>
                <h3 className="text-xl font-bold text-slate-100">{safeString(currentVersion.DisplayName)}</h3>
                <p className="text-sm font-mono text-blue-400 mt-1">v{safeString(currentVersion.Version)}</p>
                {currentVersion.InstalledDate && (
                  <p className="text-xs text-slate-500 mt-1 flex items-center gap-1">
                    <Calendar className="w-3 h-3" />
                    Installed {formatDateTime(currentVersion.InstalledDate)}
                  </p>
                )}
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
            <span>Started: {formatDateTime(currentRun.current_run.StartTimeUtc)}</span>
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

      {/* Section 3: Update Run History (expanded by default) */}
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
              historyList.map((run: any, i: number) => {
                const duration = durationStr(run.StartTimeUtc, run.EndTimeUtc);
                return (
                  <div key={i} className="px-4 py-3 flex items-center justify-between">
                    <div>
                      <p className="text-sm text-slate-200">{safeString(run.DisplayName)}</p>
                      <div className="flex items-center gap-3 mt-0.5">
                        <p className="text-xs text-slate-500">
                          {formatDateTime(run.StartTimeUtc)}
                          {run.EndTimeUtc ? ` → ${formatDateTime(run.EndTimeUtc)}` : ' — In Progress'}
                        </p>
                        {duration && (
                          <span className="text-xs text-slate-600">({duration})</span>
                        )}
                      </div>
                    </div>
                    <StatusBadge status={run.State} />
                  </div>
                );
              })
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
