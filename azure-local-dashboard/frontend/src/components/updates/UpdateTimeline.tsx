import { CheckCircle, Clock, Download, ArrowRight, Calendar } from 'lucide-react';
import { safeString } from '../../utils/safeRender';

interface UpdateEntry {
  DisplayName: string;
  Version: string;
  State: string;
  InstalledDate?: string | null;
  DateCreated?: string | null;
  Description?: string | null;
}

interface UpdateTimelineProps {
  updates: UpdateEntry[];
}

// States that mean "this update was skipped or is not relevant"
const SKIPPED_STATES = new Set([
  'hasprerequisite', 'notapplicablebecauseanotherupdateisinprogress',
  'recalled', 'invalid', 'preparationfailed', 'installationfailed',
  'healthcheckfailed', 'scanfailed',
]);

function isTerminalState(s: string) {
  return s === 'installed' || s === 'succeeded' || SKIPPED_STATES.has(s);
}

function stateIcon(state: string) {
  const s = String(state ?? '').toLowerCase();
  if (s === 'installed' || s === 'succeeded') return <CheckCircle className="w-4 h-4 text-green-400" />;
  if (SKIPPED_STATES.has(s)) return <Clock className="w-4 h-4 text-slate-500" />;
  if (s === 'ready' || s === 'readytoinstall' || s === 'downloading') return <Download className="w-4 h-4 text-amber-400" />;
  if (s === 'preparing' || s === 'installing' || s === 'healthchecking' || s === 'scaninprogress') return <Clock className="w-4 h-4 text-blue-400 animate-pulse" />;
  return <Clock className="w-4 h-4 text-slate-500" />;
}

function stateDotColor(state: string, isCurrent: boolean) {
  const s = String(state ?? '').toLowerCase();
  if (isCurrent) return 'bg-blue-500 ring-4 ring-blue-500/20';
  if (s === 'installed' || s === 'succeeded') return 'bg-green-500';
  if (SKIPPED_STATES.has(s)) return 'bg-slate-600';
  if (s === 'ready' || s === 'readytoinstall' || s === 'downloading') return 'bg-amber-500 animate-pulse';
  if (s === 'preparing' || s === 'installing' || s === 'healthchecking') return 'bg-blue-500 animate-pulse';
  return 'bg-slate-600';
}

function stateLabel(state: string) {
  const s = String(state ?? '').toLowerCase();
  if (s === 'hasprerequisite') return 'Skipped';
  if (s === 'notapplicablebecauseanotherupdateisinprogress') return 'Superseded';
  if (s === 'recalled') return 'Recalled';
  if (s === 'invalid') return 'Invalid';
  if (s === 'preparationfailed' || s === 'installationfailed' || s === 'healthcheckfailed' || s === 'scanfailed') return 'Failed';
  return state;
}

function formatDate(dateStr: string | null | undefined): string | null {
  if (!dateStr) return null;
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return null;
    return d.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return null;
  }
}

export default function UpdateTimeline({ updates }: UpdateTimelineProps) {
  if (!updates || updates.length === 0) return null;

  // Sort: terminal states (installed/skipped) by version ascending, then actionable
  const terminal = updates
    .filter(u => isTerminalState(String(u.State ?? '').toLowerCase()))
    .sort((a, b) => (a.Version || '').localeCompare(b.Version || ''));
  const actionable = updates.filter(u => !isTerminalState(String(u.State ?? '').toLowerCase()));
  const sorted = [...terminal, ...actionable];

  // Current = last installed (not just any terminal state)
  const installedOnly = terminal.filter(u => {
    const s = String(u.State ?? '').toLowerCase();
    return s === 'installed' || s === 'succeeded';
  });
  const currentVersion = installedOnly.length > 0 ? installedOnly[installedOnly.length - 1].Version : null;

  return (
    <div className="relative">
      {sorted.map((update, idx) => {
        const isCurrent = update.Version === currentVersion;
        const stateStr = String(update.State ?? '').toLowerCase();
        const isSkipped = SKIPPED_STATES.has(stateStr);
        const isInstalled = stateStr === 'installed' || stateStr === 'succeeded';
        const isPending = !isInstalled && !isSkipped;
        const isLast = idx === sorted.length - 1;
        const installedDate = formatDate(update.InstalledDate);
        const createdDate = formatDate(update.DateCreated);
        const dateToShow = installedDate || createdDate;

        return (
          <div key={idx} className="relative flex gap-4">
            {/* Timeline line + dot */}
            <div className="flex flex-col items-center">
              <div className={`w-3 h-3 rounded-full mt-1.5 shrink-0 ${stateDotColor(update.State, isCurrent)}`} />
              {!isLast && (
                <div className={`w-0.5 flex-1 min-h-[2rem] ${isPending ? 'bg-slate-700 border-dashed' : 'bg-slate-600'}`} />
              )}
            </div>

            {/* Content */}
            <div className={`pb-4 flex-1`}>
              <div
                className={`rounded-lg p-3 ${
                  isCurrent
                    ? 'bg-blue-900/30 border border-blue-500/40'
                    : isPending
                    ? 'bg-amber-900/20 border border-amber-500/30'
                    : isSkipped
                    ? 'bg-slate-800/30 opacity-60'
                    : 'bg-slate-800/50'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {stateIcon(update.State)}
                    <span className={`text-sm font-medium ${isCurrent ? 'text-blue-200' : isSkipped ? 'text-slate-400' : 'text-slate-200'}`}>
                      {safeString(update.DisplayName)}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {isCurrent && (
                      <span className="px-2 py-0.5 bg-blue-600/40 text-blue-300 text-[10px] uppercase font-semibold rounded">
                        Current
                      </span>
                    )}
                    {isSkipped && (
                      <span className="px-2 py-0.5 bg-slate-600/40 text-slate-400 text-[10px] uppercase font-semibold rounded">
                        {stateLabel(update.State)}
                      </span>
                    )}
                    {isPending && (
                      <span className="px-2 py-0.5 bg-amber-600/40 text-amber-300 text-[10px] uppercase font-semibold rounded flex items-center gap-1">
                        <ArrowRight className="w-3 h-3" />
                        {stateLabel(update.State)}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-3 mt-1">
                  <p className="text-xs text-slate-500 font-mono">
                    v{safeString(update.Version)}
                  </p>
                  {dateToShow && (
                    <span className="flex items-center gap-1 text-xs text-slate-500">
                      <Calendar className="w-3 h-3" />
                      {dateToShow}
                    </span>
                  )}
                </div>
                {update.Description && (
                  <p className="text-xs text-slate-500 mt-1.5 line-clamp-2">
                    {safeString(update.Description)}
                  </p>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
