import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import Header from './Header';

export default function Layout() {
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
