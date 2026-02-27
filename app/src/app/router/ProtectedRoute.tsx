import type { PropsWithChildren } from 'react';
import { Navigate } from 'react-router-dom';
import { authStorage } from '@/features/auth/model/auth-storage';

export const ProtectedRoute = ({ children }: PropsWithChildren) => {
  if (!authStorage.hasSession()) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
};
