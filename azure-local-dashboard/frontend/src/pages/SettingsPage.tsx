import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Settings, CheckCircle, XCircle, Loader2, Wifi,
  HardDrive, Clock, Shield, AlertTriangle, ArrowUpCircle,
  Key, Plus, Trash2, TestTube, Bot, Save, Eye, EyeOff
} from 'lucide-react';
import api from '../services/api';
import { safeString } from '../utils/safeRender';

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
  const queryClient = useQueryClient();
  const [testResults, setTestResults] = useState<Record<string, any> | null>(null);
  const [testing, setTesting] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [showAddCred, setShowAddCred] = useState(false);
  const [newCredName, setNewCredName] = useState('');
  const [newCredFields, setNewCredFields] = useState({ username: '', password: '', domain: '', target_node: '' });
  const [credTestResults, setCredTestResults] = useState<Record<string, any>>({});
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);
  const [aiConfigStatus, setAiConfigStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const { data: aiConfig, refetch: refetchAiConfig } = useQuery({
    queryKey: ['settings', 'ai-config'],
    queryFn: async () => {
      const { data } = await api.get('/settings/ai-config');
      return data;
    },
  });

  const saveAiKey = useMutation({
    mutationFn: async (apiKey: string) => {
      const { data } = await api.put('/settings/ai-config', { api_key: apiKey });
      return data;
    },
    onSuccess: () => {
      setAiConfigStatus({ type: 'success', message: 'API key saved successfully' });
      setApiKeyInput('');
      refetchAiConfig();
      setTimeout(() => setAiConfigStatus(null), 3000);
    },
    onError: (err: any) => {
      const msg = err.response?.data?.error || err.message || 'Failed to save API key';
      setAiConfigStatus({ type: 'error', message: msg });
      setTimeout(() => setAiConfigStatus(null), 5000);
    },
  });

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

  const { data: credSets } = useQuery({
    queryKey: ['credential-sets'],
    queryFn: async () => {
      const { data } = await api.get('/credential-sets');
      return data;
    },
  });

  const saveCred = useMutation({
    mutationFn: async ({ section, values }: { section: string; values: Record<string, string> }) => {
      const { data } = await api.put(`/credential-sets/${section}`, values);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['credential-sets'] });
      setShowAddCred(false);
      setNewCredName('');
      setNewCredFields({ username: '', password: '', domain: '', target_node: '' });
    },
  });

  const deleteCred = useMutation({
    mutationFn: async (section: string) => {
      const { data } = await api.delete(`/credential-sets/${section}`);
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['credential-sets'] }),
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

  const testCredSet = async (section: string) => {
    try {
      setCredTestResults(prev => ({ ...prev, [section]: { testing: true } }));
      const { data } = await api.post(`/credential-sets/${section}/test`);
      setCredTestResults(prev => ({ ...prev, [section]: data }));
    } catch (err: any) {
      setCredTestResults(prev => ({ ...prev, [section]: { error: err.message } }));
    }
  };

  const volumes = overview?.cluster_volumes || [];
  const normalizedVolumes = Array.isArray(volumes) ? volumes : [volumes];
  const credentialSets = credSets?.credential_sets || {};

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

      {/* AI Configuration */}
      <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
        <div className="flex items-center gap-2 mb-4">
          <Bot className="w-5 h-5 text-blue-400" />
          <h3 className="text-sm font-semibold text-slate-100">AI Configuration</h3>
        </div>

        {/* Current status */}
        <div className="mb-4 p-3 bg-slate-900 rounded-lg">
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-400">Anthropic API Key</span>
            {aiConfig?.has_key ? (
              <div className="flex items-center gap-2">
                <span className="font-mono text-slate-300">{aiConfig.masked_key}</span>
                <span className="px-1.5 py-0.5 bg-green-900/30 text-green-400 rounded text-[10px] uppercase">
                  {aiConfig.source === 'environment' ? 'env var' : 'configured'}
                </span>
              </div>
            ) : (
              <span className="px-1.5 py-0.5 bg-red-900/30 text-red-400 rounded text-[10px] uppercase">
                not set
              </span>
            )}
          </div>
        </div>

        {/* Input field */}
        <div className="space-y-3">
          <div className="relative">
            <input
              type={showApiKey ? 'text' : 'password'}
              placeholder="sk-ant-..."
              value={apiKeyInput}
              onChange={e => setApiKeyInput(e.target.value)}
              className="w-full px-3 py-2 text-xs bg-slate-900 border border-slate-600 rounded text-slate-200 placeholder:text-slate-500 pr-10 font-mono"
            />
            <button
              type="button"
              onClick={() => setShowApiKey(!showApiKey)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
            >
              {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>

          <div className="flex items-center justify-between">
            <p className="text-[10px] text-slate-500">
              {aiConfig?.source === 'environment'
                ? 'A key is set via environment variable. Saving here will override it.'
                : 'Enter your Anthropic API key to enable the AI assistant.'}
            </p>
            <button
              onClick={() => {
                if (apiKeyInput.trim()) saveAiKey.mutate(apiKeyInput.trim());
              }}
              disabled={!apiKeyInput.trim() || saveAiKey.isPending}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-blue-600 hover:bg-blue-700 disabled:bg-slate-700 disabled:text-slate-500 text-white rounded transition-colors"
            >
              {saveAiKey.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
              Save
            </button>
          </div>

          {/* Status feedback */}
          {aiConfigStatus && (
            <div className={`flex items-center gap-2 text-xs p-2 rounded ${
              aiConfigStatus.type === 'success'
                ? 'bg-green-900/20 text-green-400'
                : 'bg-red-900/20 text-red-400'
            }`}>
              {aiConfigStatus.type === 'success'
                ? <CheckCircle className="w-3.5 h-3.5" />
                : <XCircle className="w-3.5 h-3.5" />}
              {aiConfigStatus.message}
            </div>
          )}
        </div>
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

      {/* Stored Credentials */}
      <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Key className="w-5 h-5 text-purple-400" />
            <h3 className="text-sm font-semibold text-slate-100">Stored Credentials</h3>
          </div>
          <button
            onClick={() => setShowAddCred(!showAddCred)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs bg-purple-600 hover:bg-purple-700 text-white rounded transition-colors"
          >
            <Plus className="w-3 h-3" />
            Add
          </button>
        </div>

        {/* Add credential form */}
        {showAddCred && (
          <div className="bg-slate-900 rounded-lg p-3 mb-4 space-y-3">
            <input
              type="text"
              placeholder="Credential set name (e.g. 'backup-admin')"
              value={newCredName}
              onChange={e => setNewCredName(e.target.value)}
              className="w-full px-3 py-1.5 text-xs bg-slate-800 border border-slate-600 rounded text-slate-200 placeholder:text-slate-500"
            />
            <div className="grid grid-cols-2 gap-2">
              <input
                type="text"
                placeholder="Username"
                value={newCredFields.username}
                onChange={e => setNewCredFields(p => ({ ...p, username: e.target.value }))}
                className="px-3 py-1.5 text-xs bg-slate-800 border border-slate-600 rounded text-slate-200 placeholder:text-slate-500"
              />
              <input
                type="password"
                placeholder="Password"
                value={newCredFields.password}
                onChange={e => setNewCredFields(p => ({ ...p, password: e.target.value }))}
                className="px-3 py-1.5 text-xs bg-slate-800 border border-slate-600 rounded text-slate-200 placeholder:text-slate-500"
              />
              <input
                type="text"
                placeholder="Domain (optional)"
                value={newCredFields.domain}
                onChange={e => setNewCredFields(p => ({ ...p, domain: e.target.value }))}
                className="px-3 py-1.5 text-xs bg-slate-800 border border-slate-600 rounded text-slate-200 placeholder:text-slate-500"
              />
              <input
                type="text"
                placeholder="Target node (optional)"
                value={newCredFields.target_node}
                onChange={e => setNewCredFields(p => ({ ...p, target_node: e.target.value }))}
                className="px-3 py-1.5 text-xs bg-slate-800 border border-slate-600 rounded text-slate-200 placeholder:text-slate-500"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowAddCred(false)}
                className="px-3 py-1 text-xs text-slate-400 hover:text-slate-200 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  if (newCredName.trim()) {
                    const values: Record<string, string> = {};
                    Object.entries(newCredFields).forEach(([k, v]) => {
                      if (v.trim()) values[k] = v.trim();
                    });
                    saveCred.mutate({ section: newCredName.trim(), values });
                  }
                }}
                disabled={!newCredName.trim()}
                className="px-3 py-1 text-xs bg-purple-600 hover:bg-purple-700 disabled:bg-slate-700 text-white rounded transition-colors"
              >
                Save
              </button>
            </div>
          </div>
        )}

        {/* Existing credential sets */}
        {Object.keys(credentialSets).length === 0 ? (
          <p className="text-xs text-slate-500">
            No stored credentials. Default connection uses environment variables.
          </p>
        ) : (
          <div className="space-y-2">
            {Object.entries(credentialSets).map(([section, cred]: [string, any]) => {
              const testResult = credTestResults[section];
              return (
                <div key={section} className="bg-slate-900 rounded-lg p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-medium text-slate-200">{section}</span>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => testCredSet(section)}
                        className="flex items-center gap-1 px-2 py-0.5 text-[10px] bg-slate-700 hover:bg-slate-600 text-slate-300 rounded transition-colors"
                      >
                        <TestTube className="w-3 h-3" />
                        Test
                      </button>
                      <button
                        onClick={() => {
                          if (confirm(`Delete credential set "${section}"?`)) {
                            deleteCred.mutate(section);
                          }
                        }}
                        className="flex items-center gap-1 px-2 py-0.5 text-[10px] bg-red-900/30 hover:bg-red-900/50 text-red-400 rounded transition-colors"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[11px]">
                    {Object.entries(cred).map(([k, v]: [string, any]) => (
                      <div key={k} className="flex justify-between">
                        <span className="text-slate-500">{k}</span>
                        <span className="text-slate-400 font-mono">{String(v)}</span>
                      </div>
                    ))}
                  </div>
                  {testResult && (
                    <div className="mt-2 pt-2 border-t border-slate-700 text-[11px]">
                      {testResult.testing ? (
                        <span className="text-slate-500">Testing...</span>
                      ) : testResult.reachable ? (
                        <span className="text-green-400 flex items-center gap-1">
                          <CheckCircle className="w-3 h-3" />
                          Connected to {testResult.hostname} via {testResult.transport}
                        </span>
                      ) : (
                        <span className="text-red-400 flex items-center gap-1">
                          <XCircle className="w-3 h-3" />
                          {testResult.error || 'Connection failed'}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

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
                    {safeString(overview.current_version.DisplayName)}
                  </p>
                  <p className="text-xs text-slate-400 font-mono mt-0.5">
                    v{safeString(overview.current_version.Version)}
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

            {overview?.pending_updates && overview.pending_updates.length > 0 && (
              <div className="mt-3 pt-3 border-t border-slate-700 space-y-2">
                {overview.pending_updates.map((update, idx) => (
                  <div key={idx} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                      <span className="text-slate-300">{safeString(update.DisplayName)}</span>
                    </div>
                    <span className="text-slate-500 font-mono">v{safeString(update.Version)}</span>
                    <span className="px-1.5 py-0.5 bg-amber-900/30 text-amber-400 rounded text-[10px] uppercase">
                      {safeString(update.State)}
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
              Failed to load storage: {safeString(overview.errors.volumes)}
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
                      <span className={`text-xs font-medium ${String(vol.State) === 'Online' ? 'text-green-400' : 'text-red-400'}`}>
                        {safeString(vol.State)}
                      </span>
                    </div>

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
          Restart the container after making changes. Stored credentials above are AES-256-GCM
          encrypted and persisted to the data volume.
        </p>
      </div>
    </div>
  );
}
