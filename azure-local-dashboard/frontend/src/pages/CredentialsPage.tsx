import { useState } from 'react';
import { ShieldCheck, Key, Clock, AlertTriangle, RefreshCw } from 'lucide-react';
import { useCredentialStatus, useRepairMoc, useRotateKVA } from '../hooks/useCredentials';
import StatusBadge from '../components/common/StatusBadge';
import LoadingSpinner from '../components/common/LoadingSpinner';
import ConfirmModal from '../components/common/ConfirmModal';

export default function CredentialsPage() {
  const { data: creds, isLoading } = useCredentialStatus();
  const repairMoc = useRepairMoc();
  const rotateKVA = useRotateKVA();
  const [confirmAction, setConfirmAction] = useState<string | null>(null);

  if (isLoading) return <LoadingSpinner size="lg" className="mt-20" />;

  const kvaToken = creds?.kva_token;
  const hciReg = creds?.hci_registration;
  const mocNodes = creds?.moc_nodes;

  // Calculate KVA token age
  let tokenAgeDays: number | null = null;
  if (kvaToken?.LastWriteTime) {
    const lastWrite = new Date(kvaToken.LastWriteTime);
    const now = new Date();
    tokenAgeDays = Math.floor((now.getTime() - lastWrite.getTime()) / (1000 * 60 * 60 * 24));
  }

  const tokenAgeColor = tokenAgeDays === null
    ? 'text-slate-500'
    : tokenAgeDays > 300
    ? 'text-red-400'
    : tokenAgeDays > 270
    ? 'text-amber-400'
    : 'text-green-400';

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold text-slate-100">Credential & Token Health</h2>

      {/* Auth Chain Diagram */}
      <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
        <h3 className="text-sm font-semibold text-slate-100 mb-3">Authentication Chain</h3>
        <div className="flex items-center gap-2 text-xs overflow-x-auto pb-2">
          <div className="bg-blue-500/20 border border-blue-500/30 rounded px-3 py-2 text-blue-300 whitespace-nowrap">
            Entra ID (SPN)
          </div>
          <span className="text-slate-600">&#8594;</span>
          <div className="bg-purple-500/20 border border-purple-500/30 rounded px-3 py-2 text-purple-300 whitespace-nowrap">
            ARB / KVA Token
          </div>
          <span className="text-slate-600">&#8594;</span>
          <div className="bg-emerald-500/20 border border-emerald-500/30 rounded px-3 py-2 text-emerald-300 whitespace-nowrap">
            MOC Cloud Agent
          </div>
          <span className="text-slate-600">&#8594;</span>
          <div className="bg-amber-500/20 border border-amber-500/30 rounded px-3 py-2 text-amber-300 whitespace-nowrap">
            Cluster Nodes
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* KVA Token */}
        <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Key className="w-5 h-5 text-purple-400" />
              <h3 className="text-sm font-semibold text-slate-100">KVA MOC Token</h3>
            </div>
            <button
              onClick={() => setConfirmAction('rotate-kva')}
              className="flex items-center gap-1 px-2 py-1 text-xs bg-slate-700 hover:bg-slate-600 text-slate-300 rounded transition-colors"
            >
              <RefreshCw className="w-3 h-3" />
              Rotate
            </button>
          </div>
          {kvaToken?.error ? (
            <p className="text-xs text-red-400">{kvaToken.error}</p>
          ) : (
            <div className="space-y-2">
              <div className="flex justify-between text-xs">
                <span className="text-slate-400">Last Updated</span>
                <span className="text-slate-300">{kvaToken?.LastWriteTime || 'N/A'}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-slate-400">Token Age</span>
                <span className={tokenAgeColor}>
                  {tokenAgeDays !== null ? `${tokenAgeDays} days` : 'Unknown'}
                  {tokenAgeDays !== null && tokenAgeDays > 300 && ' (EXPIRING SOON!)'}
                </span>
              </div>
              {tokenAgeDays !== null && (
                <div className="w-full bg-slate-900 rounded-full h-2 mt-2">
                  <div
                    className={`h-2 rounded-full ${
                      tokenAgeDays > 300 ? 'bg-red-500' : tokenAgeDays > 270 ? 'bg-amber-500' : 'bg-green-500'
                    }`}
                    style={{ width: `${Math.min((tokenAgeDays / 365) * 100, 100)}%` }}
                  />
                </div>
              )}
            </div>
          )}
        </div>

        {/* HCI Registration */}
        <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-3">
            <ShieldCheck className="w-5 h-5 text-blue-400" />
            <h3 className="text-sm font-semibold text-slate-100">Azure Stack HCI Registration</h3>
          </div>
          {hciReg?.error ? (
            <p className="text-xs text-red-400">{String(hciReg.error)}</p>
          ) : (
            <div className="space-y-2 text-xs">
              {hciReg && typeof hciReg === 'object' && Object.entries(hciReg).slice(0, 6).map(([key, val]) => (
                <div key={key} className="flex justify-between">
                  <span className="text-slate-400">{key}</span>
                  <span className="text-slate-300 text-right max-w-[60%] truncate">
                    {String(val)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* MOC Nodes */}
        <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Clock className="w-5 h-5 text-emerald-400" />
              <h3 className="text-sm font-semibold text-slate-100">MOC Node Health</h3>
            </div>
            <button
              onClick={() => setConfirmAction('repair-moc')}
              className="flex items-center gap-1 px-2 py-1 text-xs bg-slate-700 hover:bg-slate-600 text-slate-300 rounded transition-colors"
            >
              <RefreshCw className="w-3 h-3" />
              Repair Login
            </button>
          </div>
          {Array.isArray(mocNodes) ? (
            <div className="space-y-2">
              {mocNodes.map((node: any, i: number) => (
                <div key={i} className="flex items-center justify-between text-xs">
                  <span className="text-slate-300">{node.name || node.fqdn}</span>
                  <div className="flex items-center gap-2">
                    <StatusBadge status={node.health || 'Unknown'} />
                    <StatusBadge status={node.state || 'Unknown'} />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-slate-500">
              {(mocNodes as any)?.error || 'No MOC node data available'}
            </p>
          )}
        </div>

        {/* Entra SPN Info */}
        <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="w-5 h-5 text-amber-400" />
            <h3 className="text-sm font-semibold text-slate-100">Entra ID SPN</h3>
          </div>
          <div className="space-y-2 text-xs">
            <div className="flex justify-between">
              <span className="text-slate-400">App ID</span>
              <span className="text-slate-300 font-mono">12c20bcd-43fe-4c8b-b582-c6a71cc026e8</span>
            </div>
            <p className="text-slate-500 mt-2">
              Monitor SPN secret expiration in Azure Entra ID portal.
              Cannot be checked via remote PowerShell (requires az login).
            </p>
          </div>
        </div>
      </div>

      {confirmAction === 'repair-moc' && (
        <ConfirmModal
          title="Repair MOC Login"
          message="This will run Repair-MocLogin on the cluster. This operation repairs the MOC authentication and may take a few minutes."
          confirmLabel="Repair"
          variant="warning"
          onConfirm={() => {
            repairMoc.mutate();
            setConfirmAction(null);
          }}
          onCancel={() => setConfirmAction(null)}
        />
      )}

      {confirmAction === 'rotate-kva' && (
        <ConfirmModal
          title="Rotate KVA Token"
          message="This will run Update-MocIdentity to generate a new KVA token with 365-day validity and enable auto-rotation. This is a safe operation but may take a few minutes."
          confirmLabel="Rotate Token"
          variant="warning"
          onConfirm={() => {
            rotateKVA.mutate(365);
            setConfirmAction(null);
          }}
          onCancel={() => setConfirmAction(null)}
        />
      )}
    </div>
  );
}
