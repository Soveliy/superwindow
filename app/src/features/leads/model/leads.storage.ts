import {
  createLeadsMockState,
  type LeadsDemoState,
} from '@/features/leads/model/leads.mock';

const STORAGE_KEY_PREFIX = 'superwindow.leads.demo.v1';
const STORAGE_EVENT = 'superwindow:leads-demo-changed';

type StateMutation<TResult> = (state: LeadsDemoState) => TResult | Promise<TResult>;

interface LockManagerLike {
  request<TResult>(
    name: string,
    options: { mode: 'exclusive' },
    callback: () => Promise<TResult>,
  ): Promise<TResult>;
}

const mutationQueues = new Map<string, Promise<void>>();

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const canUseLocalStorage = (): boolean => {
  try {
    return typeof window !== 'undefined' && Boolean(window.localStorage);
  } catch {
    return false;
  }
};

const normalizeDealerId = (dealerId: string): string => {
  const normalized = dealerId.trim();
  return normalized || 'anonymous-demo-dealer';
};

const getStorageKey = (dealerId: string): string =>
  `${STORAGE_KEY_PREFIX}.${encodeURIComponent(normalizeDealerId(dealerId))}`;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const isDemoState = (value: unknown): value is LeadsDemoState => {
  if (!isRecord(value)) {
    return false;
  }

  return (
    value.schemaVersion === 1 &&
    Array.isArray(value.leads) &&
    Array.isArray(value.workOrders) &&
    Array.isArray(value.notifications)
  );
};

const parseState = (rawValue: string | null): LeadsDemoState | null => {
  if (!rawValue) {
    return null;
  }

  try {
    const parsed = JSON.parse(rawValue) as unknown;
    return isDemoState(parsed) ? parsed : null;
  } catch {
    return null;
  }
};

const notifySubscribers = (dealerId: string): void => {
  if (typeof window === 'undefined') {
    return;
  }

  window.dispatchEvent(
    new CustomEvent(STORAGE_EVENT, {
      detail: { dealerId: normalizeDealerId(dealerId) },
    }),
  );
};

export const readLeadsDemoState = (dealerId: string): LeadsDemoState => {
  const normalizedDealerId = normalizeDealerId(dealerId);

  if (!canUseLocalStorage()) {
    return createLeadsMockState(normalizedDealerId);
  }

  const storageKey = getStorageKey(normalizedDealerId);
  const storedState = parseState(window.localStorage.getItem(storageKey));

  if (storedState) {
    return clone(storedState);
  }

  const initialState = createLeadsMockState(normalizedDealerId);

  try {
    window.localStorage.setItem(storageKey, JSON.stringify(initialState));
  } catch {
    return clone(initialState);
  }

  return clone(initialState);
};

export const writeLeadsDemoState = (dealerId: string, state: LeadsDemoState): void => {
  if (!canUseLocalStorage()) {
    return;
  }

  window.localStorage.setItem(getStorageKey(dealerId), JSON.stringify(state));
  notifySubscribers(dealerId);
};

const runInProcessQueue = <TResult>(
  key: string,
  callback: () => Promise<TResult>,
): Promise<TResult> => {
  const previous = mutationQueues.get(key) ?? Promise.resolve();
  const result = previous.then(callback, callback);
  mutationQueues.set(
    key,
    result.then(
      () => undefined,
      () => undefined,
    ),
  );
  return result;
};

const runExclusive = <TResult>(
  dealerId: string,
  callback: () => Promise<TResult>,
): Promise<TResult> => {
  const lockName = `superwindow-leads-${normalizeDealerId(dealerId)}`;
  const lockManager =
    typeof navigator === 'undefined'
      ? undefined
      : (navigator as Navigator & { locks?: LockManagerLike }).locks;

  if (lockManager) {
    return lockManager.request<TResult>(lockName, { mode: 'exclusive' }, callback);
  }

  return runInProcessQueue(lockName, callback);
};

export const mutateLeadsDemoState = <TResult>(
  dealerId: string,
  mutation: StateMutation<TResult>,
): Promise<TResult> =>
  runExclusive(dealerId, async () => {
    const state = readLeadsDemoState(dealerId);
    const result = await mutation(state);
    writeLeadsDemoState(dealerId, state);
    return clone(result);
  });

export const resetLeadsDemoState = (dealerId: string): LeadsDemoState => {
  const initialState = createLeadsMockState(normalizeDealerId(dealerId));
  writeLeadsDemoState(dealerId, initialState);
  return clone(initialState);
};

export const subscribeLeadsDemoState = (
  dealerId: string,
  listener: () => void,
): (() => void) => {
  if (typeof window === 'undefined') {
    return () => undefined;
  }

  const normalizedDealerId = normalizeDealerId(dealerId);
  const storageKey = getStorageKey(normalizedDealerId);

  const handleCustomEvent = (event: Event): void => {
    const customEvent = event as CustomEvent<{ dealerId?: string }>;

    if (customEvent.detail?.dealerId === normalizedDealerId) {
      listener();
    }
  };

  const handleStorageEvent = (event: StorageEvent): void => {
    if (event.key === storageKey) {
      listener();
    }
  };

  window.addEventListener(STORAGE_EVENT, handleCustomEvent);
  window.addEventListener('storage', handleStorageEvent);

  return () => {
    window.removeEventListener(STORAGE_EVENT, handleCustomEvent);
    window.removeEventListener('storage', handleStorageEvent);
  };
};

export const leadsDemoStorage = {
  read: readLeadsDemoState,
  write: writeLeadsDemoState,
  mutate: mutateLeadsDemoState,
  reset: resetLeadsDemoState,
  subscribe: subscribeLeadsDemoState,
};
