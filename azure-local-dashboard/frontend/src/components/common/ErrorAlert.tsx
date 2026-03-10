import { AlertTriangle, RefreshCw } from 'lucide-react';

interface ErrorAlertProps {
  message?: string;
  onRetry?: () => void;
}

export default function ErrorAlert({ message, onRetry }: ErrorAlertProps) {
  return (
    <div className="mt-10 max-w-lg mx-auto bg-slate-800 border border-red-500/30 rounded-lg p-5 text-center">
      <AlertTriangle className="w-8 h-8 text-red-400 mx-auto mb-2" />
      <h3 className="text-sm font-semibold text-slate-100 mb-1">Failed to Load Data</h3>
      <p className="text-xs text-slate-400 mb-3">
        {message || 'Could not fetch data from the cluster. It may be unreachable.'}
      </p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="flex items-center gap-1.5 mx-auto px-3 py-1.5 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors"
        >
          <RefreshCw className="w-3 h-3" />
          Retry
        </button>
      )}
    </div>
  );
}
