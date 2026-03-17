import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import './Dashboard.css';

const navItems = [
  { path: 'executive-summary', label: 'Executive Summary', icon: '📊' },
  { path: 'revenue', label: 'Revenue', icon: '💰' },
  { path: 'inventory', label: 'Inventory', icon: '📦' },
  { path: 'buybox', label: 'Buybox', icon: '🛒' },
  { path: 'marketing', label: 'Marketing', icon: '📢' },
  { path: 'profile', label: 'Profile', icon: '👤' },
];

export default function Dashboard() {
  
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const capitalizeFirst = (value) => {
    const s = String(value ?? '').trim();
    if (!s) return '';
    return s[0].toUpperCase() + s.slice(1);
  };
  const companyName = capitalizeFirst(user?.databaseName);
  const appName = capitalizeFirst(import.meta.env.VITE_APP_NAME || 'Dashboard');
  const headerName = companyName ? `${companyName} Dashboard` : appName;

  const handleLogout = () => {
    logout();
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
          {navItems.map(({ path, label, icon }) => (
            <NavLink key={path} to={path} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
              <span className="nav-icon">{icon}</span>
              {sidebarOpen && <span className="nav-label">{label}</span>}
            </NavLink>
          ))}
        </nav>
      </aside>
      <main className="dashboard-main">
        <div className="dashboard-content">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
