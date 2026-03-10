import { NavLink } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  LayoutDashboard,
  Download,
  ShieldCheck,
  Container,
  Puzzle,
  Bot,
  Settings,
  Server,
} from 'lucide-react';
import clsx from 'clsx';
import api from '../../services/api';

const navItems = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/updates', icon: Download, label: 'Updates' },
  { to: '/credentials', icon: ShieldCheck, label: 'Credentials' },
  { to: '/kubernetes', icon: Container, label: 'Kubernetes' },
  { to: '/extensions', icon: Puzzle, label: 'Extensions' },
  { to: '/ai', icon: Bot, label: 'AI Assistant' },
];

export default function Sidebar() {
  const { data: config } = useQuery({
    queryKey: ['config'],
    queryFn: async () => {
      const { data } = await api.get('/config');
      return data;
    },
    staleTime: 300000,
  });

  return (
    <aside className="w-64 bg-slate-900 border-r border-slate-700 flex flex-col h-screen fixed left-0 top-0">
      <div className="p-4 border-b border-slate-700">
        <div className="flex items-center gap-2">
          <Server className="w-6 h-6 text-blue-500" />
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-bold text-slate-100">Azure Local Ops</h1>
              <span className="text-[10px] text-slate-500 font-mono">v{__APP_VERSION__}</span>
            </div>
            <p className="text-xs text-slate-400">{config?.cluster_name || 'Loading...'}</p>
          </div>
        </div>
      </div>

      <nav className="flex-1 py-4">
        {navItems.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              clsx(
                'flex items-center gap-3 px-4 py-2.5 text-sm transition-colors',
                isActive
                  ? 'bg-blue-500/10 text-blue-400 border-r-2 border-blue-400'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              )
            }
          >
            <Icon className="w-5 h-5" />
            {label}
          </NavLink>
        ))}
      </nav>

      <div className="border-t border-slate-700">
        <NavLink
          to="/settings"
          className={({ isActive }) =>
            clsx(
              'flex items-center gap-3 px-4 py-3 text-sm transition-colors',
              isActive
                ? 'bg-blue-500/10 text-blue-400'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
            )
          }
        >
          <Settings className="w-5 h-5" />
          Settings
        </NavLink>
      </div>
    </aside>
  );
}
