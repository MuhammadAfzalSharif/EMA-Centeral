import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from './components/Toast/ToastContext';
import Login from './pages/Auth/Login';
import Signup from './pages/Auth/Signup';
import Dashboard from './pages/Dashboard/Dashboard';
import Expenses from './pages/Expenses/Expenses';
import Reconciliation from './pages/Reconciliation/Reconciliation';
import QderaReconciliation from './pages/Qdera/QderaReconciliation';
import FlagCheck from './pages/FlagCheck/FlagCheck';
import ReceiptCategorization from './pages/ReceiptCategorization/ReceiptCategorization';
import Layout from './components/Layout/Layout';
import ProtectedRoute from './components/ProtectedRoute';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <Router>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/signup" element={<Signup />} />
            <Route
              path="/jobs"
              element={
                <ProtectedRoute>
                  <Layout>
                    <Dashboard />
                  </Layout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/expenses"
              element={
                <ProtectedRoute>
                  <Layout>
                    <Expenses />
                  </Layout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/reconciliation"
              element={
                <ProtectedRoute>
                  <Layout>
                    <Reconciliation />
                  </Layout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/qdera"
              element={
                <ProtectedRoute>
                  <Layout>
                    <QderaReconciliation />
                  </Layout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/flagcheck"
              element={
                <ProtectedRoute>
                  <Layout>
                    <FlagCheck />
                  </Layout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/receipt-categorization"
              element={
                <ProtectedRoute>
                  <Layout>
                    <ReceiptCategorization />
                  </Layout>
                </ProtectedRoute>
              }
            />
            <Route path="/dashboard" element={<Navigate to="/jobs" replace />} />
            <Route path="/" element={<Navigate to="/jobs" replace />} />
          </Routes>
        </Router>
      </ToastProvider>
    </QueryClientProvider>
  );
}

export default App;
