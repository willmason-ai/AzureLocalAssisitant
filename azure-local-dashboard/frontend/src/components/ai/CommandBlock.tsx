import { Play, X, Loader2, CheckCircle, Terminal } from 'lucide-react';
import type { ToolCall } from '../../types';

interface CommandBlockProps {
  toolCall: ToolCall;
  onExecute: () => void;
  onReject: () => void;
}

export default function CommandBlock({ toolCall, onExecute, onReject }: CommandBlockProps) {
  const { input, status } = toolCall;

  return (
    <div className="mt-2 bg-slate-900 border border-slate-700 rounded-lg overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 bg-slate-800/50 border-b border-slate-700">
        <div className="flex items-center gap-2">
          <Terminal className="w-4 h-4 text-blue-400" />
          <span className="text-xs font-medium text-slate-300">
            PowerShell Command
          </span>
          {input.target_node && (
            <span className="text-xs text-slate-500">
              on {input.target_node}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          {status === 'pending' && (
            <>
              <button
                onClick={onExecute}
                className="flex items-center gap-1 px-2 py-1 text-xs bg-green-600 hover:bg-green-700 text-white rounded transition-colors"
              >
                <Play className="w-3 h-3" />
                Execute
              </button>
              <button
                onClick={onReject}
                className="flex items-center gap-1 px-2 py-1 text-xs bg-slate-700 hover:bg-slate-600 text-slate-300 rounded transition-colors"
              >
                <X className="w-3 h-3" />
                Reject
              </button>
            </>
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

      <div className="p-3">
        <p className="text-xs text-slate-400 mb-2">{input.explanation}</p>
        <pre className="text-xs text-green-400 bg-black/30 p-2 rounded overflow-x-auto">
          <code>{input.command}</code>
        </pre>
      </div>
    </div>
  );
}
