import type { PropsWithChildren } from 'react';
import { authStorage } from '@/features/auth/model/auth-storage';
import { LoginPage } from '@/features/auth/pages/LoginPage';

export const ProtectedRoute = ({ children }: PropsWithChildren) => {
  if (!authStorage.hasSession()) {
    return <LoginPage />;
  }

  return <>{children}</>;
};
