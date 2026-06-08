import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import './Dashboard.css';

import {
  BarChart3,
  Boxes,
  Megaphone,
  ShoppingCart,
  UserCircle2,
  ChartNoAxesCombined,
  LogOut,
  Settings,
} from 'lucide-react';

const navItems = [
  { path: 'executive-summary', label: 'Executive Summary', Icon: ChartNoAxesCombined },
  { path: 'revenue', label: 'Revenue', Icon: BarChart3 },
  { path: 'inventory', label: 'Inventory', Icon: Boxes },
  { path: 'buybox', label: 'Buybox', Icon: ShoppingCart },
  { path: 'marketing', label: 'Marketing', Icon: Megaphone },
  { path: 'profile', label: 'Profile', Icon: UserCircle2 },
];

export default function Dashboard() {
  
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const headerName = user?.databaseName || import.meta.env.VITE_APP_NAME || 'Dashboard';
  const displayName =
    user?.name ||
    user?.fullName ||
    user?.username ||
    user?.email ||
    user?.databaseName ||
    'User';
  const initials = displayName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <div className="dashboard-layout">
      <aside className={`sidebar ${sidebarOpen ? 'open' : 'closed'}`}>
        <div className="sidebar-header">
          <span className="logo" title={headerName}>{headerName}</span>
          <button
            type="button"
            className="sidebar-toggle"
            onClick={() => setSidebarOpen((prev) => !prev)}
            aria-label={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
            title={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
          >
            {sidebarOpen ? '◀' : '▶'}
          </button>
        </div>
        <nav className="sidebar-nav">
          {navItems.map(({ path, label, Icon }) => (
            <NavLink key={path} to={path} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
              <span className="nav-icon" aria-hidden="true">
                <Icon size={20} strokeWidth={1.5} />
              </span>
              {sidebarOpen && <span className="nav-label">{label}</span>}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-profile">
          <div className="profile-avatar" aria-hidden="true">
            {initials || 'U'}
          </div>
          {sidebarOpen && <div className="profile-name">{displayName}</div>}
          {sidebarOpen && (
            <div className="profile-actions">
              <button
                type="button"
                className="profile-action-btn"
                title="Settings"
                aria-label="Settings"
              >
                <Settings size={16} strokeWidth={1.5} />
              </button>
              <button
                type="button"
                className="profile-action-btn"
                onClick={handleLogout}
                title="Logout"
                aria-label="Logout"
              >
                <LogOut size={16} strokeWidth={1.5} />
              </button>
            </div>
          )}
        </div>
      </aside>
      <main className="dashboard-main">
        <div className="dashboard-content">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
 