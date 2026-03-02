import { ordersMock, type OrderSummary } from '@/features/orders/model/orders.mock';
import type { CalculatorPosition } from '@/features/calculator/model/positions.storage';

const ORDER_DRAFTS_STORAGE_KEY = 'superwindow.orders.drafts.v1';

export interface OrderCustomerForm {
  fullName: string;
  phone: string;
  address: string;
  contractNumber: string;
  readinessDate: string;
  installationDate: string;
  comment: string;
}

interface StoredOrderDraft {
  id: string;
  form: OrderCustomerForm;
  amount: number | null;
  positions?: CalculatorPosition[];
  createdAt: string;
  updatedAt: string;
}

const orderDateFormatter = new Intl.DateTimeFormat('ru-RU', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
});

const isValidString = (value: unknown): value is string => typeof value === 'string';
const isValidDraftAmount = (value: unknown): value is number | null | undefined =>
  typeof value === 'undefined' || value === null || (typeof value === 'number' && Number.isFinite(value) && value >= 0);
const isValidOptionalNumber = (value: unknown): value is number | undefined =>
  typeof value === 'undefined' || (typeof value === 'number' && Number.isFinite(value));
const isValidCalculatorPosition = (value: unknown): value is CalculatorPosition => {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const position = value as Partial<CalculatorPosition>;

  return (
    typeof position.id === 'number' &&
    Number.isFinite(position.id) &&
    isValidOptionalNumber(position.width) &&
    isValidOptionalNumber(position.height) &&
    isValidOptionalNumber(position.price)
  );
};
const isValidDraftPositions = (value: unknown): value is CalculatorPosition[] | undefined =>
  typeof value === 'undefined' || (Array.isArray(value) && value.every(isValidCalculatorPosition));

const cloneForm = (form: OrderCustomerForm): OrderCustomerForm => ({
  fullName: form.fullName,
  phone: form.phone,
  address: form.address,
  contractNumber: form.contractNumber,
  readinessDate: form.readinessDate,
  installationDate: form.installationDate,
  comment: form.comment,
});
const normalizePositionId = (value: number): number => Math.max(1, Math.trunc(value));
const normalizePositionNumber = (value: number | undefined): number | undefined => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return undefined;
  }

  return Math.max(0, Math.trunc(value));
};
const normalizeDraftPositions = (positions: CalculatorPosition[] | undefined): CalculatorPosition[] => {
  if (!Array.isArray(positions)) {
    return [];
  }

  return positions.filter(isValidCalculatorPosition).map((position) => {
    const normalized: CalculatorPosition = {
      id: normalizePositionId(position.id),
    };
    const width = normalizePositionNumber(position.width);
    const height = normalizePositionNumber(position.height);
    const price = normalizePositionNumber(position.price);

    if (typeof width === 'number') {
      normalized.width = width;
    }
    if (typeof height === 'number') {
      normalized.height = height;
    }
    if (typeof price === 'number') {
      normalized.price = price;
    }

    return normalized;
  });
};
const clonePositions = (positions: CalculatorPosition[]): CalculatorPosition[] => normalizeDraftPositions(positions);

const isStorageAvailable = (): boolean => typeof window !== 'undefined' && Boolean(window.localStorage);

const createEmptyOrderCustomerForm = (): OrderCustomerForm => ({
  fullName: '',
  phone: '',
  address: '',
  contractNumber: '',
  readinessDate: '',
  installationDate: '',
  comment: '',
});

const isOrderCustomerForm = (value: unknown): value is OrderCustomerForm => {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const form = value as Partial<OrderCustomerForm>;

  return (
    isValidString(form.fullName) &&
    isValidString(form.phone) &&
    isValidString(form.address) &&
    isValidString(form.contractNumber) &&
    isValidString(form.readinessDate) &&
    isValidString(form.installationDate) &&
    isValidString(form.comment)
  );
};

const isStoredOrderDraft = (value: unknown): value is StoredOrderDraft => {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const draft = value as Partial<StoredOrderDraft>;

  return (
    isValidString(draft.id) &&
    isOrderCustomerForm(draft.form) &&
    isValidDraftAmount(draft.amount) &&
    isValidDraftPositions(draft.positions) &&
    isValidString(draft.createdAt) &&
    isValidString(draft.updatedAt)
  );
};

const normalizeDraftAmount = (value: number | null | undefined): number | null => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return null;
  }

  return Math.max(0, Math.round(value));
};

const parseOrderDrafts = (rawValue: string | null): StoredOrderDraft[] => {
  if (!rawValue) {
    return [];
  }

  try {
    const parsed = JSON.parse(rawValue) as unknown;

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter(isStoredOrderDraft).map((draft) => ({
      ...draft,
      amount: normalizeDraftAmount(draft.amount),
      positions: normalizeDraftPositions(draft.positions),
    }));
  } catch {
    return [];
  }
};

const readOrderDrafts = (): StoredOrderDraft[] => {
  if (!isStorageAvailable()) {
    return [];
  }

  return parseOrderDrafts(localStorage.getItem(ORDER_DRAFTS_STORAGE_KEY));
};

