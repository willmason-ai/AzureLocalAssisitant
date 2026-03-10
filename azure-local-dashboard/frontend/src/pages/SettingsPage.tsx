import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Settings, CheckCircle, XCircle, Loader2, Wifi,
  HardDrive, Clock, Shield, AlertTriangle, ArrowUpCircle
} from 'lucide-react';
import api from '../services/api';

interface ClusterVolume {
  Name: string;
  State: string;
  VolumeFriendlyName: string;
  TotalSize: number;
  FreeSpace: number;
  UsedSpace: number;
  PercentFree: number;
  FileSystem: string;
  OwnerNode: string;
}

interface SystemOverview {
  cluster_volumes: ClusterVolume[];
  current_version: { DisplayName: string; Version: string; State: string } | null;
  pending_updates: Array<{ DisplayName: string; Version: string; State: string }>;
  is_up_to_date: boolean;
  cluster_time: string | null;
  errors: { volumes: string | null; version: string | null };
}

function formatBytes(bytes: number): string {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

function getUsageColor(percentUsed: number): string {
  if (percentUsed >= 90) return 'bg-red-500';
  if (percentUsed >= 75) return 'bg-amber-500';
  return 'bg-blue-500';
}

function getUsageTextColor(percentUsed: number): string {
  if (percentUsed >= 90) return 'text-red-400';
  if (percentUsed >= 75) return 'text-amber-400';
  return 'text-green-400';
}

export default function SettingsPage() {
  const [testResults, setTestResults] = useState<Record<string, any> | null>(null);
  const [testing, setTesting] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());

  // Live clock
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const { data: connection } = useQuery({
    queryKey: ['settings', 'connection'],
    queryFn: async () => {
      const { data } = await api.get('/settings/connection');
      return data;
    },
  });

  const { data: overview, isLoading: overviewLoading } = useQuery<SystemOverview>({
    queryKey: ['settings', 'system-overview'],
    queryFn: async () => {
      const { data } = await api.get('/settings/system-overview');
      return data;
    },
    refetchInterval: 60000,
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

  const volumes = overview?.cluster_volumes || [];
  const normalizedVolumes = Array.isArray(volumes) ? volumes : [volumes];

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

      {/* System Overview: Time, Version, Storage */}
      <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
        <div className="flex items-center gap-2 mb-4">
          <Shield className="w-5 h-5 text-blue-400" />
          <h3 className="text-sm font-semibold text-slate-100">System Overview</h3>
        </div>

        {/* Date/Time Row */}
        <div className="grid grid-cols-2 gap-4 mb-5">
          <div className="bg-slate-900 rounded-lg p-3">
            <div className="flex items-center gap-2 mb-1">
              <Clock className="w-4 h-4 text-slate-400" />
              <span className="text-xs text-slate-400">Dashboard Time</span>
            </div>
            <p className="text-sm font-mono text-slate-100">
              {currentTime.toLocaleDateString('en-US', {
                weekday: 'short', year: 'numeric', month: 'short', day: 'numeric'
              })}
            </p>
            <p className="text-lg font-mono text-blue-400">
              {currentTime.toLocaleTimeString('en-US', { hour12: true })}
            </p>
          </div>
          <div className="bg-slate-900 rounded-lg p-3">
            <div className="flex items-center gap-2 mb-1">
              <Clock className="w-4 h-4 text-slate-400" />
              <span className="text-xs text-slate-400">Cluster Time</span>
            </div>
            {overview?.cluster_time ? (
              <>
                <p className="text-sm font-mono text-slate-100">
                  {new Date(overview.cluster_time).toLocaleDateString('en-US', {
                    weekday: 'short', year: 'numeric', month: 'short', day: 'numeric'
                  })}
                </p>
                <p className="text-lg font-mono text-blue-400">
                  {new Date(overview.cluster_time).toLocaleTimeString('en-US', { hour12: true })}
                </p>
              </>
            ) : overviewLoading ? (
              <Loader2 className="w-4 h-4 animate-spin text-slate-500 mt-2" />
            ) : (
              <p className="text-sm text-slate-500 mt-2">Unavailable</p>
            )}
          </div>
        </div>

        {/* Azure Local Version */}
        <div className="mb-5">
          <h4 className="text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
            Azure Local Version
          </h4>
          <div className="bg-slate-900 rounded-lg p-3">
            {overviewLoading ? (
              <div className="flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin text-slate-500" />
                <span className="text-xs text-slate-500">Loading version info...</span>
              </div>
            ) : overview?.current_version ? (
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-100">
                    {overview.current_version.DisplayName}
                  </p>
                  <p className="text-xs text-slate-400 font-mono mt-0.5">
                    v{overview.current_version.Version}
                  </p>
                </div>
                <div>
                  {overview.is_up_to_date ? (
                    <span className="flex items-center gap-1.5 px-2.5 py-1 bg-green-900/40 border border-green-700/50 text-green-400 text-xs font-medium rounded-full">
                      <CheckCircle className="w-3.5 h-3.5" />
                      Up to Date
                    </span>
                  ) : (
                    <span className="flex items-center gap-1.5 px-2.5 py-1 bg-amber-900/40 border border-amber-700/50 text-amber-400 text-xs font-medium rounded-full">
                      <ArrowUpCircle className="w-3.5 h-3.5" />
                      Update Available
                    </span>
                  )}
                </div>
              </div>
            ) : (
              <p className="text-xs text-slate-500">Version information unavailable</p>
            )}

            {/* Pending updates */}
            {overview?.pending_updates && overview.pending_updates.length > 0 && (
              <div className="mt-3 pt-3 border-t border-slate-700 space-y-2">
                {overview.pending_updates.map((update, idx) => (
                  <div key={idx} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                      <span className="text-slate-300">{update.DisplayName}</span>
                    </div>
                    <span className="text-slate-500 font-mono">v{update.Version}</span>
                    <span className="px-1.5 py-0.5 bg-amber-900/30 text-amber-400 rounded text-[10px] uppercase">
                      {update.State}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Cluster Storage Volumes */}
        <div>
          <h4 className="text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
            Cluster Shared Volumes ({normalizedVolumes.length})
          </h4>

          {overviewLoading ? (
            <div className="flex items-center gap-2 p-3">
              <Loader2 className="w-4 h-4 animate-spin text-slate-500" />
              <span className="text-xs text-slate-500">Loading storage info...</span>
            </div>
          ) : overview?.errors?.volumes ? (
            <div className="bg-slate-900 rounded-lg p-3 text-xs text-red-400">
              Failed to load storage: {overview.errors.volumes}
            </div>
          ) : normalizedVolumes.length === 0 ? (
            <div className="bg-slate-900 rounded-lg p-3 text-xs text-slate-500">
              No cluster shared volumes found
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              {normalizedVolumes.map((vol, idx) => {
                const percentUsed = vol.TotalSize > 0
                  ? ((vol.TotalSize - vol.FreeSpace) / vol.TotalSize) * 100
                  : 0;
                const percentFree = vol.PercentFree ?? (100 - percentUsed);

                return (
                  <div key={idx} className="bg-slate-900 rounded-lg p-3">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <HardDrive className="w-4 h-4 text-blue-400" />
                        <span className="text-xs font-medium text-slate-200 truncate max-w-[200px]" title={vol.Name}>
                          {vol.VolumeFriendlyName || vol.Name}
                        </span>
                      </div>
                      <span className={`text-xs font-medium ${vol.State === 'Online' ? 'text-green-400' : 'text-red-400'}`}>
                        {vol.State}
                      </span>
                    </div>

                    {/* Usage bar */}
                    <div className="w-full bg-slate-700 rounded-full h-2 mb-2">
                      <div
                        className={`h-2 rounded-full transition-all ${getUsageColor(percentUsed)}`}
                        style={{ width: `${Math.min(percentUsed, 100)}%` }}
                      />
                    </div>

                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-slate-400">
                        {formatBytes(vol.UsedSpace || (vol.TotalSize - vol.FreeSpace))} used of {formatBytes(vol.TotalSize)}
                      </span>
                      <span className={getUsageTextColor(percentUsed)}>
                        {percentFree.toFixed(1)}% free
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-[10px] text-slate-500 mt-1">
                      <span>Owner: {vol.OwnerNode || 'N/A'}</span>
                      <span>{vol.FileSystem || 'ReFS'}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

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
