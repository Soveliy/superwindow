const LOCAL_STORAGE_KEY = 'superwindow.dealer_session.local';
const SESSION_STORAGE_KEY = 'superwindow.dealer_session.temp';

export interface DealerSession {
  token: string;
  dealerId: string;
  loggedAt: string;
}

const parseSession = (rawValue: string | null): DealerSession | null => {
  if (!rawValue) {
    return null;
  }

  try {
    const parsed = JSON.parse(rawValue) as DealerSession;

    if (!parsed.token || !parsed.dealerId) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
};

const saveSession = (session: DealerSession, rememberMe: boolean): void => {
  const value = JSON.stringify(session);

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
};

export const authStorage = {
  saveSession,
  getSession,
  clearSession,
  hasSession: (): boolean => Boolean(getSession()),
};
