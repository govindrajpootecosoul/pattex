import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

export default function Profile() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const email = user?.email || user?.username || 'user@example.com';
  const name = user?.name || 'Pattex User';

  return (
    <div className="card coming-soon">
      <h3>Profile</h3>
      <p className="section-muted">Manage your personal details and session.</p>

      <div style={{ marginTop: '1rem', textAlign: 'left', maxWidth: 400, marginInline: 'auto' }}>
        <div style={{ marginBottom: '0.5rem' }}>
          <div className="section-muted" style={{ fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            Name
          </div>
          <div>{name}</div>
        </div>
        <div style={{ marginBottom: '1.25rem' }}>
          <div className="section-muted" style={{ fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            Email
          </div>
          <div>{email}</div>
        </div>
        <button
          type="button"
          className="btn-logout"
          onClick={handleLogout}
          style={{ width: '100%', justifyContent: 'center', display: 'inline-flex' }}
        >
          Logout
        </button>
      </div>
    </div>
  );
}

