import { CheckCircle, Clock, Download, ArrowRight } from 'lucide-react';
import { safeString } from '../../utils/safeRender';

interface UpdateEntry {
  DisplayName: string;
  Version: string;
  State: string;
}

interface UpdateTimelineProps {
  updates: UpdateEntry[];
}

function stateIcon(state: string) {
  const s = (state || '').toLowerCase();
  if (s === 'installed') return <CheckCircle className="w-4 h-4 text-green-400" />;
  if (s === 'ready' || s === 'downloading') return <Download className="w-4 h-4 text-amber-400" />;
  return <Clock className="w-4 h-4 text-slate-500" />;
}

function stateDotColor(state: string, isCurrent: boolean) {
  const s = (state || '').toLowerCase();
  if (isCurrent) return 'bg-blue-500 ring-4 ring-blue-500/20';
  if (s === 'installed') return 'bg-green-500';
  if (s === 'ready' || s === 'downloading') return 'bg-amber-500 animate-pulse';
  return 'bg-slate-600';
}

export default function UpdateTimeline({ updates }: UpdateTimelineProps) {
  if (!updates || updates.length === 0) return null;

  // Sort: installed by version ascending, then pending
  const installed = updates
    .filter(u => (u.State || '').toLowerCase() === 'installed')
    .sort((a, b) => (a.Version || '').localeCompare(b.Version || ''));
  const pending = updates.filter(u => (u.State || '').toLowerCase() !== 'installed');
  const sorted = [...installed, ...pending];

  // Current = last installed
  const currentVersion = installed.length > 0 ? installed[installed.length - 1].Version : null;

  return (
    <div className="relative">
      {sorted.map((update, idx) => {
        const isCurrent = update.Version === currentVersion;
        const isPending = (update.State || '').toLowerCase() !== 'installed';
        const isLast = idx === sorted.length - 1;

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
            <div className={`pb-4 flex-1 ${isCurrent ? '' : ''}`}>
              <div
                className={`rounded-lg p-3 ${
                  isCurrent
                    ? 'bg-blue-900/30 border border-blue-500/40'
                    : isPending
                    ? 'bg-amber-900/20 border border-amber-500/30'
                    : 'bg-slate-800/50'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {stateIcon(update.State)}
                    <span className={`text-sm font-medium ${isCurrent ? 'text-blue-200' : 'text-slate-200'}`}>
                      {safeString(update.DisplayName)}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {isCurrent && (
                      <span className="px-2 py-0.5 bg-blue-600/40 text-blue-300 text-[10px] uppercase font-semibold rounded">
                        Current
                      </span>
                    )}
                    {isPending && (
                      <span className="px-2 py-0.5 bg-amber-600/40 text-amber-300 text-[10px] uppercase font-semibold rounded flex items-center gap-1">
                        <ArrowRight className="w-3 h-3" />
                        {safeString(update.State)}
                      </span>
                    )}
                  </div>
                </div>
                <p className="text-xs text-slate-500 font-mono mt-1">
                  v{safeString(update.Version)}
                </p>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
