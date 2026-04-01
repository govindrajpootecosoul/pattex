import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import './Dashboard.css';

import executiveIcon from '../icons/executive.svg';
import revenueIcon from '../icons/revenue.svg';
import inventoryIcon from '../icons/inventory.svg';
import buyboxIcon from '../icons/buybox.svg';
import marketingIcon from '../icons/marketing.svg';
import profileIcon from '../icons/profile.svg';

const navItems = [
  { path: 'executive-summary', label: 'Executive Summary', icon: executiveIcon },
  { path: 'revenue', label: 'Revenue', icon: revenueIcon },
  { path: 'inventory', label: 'Inventory', icon: inventoryIcon },
  { path: 'buybox', label: 'Buybox', icon: buyboxIcon },
  { path: 'marketing', label: 'Marketing', icon: marketingIcon },
  { path: 'profile', label: 'Profile', icon: profileIcon },
];

export default function Dashboard() {
  
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const headerName = user?.databaseName || import.meta.env.VITE_APP_NAME || 'Dashboard';

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
          {navItems.map(({ path, label, icon }) => (
            <NavLink key={path} to={path} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
              <span className="nav-icon" aria-hidden="true">
                <img
                  src={icon}
                  alt=""
                  width={20}
                  height={20}
                  style={{ display: 'block' }}
                  loading="eager"
                />
              </span>
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
 