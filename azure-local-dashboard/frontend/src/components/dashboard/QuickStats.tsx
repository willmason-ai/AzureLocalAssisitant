import { Cpu, MemoryStick, HardDrive, Monitor } from 'lucide-react';
import MetricCard from '../common/MetricCard';

interface QuickStatsProps {
  totalCores: number;
  totalRamGB: number;
  vmCount: number;
  storageUsedPercent?: number;
}

export default function QuickStats({ totalCores, totalRamGB, vmCount, storageUsedPercent }: QuickStatsProps) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      <MetricCard
        title="Total Cores"
        value={totalCores}
        subtitle="across all nodes"
        icon={<Cpu className="w-5 h-5" />}
      />
      <MetricCard
        title="Total RAM"
        value={`${totalRamGB} GB`}
        subtitle="across all nodes"
        icon={<MemoryStick className="w-5 h-5" />}
      />
      <MetricCard
        title="Virtual Machines"
        value={vmCount}
        subtitle="running"
        icon={<Monitor className="w-5 h-5" />}
      />
      <MetricCard
        title="Storage"
        value={storageUsedPercent !== undefined ? `${storageUsedPercent}%` : 'N/A'}
        subtitle="capacity used"
        icon={<HardDrive className="w-5 h-5" />}
      />
    </div>
  );
}
