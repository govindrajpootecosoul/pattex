import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import Login from './pages/Login';
import Signup from './pages/Signup';
import Dashboard from './pages/Dashboard';
import ExecutiveSummary from './pages/sections/ExecutiveSummary';
import Revenue from './pages/sections/Revenue';
import Inventory from './pages/sections/Inventory';
import Buybox from './pages/sections/Buybox';
import Marketing from './pages/sections/Marketing';
import ProductDetails from './pages/sections/ProductDetails';

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="auth-loading">Loading...</div>;
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

function PublicRedirect({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="auth-loading">Loading...</div>;
  if (user) return <Navigate to="/dashboard" replace />;
  return children;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<PublicRedirect><Login /></PublicRedirect>} />
      <Route path="/signup" element={<PublicRedirect><Signup /></PublicRedirect>} />
      <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>}>
        <Route index element={<Navigate to="executive-summary" replace />} />
        <Route path="executive-summary" element={<ExecutiveSummary />} />
        <Route path="revenue" element={<Revenue />} />
        <Route path="inventory" element={<Inventory />} />
        <Route path="buybox" element={<Buybox />} />
        <Route path="marketing" element={<Marketing />} />
        <Route path="product-details" element={<ProductDetails />} />
      </Route>
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}
