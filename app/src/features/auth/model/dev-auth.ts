import type { LoginRequest, LoginResponse } from '@/features/auth/api/login';
import { env } from '@/shared/config/env';

interface DevAuthCredentials {
  emailOrDealerId: string;
  password: string;
  dealerId: string;
}

const getDevCredentials = (): DevAuthCredentials | null => {
  if (!env.devAuthEnabled) {
    return null;
  }

  return {
    emailOrDealerId: env.devAuthLogin,
    password: env.devAuthPassword,
    dealerId: env.devAuthDealerId,
  };
};

const areCredentialsMatched = (payload: LoginRequest, credentials: DevAuthCredentials): boolean =>
  payload.emailOrDealerId.trim().toLowerCase() === credentials.emailOrDealerId.trim().toLowerCase() &&
  payload.password === credentials.password;

export const tryDevLogin = (payload: LoginRequest): LoginResponse | null => {
  const credentials = getDevCredentials();

  if (!credentials) {
    return null;
  }

  // For static demo builds (GitHub Pages) where API is not configured,
  // authenticate locally and skip network requests completely.
  if (!env.apiBaseUrl) {
    const fallbackDealerId = payload.emailOrDealerId.trim() || credentials.dealerId;

    return {
      token: `demo-token-${Date.now()}`,
      dealerId: fallbackDealerId,
    };
  }

  if (!areCredentialsMatched(payload, credentials)) {
    return null;
  }

  return {
    token: `dev-token-${Date.now()}`,
    dealerId: credentials.dealerId,
  };
};

export const getDevAuthHint = (): Pick<DevAuthCredentials, 'emailOrDealerId' | 'password'> | null => {
  const credentials = getDevCredentials();

  if (!credentials) {
    return null;
  }

  return {
    emailOrDealerId: credentials.emailOrDealerId,
    password: credentials.password,
  };
};
