const LOCAL_STORAGE_KEY = 'superwindow.dealer_session.local';
const SESSION_STORAGE_KEY = 'superwindow.dealer_session.temp';
const SESSION_VERSION = 2;
const DEALER_CACHE_KEYS = ['superwindow.notification-preferences.v1'];
const DEALER_CACHE_PREFIXES = ['superwindow.leads.demo.v1.'];

export interface DealerSession {
  version?: number;
  token: string;
  dealerId: string;
  loggedAt: string;
  dealerName?: string;
  dealerEmail?: string;
  dealerLogin?: string;
}

const parseSession = (rawValue: string | null): DealerSession | null => {
  if (!rawValue) {
    return null;
  }

  try {
    const parsed = JSON.parse(rawValue) as DealerSession;

    if (parsed.version !== SESSION_VERSION || !parsed.token || !parsed.dealerId) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
};

const saveSession = (session: DealerSession, rememberMe: boolean): void => {
  const value = JSON.stringify({ ...session, version: SESSION_VERSION });

  localStorage.removeItem(LOCAL_STORAGE_KEY);
  sessionStorage.removeItem(SESSION_STORAGE_KEY);

  if (rememberMe) {
    localStorage.setItem(LOCAL_STORAGE_KEY, value);
    return;
  }

  sessionStorage.setItem(SESSION_STORAGE_KEY, value);
};

const getSession = (): DealerSession | null =>
  parseSession(localStorage.getItem(LOCAL_STORAGE_KEY)) ??
  parseSession(sessionStorage.getItem(SESSION_STORAGE_KEY));

const clearSession = (): void => {
  localStorage.removeItem(LOCAL_STORAGE_KEY);
  sessionStorage.removeItem(SESSION_STORAGE_KEY);

  for (const key of DEALER_CACHE_KEYS) {
    localStorage.removeItem(key);
  }

  for (let index = localStorage.length - 1; index >= 0; index -= 1) {
    const key = localStorage.key(index);
    if (key && DEALER_CACHE_PREFIXES.some((prefix) => key.startsWith(prefix))) {
      localStorage.removeItem(key);
    }
  }
};

export const authStorage = {
  saveSession,
  getSession,
  clearSession,
  hasSession: (): boolean => Boolean(getSession()),
};
