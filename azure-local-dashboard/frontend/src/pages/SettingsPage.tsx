import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Settings, CheckCircle, XCircle, Loader2, Wifi } from 'lucide-react';
import api from '../services/api';

export default function SettingsPage() {
  const [testResults, setTestResults] = useState<Record<string, any> | null>(null);
  const [testing, setTesting] = useState(false);

  const { data: connection } = useQuery({
    queryKey: ['settings', 'connection'],
    queryFn: async () => {
      const { data } = await api.get('/settings/connection');
      return data;
    },
  });

  const testConnection = async () => {
    setTesting(true);
    try {
      const { data } = await api.post('/settings/test-connection');
      setTestResults(data);
    } catch (err: any) {
      setTestResults({ error: err.message });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold text-slate-100">Settings</h2>

      {/* Connection Settings */}
      <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Settings className="w-5 h-5 text-blue-400" />
            <h3 className="text-sm font-semibold text-slate-100">Connection Settings</h3>
          </div>
          <button
            onClick={testConnection}
            disabled={testing}
            className="flex items-center gap-2 px-3 py-1.5 text-xs bg-blue-600 hover:bg-blue-700 disabled:bg-slate-700 text-white rounded transition-colors"
          >
            {testing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Wifi className="w-3 h-3" />}
            Test Connection
          </button>
        </div>

        {connection && (
          <div className="grid grid-cols-2 gap-4 text-xs">
            <div>
              <span className="text-slate-400">Cluster</span>
              <p className="text-slate-200">{connection.cluster}</p>
            </div>
            <div>
              <span className="text-slate-400">Domain</span>
              <p className="text-slate-200">{connection.domain}</p>
            </div>
            <div>
              <span className="text-slate-400">Node 1</span>
              <p className="text-slate-200">{connection.nodes?.[0]}</p>
            </div>
            <div>
              <span className="text-slate-400">Node 2</span>
              <p className="text-slate-200">{connection.nodes?.[1]}</p>
            </div>
            <div>
              <span className="text-slate-400">Username</span>
              <p className="text-slate-200">{connection.username}</p>
            </div>
            <div>
              <span className="text-slate-400">Transport</span>
              <p className="text-slate-200">
                {connection.winrm_transport?.toUpperCase()}{' '}
                {connection.winrm_ssl ? '(SSL)' : '(Plain)'}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Test Results */}
      {testResults && (
        <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
          <h3 className="text-sm font-semibold text-slate-100 mb-3">Connection Test Results</h3>
          <div className="space-y-2">
            {Object.entries(testResults).map(([node, result]: [string, any]) => (
              <div key={node} className="flex items-center justify-between p-2 bg-slate-900 rounded text-xs">
                <span className="text-slate-300 font-medium">{node}</span>
                <div className="flex items-center gap-2">
                  {result.reachable ? (
                    <>
                      <CheckCircle className="w-4 h-4 text-green-400" />
                      <span className="text-green-400">
                        Connected ({result.transport})
                      </span>
                    </>
                  ) : (
                    <>
                      <XCircle className="w-4 h-4 text-red-400" />
                      <span className="text-red-400">{result.error || 'Unreachable'}</span>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Info */}
      <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
        <h3 className="text-sm font-semibold text-slate-100 mb-2">Configuration</h3>
        <p className="text-xs text-slate-400">
          Connection settings are configured via environment variables in the .env file.
          Restart the container after making changes.
        </p>
      </div>
    </div>
  );
}
