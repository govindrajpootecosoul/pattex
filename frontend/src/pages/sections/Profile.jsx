import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { authApi } from '../../api/api';

export default function Profile() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const [users, setUsers] = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [usersError, setUsersError] = useState('');

  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({ name: '', email: '', phone: '', status: 'active' });
  const [savingEdit, setSavingEdit] = useState(false);

  const [showSignup, setShowSignup] = useState(false);
  const [signupForm, setSignupForm] = useState({
    name: '',
    email: '',
    phone: '',
    password: '',
    role: 'user',
  });
  const [signupError, setSignupError] = useState('');
  const [signupLoading, setSignupLoading] = useState(false);

  const email = user?.email || user?.username || 'user@example.com';
  const name = user?.name || 'Pattex User';
  const databaseName = user?.databaseName || 'N/A';

  const statusLabel = (status) => (status === 'inactive' ? 'Inactive' : 'Active');

  const sortedUsers = useMemo(
    () =>
      [...users].sort((a, b) => {
        const aName = (a.name || '').toLowerCase();
        const bName = (b.name || '').toLowerCase();
        return aName.localeCompare(bName);
      }),
    [users]
  );

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const loadUsers = async () => {
    setLoadingUsers(true);
    setUsersError('');
    try {
      const data = await authApi.getUsersByDatabase();
      setUsers(data || []);
    } catch (err) {
      setUsersError(err.message || 'Failed to load users');
    } finally {
      setLoadingUsers(false);
    }
  };

  useEffect(() => {
    if (user?.databaseName && user?.role === 'admin') {
      loadUsers();
    }
  }, [user?.databaseName, user?.role]);

  const startEdit = (u) => {
    setEditingId(u._id);
    setEditForm({
      name: u.name || '',
      email: u.email || '',
      phone: u.phone || '',
      status: u.status || 'active',
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditForm({ name: '', email: '', phone: '', status: 'active' });
  };

  const handleEditChange = (field, value) => {
    setEditForm((prev) => ({ ...prev, [field]: value }));
  };

  const saveEdit = async (id) => {
    setSavingEdit(true);
    try {
      const updated = await authApi.updateUser(id, editForm);
      setUsers((prev) => prev.map((u) => (u._id === id ? updated : u)));
      cancelEdit();
    } catch (err) {
      alert(err.message || 'Failed to update user');
    } finally {
      setSavingEdit(false);
    }
  };

  const deleteUser = async (id) => {
    if (!window.confirm('Are you sure you want to delete this user?')) return;
    try {
      await authApi.deleteUser(id);
      setUsers((prev) => prev.filter((u) => u._id !== id));
    } catch (err) {
      alert(err.message || 'Failed to delete user');
    }
  };

  const handleSignupChange = (field, value) => {
    setSignupForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSignupSubmit = async (e) => {
    e.preventDefault();
    if (!user?.databaseName) {
      setSignupError('No database name on your profile. Cannot create users.');
      return;
    }
    setSignupError('');
    setSignupLoading(true);
    try {
      await authApi.signup({
        ...signupForm,
        databaseName: user.databaseName,
      });
      setSignupForm({ name: '', email: '', phone: '', password: '', role: 'user' });
      setShowSignup(false);
      await loadUsers();
    } catch (err) {
      setSignupError(err.message || 'Failed to create user');
    } finally {
      setSignupLoading(false);
    }
  };

  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div>
        <h3 style={{ marginBottom: '0.5rem' }}>Profile</h3>
        <p className="section-muted">Manage your account, company users and status.</p>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1.2fr) minmax(0, 1.8fr)',
          gap: '1.5rem',
        }}
      >
        <div
          style={{
            padding: '1rem 1.25rem',
            borderRadius: '0.75rem',
            background: 'var(--surface-subtle, #0f172a08)',
            border: '1px solid var(--border-subtle, #e2e8f0)',
          }}
        >
          <div style={{ marginBottom: '0.75rem' }}>
            <div
              className="section-muted"
              style={{ fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.08em' }}
            >
              Signed in as
            </div>
            <div style={{ fontWeight: 600 }}>{name}</div>
            <div style={{ fontSize: '0.9rem', color: '#64748b' }}>{email}</div>
          </div>

          <div style={{ marginBottom: '0.75rem' }}>
            <div
              className="section-muted"
              style={{ fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.08em' }}
            >
              Database
            </div>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                padding: '0.15rem 0.6rem',
                borderRadius: '999px',
                background: '#eff6ff',
                color: '#1d4ed8',
                fontSize: '0.8rem',
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
              }}
            >
              {databaseName}
            </span>
          </div>

          <button
            type="button"
            className="btn-logout"
            onClick={handleLogout}
            style={{ width: '100%', justifyContent: 'center', display: 'inline-flex', marginTop: '0.75rem' }}
          >
            Logout
          </button>
        </div>

        {user?.role === 'admin' && (
        <div
          style={{
            padding: '1rem 1.25rem',
            borderRadius: '0.75rem',
            background: 'var(--surface-subtle, #0f172a08)',
            border: '1px solid var(--border-subtle, #e2e8f0)',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '0.75rem',
              marginBottom: '0.75rem',
            }}
          >
            <div>
              <div
                className="section-muted"
                style={{ fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.08em' }}
              >
                Company users
              </div>
              <div style={{ fontSize: '0.9rem', color: '#64748b' }}>
                Showing users for <strong>{databaseName}</strong>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setShowSignup((prev) => !prev)}
              style={{
                padding: '0.45rem 0.9rem',
                borderRadius: '999px',
                border: 'none',
                background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
                color: '#fff',
                fontSize: '0.85rem',
                fontWeight: 600,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              {showSignup ? 'Close signup' : 'Add user (same DB)'}
            </button>
          </div>

          {showSignup && (
            <form onSubmit={handleSignupSubmit} style={{ marginBottom: '1rem', display: 'grid', gap: '0.5rem' }}>
              {signupError && (
                <div
                  style={{
                    background: 'rgba(239, 68, 68, 0.08)',
                    borderRadius: '0.75rem',
                    padding: '0.5rem 0.75rem',
                    fontSize: '0.85rem',
                    color: '#b91c1c',
                  }}
                >
                  {signupError}
                </div>
              )}
              <div style={{ display: 'grid', gap: '0.25rem' }}>
                <label style={{ fontSize: '0.8rem', color: '#475569' }}>Name</label>
                <input
                  type="text"
                  value={signupForm.name}
                  onChange={(e) => handleSignupChange('name', e.target.value)}
                  required
                  placeholder="User name"
                  style={{ fontSize: '0.9rem', padding: '0.4rem 0.6rem', borderRadius: '0.5rem', border: '1px solid #e2e8f0' }}
                />
              </div>
              <div style={{ display: 'grid', gap: '0.25rem' }}>
                <label style={{ fontSize: '0.8rem', color: '#475569' }}>Email</label>
                <input
                  type="email"
                  value={signupForm.email}
                  onChange={(e) => handleSignupChange('email', e.target.value)}
                  required
                  placeholder="user@example.com"
                  style={{ fontSize: '0.9rem', padding: '0.4rem 0.6rem', borderRadius: '0.5rem', border: '1px solid #e2e8f0' }}
                />
              </div>
              <div style={{ display: 'grid', gap: '0.25rem' }}>
                <label style={{ fontSize: '0.8rem', color: '#475569' }}>Phone</label>
                <input
                  type="tel"
                  value={signupForm.phone}
                  onChange={(e) => handleSignupChange('phone', e.target.value)}
                  required
                  placeholder="+1234567890"
                  style={{ fontSize: '0.9rem', padding: '0.4rem 0.6rem', borderRadius: '0.5rem', border: '1px solid #e2e8f0' }}
                />
              </div>
              <div style={{ display: 'grid', gap: '0.25rem' }}>
                <label style={{ fontSize: '0.8rem', color: '#475569' }}>Password</label>
                <input
                  type="password"
                  value={signupForm.password}
                  onChange={(e) => handleSignupChange('password', e.target.value)}
                  required
                  minLength={6}
                  placeholder="Min 6 characters"
                  style={{ fontSize: '0.9rem', padding: '0.4rem 0.6rem', borderRadius: '0.5rem', border: '1px solid #e2e8f0' }}
                />
              </div>
              <div style={{ display: 'grid', gap: '0.25rem' }}>
                <label style={{ fontSize: '0.8rem', color: '#475569' }}>Database name (auto)</label>
                <input
                  type="text"
                  value={databaseName}
                  readOnly
                  disabled
                  style={{
                    fontSize: '0.9rem',
                    padding: '0.4rem 0.6rem',
                    borderRadius: '0.5rem',
                    border: '1px solid #e2e8f0',
                    background: '#f1f5f9',
                    color: '#64748b',
                  }}
                  title="Database name is fixed from your login"
                />
              </div>
              <div style={{ display: 'grid', gap: '0.25rem' }}>
                <label style={{ fontSize: '0.8rem', color: '#475569' }}>Role</label>
                <select
                  value={signupForm.role}
                  onChange={(e) => handleSignupChange('role', e.target.value)}
                  style={{
                    fontSize: '0.9rem',
                    padding: '0.4rem 0.6rem',
                    borderRadius: '0.5rem',
                    border: '1px solid #e2e8f0',
                    background: '#ffffff',
                  }}
                >
                  <option value="user">User</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
              <button
                type="submit"
                disabled={signupLoading}
                style={{
                  marginTop: '0.5rem',
                  padding: '0.5rem 0.75rem',
                  borderRadius: '0.6rem',
                  border: 'none',
                  background: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)',
                  color: '#fff',
                  fontWeight: 600,
                  fontSize: '0.9rem',
                  cursor: 'pointer',
                }}
              >
                {signupLoading ? 'Creating user...' : 'Create user'}
              </button>
            </form>
          )}

          {loadingUsers ? (
            <div style={{ fontSize: '0.9rem', color: '#64748b' }}>Loading users...</div>
          ) : usersError ? (
            <div style={{ fontSize: '0.85rem', color: '#b91c1c' }}>{usersError}</div>
          ) : sortedUsers.length === 0 ? (
            <div style={{ fontSize: '0.9rem', color: '#64748b' }}>No users found for this database yet.</div>
          ) : (
            <div style={{ maxHeight: 260, overflow: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                <thead>
                  <tr style={{ textAlign: 'left', color: '#64748b' }}>
                    <th style={{ padding: '0.35rem 0.25rem' }}>Name</th>
                    <th style={{ padding: '0.35rem 0.25rem' }}>Email</th>
                    <th style={{ padding: '0.35rem 0.25rem' }}>Phone</th>
                    <th style={{ padding: '0.35rem 0.25rem' }}>Status</th>
                    <th style={{ padding: '0.35rem 0.25rem', textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedUsers.map((u) => {
                    const isEditing = editingId === u._id;
                    return (
                      <tr key={u._id} style={{ borderTop: '1px solid #e2e8f0' }}>
                        <td style={{ padding: '0.35rem 0.25rem' }}>
                          {isEditing ? (
                            <input
                              type="text"
                              value={editForm.name}
                              onChange={(e) => handleEditChange('name', e.target.value)}
                              style={{
                                width: '100%',
                                fontSize: '0.8rem',
                                padding: '0.25rem 0.35rem',
                                borderRadius: '0.4rem',
                                border: '1px solid #e2e8f0',
                              }}
                            />
                          ) : (
                            u.name
                          )}
                        </td>
                        <td style={{ padding: '0.35rem 0.25rem' }}>
                          {isEditing ? (
                            <input
                              type="email"
                              value={editForm.email}
                              onChange={(e) => handleEditChange('email', e.target.value)}
                              style={{
                                width: '100%',
                                fontSize: '0.8rem',
                                padding: '0.25rem 0.35rem',
                                borderRadius: '0.4rem',
                                border: '1px solid #e2e8f0',
                              }}
                            />
                          ) : (
                            <span style={{ color: '#475569' }}>{u.email}</span>
                          )}
                        </td>
                        <td style={{ padding: '0.35rem 0.25rem' }}>
                          {isEditing ? (
                            <input
                              type="tel"
                              value={editForm.phone}
                              onChange={(e) => handleEditChange('phone', e.target.value)}
                              style={{
                                width: '100%',
                                fontSize: '0.8rem',
                                padding: '0.25rem 0.35rem',
                                borderRadius: '0.4rem',
                                border: '1px solid #e2e8f0',
                              }}
                            />
                          ) : (
                            <span style={{ color: '#475569' }}>{u.phone}</span>
                          )}
                        </td>
                        <td style={{ padding: '0.35rem 0.25rem' }}>
                          {isEditing ? (
                            <select
                              value={editForm.status}
                              onChange={(e) => handleEditChange('status', e.target.value)}
                              style={{
                                fontSize: '0.8rem',
                                padding: '0.25rem 0.35rem',
                                borderRadius: '0.4rem',
                                border: '1px solid #e2e8f0',
                                background: '#ffffff',
                              }}
                            >
                              <option value="active">Active</option>
                              <option value="inactive">Inactive</option>
                            </select>
                          ) : (
                            <span
                              style={{
                                display: 'inline-flex',
                                padding: '0.15rem 0.5rem',
                                borderRadius: '999px',
                                fontSize: '0.75rem',
                                fontWeight: 600,
                                textTransform: 'uppercase',
                                letterSpacing: '0.08em',
                                background: u.status === 'inactive' ? '#fee2e2' : '#dcfce7',
                                color: u.status === 'inactive' ? '#b91c1c' : '#15803d',
                              }}
                            >
                              {statusLabel(u.status)}
                            </span>
                          )}
                        </td>
                        <td style={{ padding: '0.35rem 0.25rem', textAlign: 'right' }}>
                          {isEditing ? (
                            <div style={{ display: 'inline-flex', gap: '0.25rem' }}>
                              <button
                                type="button"
                                onClick={() => saveEdit(u._id)}
                                disabled={savingEdit}
                                style={{
                                  padding: '0.25rem 0.45rem',
                                  fontSize: '0.75rem',
                                  borderRadius: '0.4rem',
                                  border: 'none',
                                  background: '#22c55e',
                                  color: '#fff',
                                  cursor: 'pointer',
                                }}
                              >
                                {savingEdit ? 'Saving...' : 'Save'}
                              </button>
                              <button
                                type="button"
                                onClick={cancelEdit}
                                style={{
                                  padding: '0.25rem 0.45rem',
                                  fontSize: '0.75rem',
                                  borderRadius: '0.4rem',
                                  border: '1px solid #e2e8f0',
                                  background: '#ffffff',
                                  color: '#475569',
                                  cursor: 'pointer',
                                }}
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <div style={{ display: 'inline-flex', gap: '0.25rem' }}>
                              <button
                                type="button"
                                onClick={() => startEdit(u)}
                                style={{
                                  padding: '0.25rem 0.45rem',
                                  fontSize: '0.75rem',
                                  borderRadius: '0.4rem',
                                  border: '1px solid #e2e8f0',
                                  background: '#ffffff',
                                  color: '#0f172a',
                                  cursor: 'pointer',
                                }}
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                onClick={() => deleteUser(u._id)}
                                style={{
                                  padding: '0.25rem 0.45rem',
                                  fontSize: '0.75rem',
                                  borderRadius: '0.4rem',
                                  border: 'none',
                                  background: '#ef4444',
                                  color: '#fff',
                                  cursor: 'pointer',
                                }}
                              >
                                Delete
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
        )}
      </div>
    </div>
  );
}

