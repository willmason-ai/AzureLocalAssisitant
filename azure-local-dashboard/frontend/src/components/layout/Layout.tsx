import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import Header from './Header';
import { useSocket } from '../../hooks/useSocket';

export default function Layout() {
  // Establish WebSocket connection for real-time push updates from the scheduler.
  // When the backend emits 'cluster_update', the hook invalidates the matching
  // React Query cache keys so the UI refreshes instantly.
  useSocket();

  return (
    <div className="min-h-screen bg-dashboard-bg">
      <Sidebar />
      <Header />
      <main className="ml-64 mt-14 p-6">
        <Outlet />
      </main>
    </div>
  );
}