const writeOrderDrafts = (drafts: StoredOrderDraft[]): void => {
  if (!isStorageAvailable()) {
    return;
  }

  localStorage.setItem(ORDER_DRAFTS_STORAGE_KEY, JSON.stringify(drafts));
};

const extractOrderNumber = (orderId: string): number => {
  const parsed = Number.parseInt(orderId.replace(/\D/g, ''), 10);

  if (Number.isNaN(parsed)) {
    return 0;
  }

  return parsed;
};

const getNextOrderId = (drafts: StoredOrderDraft[]): string => {
  const maxOrderNumber = [...ordersMock.map((item) => item.id), ...drafts.map((item) => item.id)].reduce(
    (maxValue, orderId) => Math.max(maxValue, extractOrderNumber(orderId)),
    0,
  );

  return `ORD-${maxOrderNumber + 1}`;
};

const formatDraftDate = (isoDate: string): string => {
  const parsedDate = new Date(isoDate);

  if (Number.isNaN(parsedDate.getTime())) {
    return orderDateFormatter.format(new Date());
  }

  return orderDateFormatter.format(parsedDate);
};

const mapDraftToSummary = (draft: StoredOrderDraft): OrderSummary => {
  const baseOrder = ordersMock.find((item) => item.id === draft.id);
  const customerName = draft.form.fullName.trim();

  return {
    id: draft.id,
    date: baseOrder?.date ?? formatDraftDate(draft.updatedAt),
    customer: customerName || baseOrder?.customer || 'Новый заказ',
    status: baseOrder?.status ?? 'new',
    amount: draft.amount ?? baseOrder?.amount ?? null,
    subtitle: baseOrder?.subtitle ?? 'Ожидание расчета',
    note: baseOrder?.note ?? 'Оценка',
  };
};

const getSortedDrafts = (drafts: StoredOrderDraft[]): StoredOrderDraft[] =>
  [...drafts].sort((first, second) => second.updatedAt.localeCompare(first.updatedAt));

const getOrders = (): OrderSummary[] => {
  const drafts = readOrderDrafts();
  const draftIds = new Set(drafts.map((item) => item.id));
  const draftOrders = getSortedDrafts(drafts).map(mapDraftToSummary);
  const baseOrders = ordersMock.filter((item) => !draftIds.has(item.id));

  return [...draftOrders, ...baseOrders];
};

const getOrderById = (orderId: string): OrderSummary | undefined => {
  const draft = readOrderDrafts().find((item) => item.id === orderId);

  if (draft) {
    return mapDraftToSummary(draft);
  }

  return ordersMock.find((item) => item.id === orderId);
};

const getOrderForm = (orderId: string): OrderCustomerForm | null => {
  const draft = readOrderDrafts().find((item) => item.id === orderId);

  if (!draft) {
    return null;
  }

  return cloneForm(draft.form);
};

const getOrderPositions = (orderId: string): CalculatorPosition[] | null => {
  const draft = readOrderDrafts().find((item) => item.id === orderId);

  if (!draft) {
    return null;
  }

  return clonePositions(draft.positions ?? []);
};

const saveOrder = (
  orderId: string,
  form: OrderCustomerForm,
  amount?: number | null,
  positions?: CalculatorPosition[],
): void => {
  const drafts = readOrderDrafts();
  const now = new Date().toISOString();
  const normalizedForm = cloneForm(form);
  const normalizedAmount = normalizeDraftAmount(amount);
  const normalizedPositions = clonePositions(positions ?? []);
  const draftIndex = drafts.findIndex((item) => item.id === orderId);

  if (draftIndex === -1) {
    drafts.unshift({
      id: orderId,
      form: normalizedForm,
      amount: normalizedAmount,
      positions: normalizedPositions,
      createdAt: now,
      updatedAt: now,
    });
  } else {
    drafts[draftIndex] = {
      ...drafts[draftIndex],
      form: normalizedForm,
      amount: typeof amount === 'undefined' ? drafts[draftIndex].amount : normalizedAmount,
      positions: typeof positions === 'undefined' ? drafts[draftIndex].positions ?? [] : normalizedPositions,
      updatedAt: now,
    };
  }

  writeOrderDrafts(drafts);
};

const createOrder = (form: OrderCustomerForm, amount?: number | null, positions?: CalculatorPosition[]): string => {
  const drafts = readOrderDrafts();
  const orderId = getNextOrderId(drafts);
  const now = new Date().toISOString();

  drafts.unshift({
    id: orderId,
    form: cloneForm(form),
    amount: normalizeDraftAmount(amount),
    positions: clonePositions(positions ?? []),
    createdAt: now,
    updatedAt: now,
  });
  writeOrderDrafts(drafts);

  return orderId;
};

export const ordersStorage = {
  createEmptyOrderCustomerForm,
  createOrder,
  getOrderById,
  getOrderForm,
  getOrderPositions,
  getOrders,
  saveOrder,
};
