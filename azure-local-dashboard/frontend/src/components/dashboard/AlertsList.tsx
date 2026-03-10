import { AlertTriangle, CheckCircle } from 'lucide-react';
import type { HealthFault } from '../../types';

interface AlertsListProps {
  faults: HealthFault[];
}

export default function AlertsList({ faults }: AlertsListProps) {
  return (
    <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
      <h3 className="text-sm font-semibold text-slate-100 mb-3">Health Alerts</h3>

      {faults.length === 0 ? (
        <div className="flex items-center gap-2 text-sm text-green-400">
          <CheckCircle className="w-4 h-4" />
          <span>No active health faults</span>
        </div>
      ) : (
        <div className="space-y-2">
          {faults.map((fault, i) => (
            <div
              key={fault.FaultId || i}
              className="flex items-start gap-2 p-2 bg-slate-900 rounded text-xs"
            >
              <AlertTriangle
                className={`w-4 h-4 mt-0.5 flex-shrink-0 ${
                  fault.Severity === 'Critical' ? 'text-red-400' : 'text-amber-400'
                }`}
              />
              <div>
                <p className="text-slate-200 font-medium">{fault.FaultType}</p>
                <p className="text-slate-400">{fault.Description}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
