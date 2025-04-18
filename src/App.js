import React, { useEffect } from 'react';
import { BrowserRouter as Router, Route, Routes, Navigate, useLocation } from 'react-router-dom';
import { UserProvider, useUser } from './contexts/UserContext';
import Home from './pages/Home/Home';
import Register from './pages/Register/Register';
import AccountManagement from './pages/AccountManagement';
import ForgotPassword from './pages/ForgotPassword';
import Login from './pages/Login/Login';
import RequireLogin from './components/RequireLogin';
import './App.css';
import LoginAdmin from './pages/Admin/LoginAdmin';
import AdminDashboard from './pages/Admin/AdminDashboard';

// Protected Route Component
const ProtectedRoute = ({ children }) => {
  const { userId } = useUser();
  const location = useLocation();
  const isAdminRoute = location.pathname.startsWith('/admin/');

  if (!userId) {
    if (isAdminRoute) {
      return <LoginAdmin />;
    }
    return <RequireLogin returnUrl={location.pathname} />;
  }

  return children;
};

// Main App Component
function AppContent() {
  const { setUserId } = useUser();

  useEffect(() => {
    const userId = localStorage.getItem('userId');
    if (userId) {
      setUserId(userId);
    }
  }, [setUserId]);

  return (
    <Router>
      <Routes>
        {/* Public Routes */}
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/admin/login" element={<LoginAdmin />} />
        {/* Protected Routes */}
        <Route path="/" element={
          <ProtectedRoute>
            <Home />
          </ProtectedRoute>
        } />
        <Route path="/home" element={
          <ProtectedRoute>
            <Home />
          </ProtectedRoute>
        } />
        
        
        <Route path="/account-management" element={
          <ProtectedRoute>
            <AccountManagement />
          </ProtectedRoute>
        } />
        
        <Route path="/admin/dashboard" element={
          <ProtectedRoute>
            <AdminDashboard />
          </ProtectedRoute>
        } />
        <Route path="*" element={<Navigate to="/home" replace />} />
      </Routes>
    </Router>
  );
}

// Wrapper with UserProvider
function App() {
  return (
    <UserProvider>
      <AppContent />
    </UserProvider>
  );
}

export default App;