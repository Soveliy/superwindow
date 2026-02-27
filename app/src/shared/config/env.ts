const normalizeString = (value: string | undefined, fallback = ''): string => {
  if (!value) {
    return fallback;
  }

  const trimmedValue = value.trim();

  if (!trimmedValue) {
    return fallback;
  }

  return trimmedValue;
};

const normalizeBaseUrl = (value: string | undefined): string =>
  normalizeString(value).replace(/\/+$/, '');

const normalizeBoolean = (value: string | undefined, fallback: boolean): boolean => {
  if (!value) {
    return fallback;
  }

  const normalizedValue = value.trim().toLowerCase();

  if (normalizedValue === 'true' || normalizedValue === '1') {
    return true;
  }

  if (normalizedValue === 'false' || normalizedValue === '0') {
    return false;
  }

  return fallback;
};

export const env = {
  apiBaseUrl: normalizeBaseUrl(import.meta.env.VITE_API_BASE_URL),
  devAuthEnabled: normalizeBoolean(import.meta.env.VITE_DEV_AUTH_ENABLED, true),
  devAuthLogin: normalizeString(import.meta.env.VITE_DEV_AUTH_LOGIN, 'demo'),
  devAuthPassword: normalizeString(import.meta.env.VITE_DEV_AUTH_PASSWORD, 'demo123'),
  devAuthDealerId: normalizeString(import.meta.env.VITE_DEV_AUTH_DEALER_ID, 'DEV-0001'),
};
