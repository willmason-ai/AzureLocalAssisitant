import clsx from 'clsx';

interface StatusBadgeProps {
  status: string;
  size?: 'sm' | 'md';
}

const statusColors: Record<string, string> = {
  // Cluster states
  'up': 'bg-green-500/20 text-green-400',
  'online': 'bg-green-500/20 text-green-400',
  'healthy': 'bg-green-500/20 text-green-400',
  'ok': 'bg-green-500/20 text-green-400',
  'running': 'bg-green-500/20 text-green-400',
  'installed': 'bg-green-500/20 text-green-400',
  'succeeded': 'bg-green-500/20 text-green-400',
  'connected': 'bg-green-500/20 text-green-400',

  // Warning states
  'warning': 'bg-amber-500/20 text-amber-400',
  'degraded': 'bg-amber-500/20 text-amber-400',
  'ready': 'bg-amber-500/20 text-amber-400',
  'downloading': 'bg-amber-500/20 text-amber-400',
  'paused': 'bg-amber-500/20 text-amber-400',

  // Error states
  'down': 'bg-red-500/20 text-red-400',
  'offline': 'bg-red-500/20 text-red-400',
  'error': 'bg-red-500/20 text-red-400',
  'failed': 'bg-red-500/20 text-red-400',
  'critical': 'bg-red-500/20 text-red-400',
  'expired': 'bg-red-500/20 text-red-400',

  // Neutral
  'unknown': 'bg-slate-500/20 text-slate-400',
  'pending': 'bg-blue-500/20 text-blue-400',
  'inprogress': 'bg-blue-500/20 text-blue-400',
};

export default function StatusBadge({ status, size = 'sm' }: StatusBadgeProps) {
  const colorClass = statusColors[status.toLowerCase().replace(/\s+/g, '')] || statusColors['unknown'];

  return (
    <span
      className={clsx(
        'inline-flex items-center rounded-full font-medium',
        colorClass,
        size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-3 py-1 text-sm'
      )}
    >
      {status}
    </span>
  );
}
