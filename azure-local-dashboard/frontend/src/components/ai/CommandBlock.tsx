import { useState, useEffect } from 'react';
import { Play, X, Loader2, CheckCircle, Terminal, ShieldAlert, ShieldX, AlertTriangle } from 'lucide-react';
import type { ToolCall } from '../../types';

interface SafetyClassification {
  level: 'safe' | 'destructive' | 'blocked';
  allowed: boolean;
  reason: string;
  requires_confirmation?: boolean;
}

interface CommandBlockProps {
  toolCall: ToolCall;
  onExecute: () => void;
  onReject: () => void;
}

export default function CommandBlock({ toolCall, onExecute, onReject }: CommandBlockProps) {
  const { input, status } = toolCall;
  const [safety, setSafety] = useState<SafetyClassification | null>(null);
  const [confirmed, setConfirmed] = useState(false);

  useEffect(() => {
    if (input.command && status === 'pending') {
      const token = localStorage.getItem('auth_token');
      fetch('/api/ai/safety-check', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ command: input.command }),
      })
        .then(res => res.json())
        .then(data => setSafety(data))
        .catch(() => setSafety({ level: 'safe', allowed: true, reason: '' }));
    }
  }, [input.command, status]);

  const isBlocked = safety?.level === 'blocked';
  const isDestructive = safety?.level === 'destructive';

  const borderColor = isBlocked
    ? 'border-red-600'
    : isDestructive
    ? 'border-amber-600'
    : 'border-slate-700';

  const headerBg = isBlocked
    ? 'bg-red-950/50'
    : isDestructive
    ? 'bg-amber-950/30'
    : 'bg-slate-800/50';

  return (
    <div className={`mt-2 bg-slate-900 border ${borderColor} rounded-lg overflow-hidden`}>
      <div className={`flex items-center justify-between px-3 py-2 ${headerBg} border-b ${borderColor}`}>
        <div className="flex items-center gap-2">
          {isBlocked ? (
            <ShieldX className="w-4 h-4 text-red-400" />
          ) : isDestructive ? (
            <ShieldAlert className="w-4 h-4 text-amber-400" />
          ) : (
            <Terminal className="w-4 h-4 text-blue-400" />
          )}
          <span className="text-xs font-medium text-slate-300">
            {isBlocked ? 'BLOCKED Command' : isDestructive ? 'Destructive Command' : 'PowerShell Command'}
          </span>
          {input.target_node && (
            <span className="text-xs text-slate-500">
              on {input.target_node}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          {status === 'pending' && !isBlocked && (
            <>
              {isDestructive && !confirmed ? (
                <button
                  onClick={() => setConfirmed(true)}
                  className="flex items-center gap-1 px-2 py-1 text-xs bg-amber-600 hover:bg-amber-700 text-white rounded transition-colors"
                >
                  <AlertTriangle className="w-3 h-3" />
                  I understand the risks
                </button>
              ) : (
                <button
                  onClick={onExecute}
                  className="flex items-center gap-1 px-2 py-1 text-xs bg-green-600 hover:bg-green-700 text-white rounded transition-colors"
                >
                  <Play className="w-3 h-3" />
                  Execute
                </button>
              )}
              <button
                onClick={onReject}
                className="flex items-center gap-1 px-2 py-1 text-xs bg-slate-700 hover:bg-slate-600 text-slate-300 rounded transition-colors"
              >
                <X className="w-3 h-3" />
                Reject
              </button>
            </>
          )}
          {status === 'pending' && isBlocked && (
            <span className="flex items-center gap-1 text-xs text-red-400 font-medium">
              <ShieldX className="w-3 h-3" />
              Blocked by safety policy
            </span>
          )}
          {status === 'executing' && (
            <span className="flex items-center gap-1 text-xs text-amber-400">
              <Loader2 className="w-3 h-3 animate-spin" />
              Executing...
            </span>
          )}
          {status === 'completed' && (
            <span className="flex items-center gap-1 text-xs text-green-400">
              <CheckCircle className="w-3 h-3" />
              Completed
            </span>
          )}
          {status === 'rejected' && (
            <span className="flex items-center gap-1 text-xs text-slate-500">
              <X className="w-3 h-3" />
              Rejected
            </span>
          )}
        </div>
      </div>

      {/* Safety warning banner */}
      {safety && (isBlocked || isDestructive) && (
        <div className={`px-3 py-2 text-xs ${isBlocked ? 'bg-red-950/30 text-red-300' : 'bg-amber-950/20 text-amber-300'} border-b ${borderColor}`}>
          {isBlocked ? (
            <span className="font-medium">SAFETY POLICY: </span>
          ) : (
            <span className="font-medium">WARNING: </span>
          )}
          {safety.reason}
        </div>
      )}

      <div className="p-3">
        <p className="text-xs text-slate-400 mb-2">{input.explanation}</p>
        <pre className={`text-xs ${isBlocked ? 'text-red-400 line-through opacity-60' : 'text-green-400'} bg-black/30 p-2 rounded overflow-x-auto`}>
          <code>{input.command}</code>
        </pre>
      </div>
    </div>
  );
}
