import { useState, useEffect } from 'react';
import { LogOut, Wifi, WifiOff, Clock } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useQuery } from '@tanstack/react-query';
import api from '../../services/api';

export default function Header() {
  const { logout } = useAuth();
  const [localTime, setLocalTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setLocalTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const { data: health } = useQuery({
    queryKey: ['health'],
    queryFn: async () => {
      const { data } = await api.get('/health');
      return data;
    },
    refetchInterval: 15000,
  });

  const { data: clusterTime } = useQuery({
    queryKey: ['cluster', 'time'],
    queryFn: async () => {
      const { data } = await api.get('/cluster/time');
      return data;
    },
    refetchInterval: 30000,
  });

  const isConnected = health?.status === 'ok';
  const clusterDate = clusterTime?.cluster_time ? new Date(clusterTime.cluster_time) : null;

  const formatTime = (d: Date) =>
    d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });

  return (
    <header className="h-14 bg-slate-900 border-b border-slate-700 flex items-center justify-between px-6 fixed top-0 left-64 right-0 z-10">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          {isConnected ? (
            <Wifi className="w-4 h-4 text-green-500" />
          ) : (
            <WifiOff className="w-4 h-4 text-red-500" />
          )}
          <span className="text-xs text-slate-400">
            {isConnected ? 'Connected' : 'Disconnected'}
          </span>
        </div>
        <span className="text-slate-700">|</span>
        <div className="flex items-center gap-1.5">
          <Clock className="w-3.5 h-3.5 text-slate-500" />
          <span className="text-xs text-slate-400">
            Local: <span className="text-slate-300">{formatTime(localTime)}</span>
          </span>
        </div>
        <span className="text-slate-700">|</span>
        <div className="flex items-center gap-1.5">
          <Clock className="w-3.5 h-3.5 text-slate-500" />
          <span className="text-xs text-slate-400">
            Cluster:{' '}
            <span className="text-slate-300">
              {clusterDate && !isNaN(clusterDate.getTime()) ? formatTime(clusterDate) : '—'}
            </span>
          </span>
        </div>
      </div>

      <div className="flex items-center gap-4">
        <span className="text-xs text-slate-500">
          presidiorocks.com
        </span>
        <button
          onClick={logout}
          className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-200 transition-colors"
        >
          <LogOut className="w-4 h-4" />
          Logout
        </button>
      </div>
    </header>
  );
}
