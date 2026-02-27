import { Navigate, Route, Routes } from 'react-router-dom';
import { ProtectedRoute } from '@/app/router/ProtectedRoute';
import { authStorage } from '@/features/auth/model/auth-storage';
import { LoginPage } from '@/features/auth/pages/LoginPage';
import { CalculatorPage } from '@/features/calculator/pages/CalculatorPage';
import { OrderDetailsPage } from '@/features/orders/pages/OrderDetailsPage';
import { OrdersPage } from '@/features/orders/pages/OrdersPage';
import { PaymentPage } from '@/features/payment/pages/PaymentPage';
import { SettingsPage } from '@/features/settings/pages/SettingsPage';

const RootRedirect = () => (
  <Navigate to={authStorage.hasSession() ? '/orders' : '/login'} replace />
);

export const AppRouter = () => {
  return (
    <Routes>
      <Route path="/" element={<RootRedirect />} />
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/orders"
        element={
          <ProtectedRoute>
            <OrdersPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/orders/new"
        element={
          <ProtectedRoute>
            <OrderDetailsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/orders/:orderId"
        element={
          <ProtectedRoute>
            <OrderDetailsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/calculator"
        element={
          <ProtectedRoute>
            <CalculatorPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/payment"
        element={
          <ProtectedRoute>
            <PaymentPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/settings"
        element={
          <ProtectedRoute>
            <SettingsPage />
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<RootRedirect />} />
    </Routes>
  );
};
