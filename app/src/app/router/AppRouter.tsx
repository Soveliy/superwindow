import { Route, Routes } from 'react-router-dom';
import { ProtectedRoute } from '@/app/router/ProtectedRoute';
import { authStorage } from '@/features/auth/model/auth-storage';
import { LoginPage } from '@/features/auth/pages/LoginPage';
import { CalculatorPage } from '@/features/calculator/pages/CalculatorPage';
import {
  LeadArchivePage,
  LeadDetailsPage,
  LeadsMarketplacePage,
  MyLeadsPage,
  NotificationsPage,
  WorkOrderDetailsPage,
  WorkOrdersPage,
} from '@/features/leads/pages';
import { OrderDetailsPage } from '@/features/orders/pages/OrderDetailsPage';
import { OrdersPage } from '@/features/orders/pages/OrdersPage';
import { PaymentPage } from '@/features/payment/pages/PaymentPage';
import { NotificationSettingsPage } from '@/features/settings/pages/NotificationSettingsPage';
import { SettingsPage } from '@/features/settings/pages/SettingsPage';

const HomeRoute = () => (authStorage.hasSession() ? <OrdersPage /> : <LoginPage />);

export const AppRouter = () => {
  return (
    <Routes>
      <Route path="/" element={<HomeRoute />} />
      <Route path="/login" element={<HomeRoute />} />
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
        path="/leads"
        element={
          <ProtectedRoute>
            <LeadsMarketplacePage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/leads/my"
        element={
          <ProtectedRoute>
            <MyLeadsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/leads/archive"
        element={
          <ProtectedRoute>
            <LeadArchivePage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/leads/:leadId"
        element={
          <ProtectedRoute>
            <LeadDetailsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/work-orders"
        element={
          <ProtectedRoute>
            <WorkOrdersPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/work-orders/:workOrderId"
        element={
          <ProtectedRoute>
            <WorkOrderDetailsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/notifications"
        element={
          <ProtectedRoute>
            <NotificationsPage />
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
      <Route
        path="/settings/notifications"
        element={
          <ProtectedRoute>
            <NotificationSettingsPage />
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<HomeRoute />} />
    </Routes>
  );
};
