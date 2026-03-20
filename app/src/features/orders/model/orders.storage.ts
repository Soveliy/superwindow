import {
  isCalculatorPosition,
  normalizeCalculatorPosition,
  type CalculatorPosition,
} from '@/features/calculator/model/positions.storage';
import {
  ordersMock,
  type DeliveryMode,
  type OrderService,
  type OrderSummary,
} from '@/features/orders/model/orders.mock';

const ORDER_DRAFTS_STORAGE_KEY = 'superwindow.orders.drafts.v1';
const DEFAULT_MARGIN = '18%';
const isoDatePattern = /^\d{4}-\d{2}-\d{2}$/;

export interface OrderCustomerForm {
  fullName: string;
  phone: string;
  address: string;
  contractNumber: string;
  measurementDate: string;
  productionDate: string;
  installationDate: string;
  comment: string;
}

interface LegacyOrderCustomerForm {
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
  services?: OrderService[];
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

const isValidDraftPositions = (value: unknown): value is CalculatorPosition[] | undefined =>
  typeof value === 'undefined' || (Array.isArray(value) && value.every(isCalculatorPosition));

const isDeliveryMode = (value: unknown): value is DeliveryMode => value === 'manual' || value === 'pickup';

const isOrderService = (value: unknown): value is OrderService => {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const service = value as Partial<OrderService>;

  if (service.type === 'installation') {
    return typeof service.discount === 'number' && Number.isFinite(service.discount) && service.discount >= 0;
  }

  if (service.type === 'delivery') {
    return (
      isDeliveryMode(service.mode) &&
      typeof service.price === 'number' &&
      Number.isFinite(service.price) &&
      service.price >= 0
    );
  }

  return false;
};

const isValidDraftServices = (value: unknown): value is OrderService[] | undefined =>
  typeof value === 'undefined' || (Array.isArray(value) && value.every(isOrderService));

const normalizeDateValue = (value: string): string => {
  const trimmed = value.trim();

  if (!trimmed) {
    return '';
  }

  if (isoDatePattern.test(trimmed)) {
    return trimmed;
  }

  const match = trimmed.match(/^(\d{2})[./-](\d{2})[./-](\d{4})$/);

  if (!match) {
    return '';
  }

  const [, day, month, year] = match;
  const normalized = `${year}-${month}-${day}`;
  const parsed = new Date(`${normalized}T00:00:00`);

  return Number.isNaN(parsed.getTime()) ? '' : normalized;
};

const createEmptyOrderCustomerForm = (): OrderCustomerForm => ({
  fullName: '',
  phone: '',
  address: '',
  contractNumber: '',
  measurementDate: '',
  productionDate: '',
  installationDate: '',
  comment: '',
});

const createOrderCustomerFormFromOrder = (order?: OrderSummary): OrderCustomerForm => ({
  fullName: order?.customer ?? '',
  phone: '',
  address: '',
  contractNumber: order?.code ?? '',
  measurementDate: '',
  productionDate: '',
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
    isValidString(form.measurementDate) &&
    isValidString(form.productionDate) &&
    isValidString(form.installationDate) &&
    isValidString(form.comment)
  );
};

const isLegacyOrderCustomerForm = (value: unknown): value is LegacyOrderCustomerForm => {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const form = value as Partial<LegacyOrderCustomerForm>;

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

const normalizeOrderCustomerForm = (value: OrderCustomerForm | LegacyOrderCustomerForm): OrderCustomerForm => {
  if (isOrderCustomerForm(value)) {
    return {
      fullName: value.fullName,
      phone: value.phone,
      address: value.address,
      contractNumber: value.contractNumber,
      measurementDate: normalizeDateValue(value.measurementDate),
      productionDate: normalizeDateValue(value.productionDate),
      installationDate: normalizeDateValue(value.installationDate),
      comment: value.comment,
    };
  }

  return {
    fullName: value.fullName,
    phone: value.phone,
    address: value.address,
    contractNumber: value.contractNumber,
    measurementDate: '',
    productionDate: normalizeDateValue(value.readinessDate),
    installationDate: normalizeDateValue(value.installationDate),
    comment: value.comment,
  };
};

const cloneForm = (form: OrderCustomerForm | LegacyOrderCustomerForm): OrderCustomerForm => normalizeOrderCustomerForm(form);

const normalizeDraftPositions = (positions: CalculatorPosition[] | undefined): CalculatorPosition[] => {
  if (!Array.isArray(positions)) {
    return [];
  }

  return positions.filter(isCalculatorPosition).map(normalizeCalculatorPosition);
};

const clonePositions = (positions: CalculatorPosition[]): CalculatorPosition[] => normalizeDraftPositions(positions);

const openingTypeLabels: Record<string, string> = {
  single: 'Одностворчатое окно',
  single_turn: 'Одностворчатое окно (поворотное)',
  double: 'Двухстворчатое окно',
  double_left_active: 'Двухстворчатое окно (активная левая)',
  double_right_active: 'Двухстворчатое окно (активная правая)',
  double_dual_active: 'Двухстворчатое окно (две активные)',
  triple: 'Трехстворчатое окно',
  triple_dual_active: 'Трехстворчатое окно (две активные)',
  triple_full_active: 'Трехстворчатое окно (три активные)',
  balcony: 'Балконная дверь',
  balcony_left_door: 'Балконная дверь (створка слева)',
  balcony_right_door: 'Балконная дверь (створка справа)',
};

const formatPositionSummary = (position: CalculatorPosition, index: number): string => {
  const baseLabel =
    (position.openingType ? openingTypeLabels[position.openingType] : undefined) ?? `Позиция ${position.id ?? index + 1}`;
  const width = position.width ?? 0;
  const height = position.height ?? 0;

  if (width > 0 && height > 0) {
    return `${baseLabel} (${width} x ${height} мм)`;
  }

  return baseLabel;
};

const cloneServices = (services: OrderService[] | undefined): OrderService[] => {
  if (!Array.isArray(services)) {
    return [];
  }

  return services.filter(isOrderService).map((service) => {
    if (service.type === 'installation') {
      return {
        type: 'installation',
        discount: Math.max(0, Math.round(service.discount)),
      };
    }

    return {
      type: 'delivery',
      mode: service.mode,
      price: Math.max(0, Math.round(service.price)),
    };
  });
};

const isStorageAvailable = (): boolean => typeof window !== 'undefined' && Boolean(window.localStorage);

const isStoredOrderDraft = (value: unknown): value is StoredOrderDraft => {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const draft = value as Partial<StoredOrderDraft> & {
    form?: OrderCustomerForm | LegacyOrderCustomerForm;
  };

  return (
    isValidString(draft.id) &&
    Boolean(draft.form) &&
    (isOrderCustomerForm(draft.form) || isLegacyOrderCustomerForm(draft.form)) &&
    isValidDraftAmount(draft.amount) &&
    isValidDraftPositions(draft.positions) &&
    isValidDraftServices(draft.services) &&
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
      form: cloneForm(draft.form),
      amount: normalizeDraftAmount(draft.amount),
      positions: normalizeDraftPositions(draft.positions),
      services: cloneServices(draft.services),
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

const formatCalendarDate = (isoDate: string): string => {
  if (!isoDate) {
    return '';
  }

  const parsedDate = new Date(`${isoDate}T00:00:00`);

  if (Number.isNaN(parsedDate.getTime())) {
    return '';
  }

  return orderDateFormatter.format(parsedDate);
};

const addDays = (isoDate: string, days: number): string => {
  const parsedDate = new Date(`${isoDate}T00:00:00`);

  if (Number.isNaN(parsedDate.getTime())) {
    return '';
  }

  parsedDate.setDate(parsedDate.getDate() + days);

  const year = parsedDate.getFullYear();
  const month = `${parsedDate.getMonth() + 1}`.padStart(2, '0');
  const day = `${parsedDate.getDate()}`.padStart(2, '0');

  return `${year}-${month}-${day}`;
};

const formatDateRange = (startDate: string): string => {
  if (!startDate) {
    return '';
  }

  const endDate = addDays(startDate, 5);
  const formattedStartDate = formatCalendarDate(startDate);
  const formattedEndDate = formatCalendarDate(endDate);

  if (!formattedStartDate) {
    return '';
  }

  return formattedEndDate ? `${formattedStartDate} - ${formattedEndDate}` : formattedStartDate;
};

const resolveDraftDate = (dateValue: string, fallback: string): string => {
  const formattedDate = formatCalendarDate(dateValue.trim());

  if (formattedDate) {
    return formattedDate;
  }

  return fallback;
};

const resolveDraftItems = (draft: StoredOrderDraft, baseOrder?: OrderSummary): string[] => {
  const positions = normalizeDraftPositions(draft.positions);

  if (positions.length > 0) {
    return positions.map(formatPositionSummary);
  }

  if (baseOrder && baseOrder.items.length > 0) {
    return baseOrder.items;
  }

  const subtitle = baseOrder?.subtitle.trim();
  return subtitle ? [subtitle] : [];
};

const resolveDraftLeadTime = (draft: StoredOrderDraft, baseOrder?: OrderSummary): string => {
  const productionDate = draft.form.productionDate.trim();
  const installationDate = draft.form.installationDate.trim();
  const measurementDate = draft.form.measurementDate.trim();

  if (productionDate) {
    return formatCalendarDate(productionDate) || baseOrder?.leadTime || 'Дата изготовления уточняется';
  }

  if (installationDate) {
    return `монтаж ${formatDateRange(installationDate)}`;
  }

  if (measurementDate) {
    return `замер ${formatDateRange(measurementDate)}`;
  }

  return baseOrder?.leadTime ?? 'Срок уточняется';
};

const resolveDraftCode = (draft: StoredOrderDraft, baseOrder?: OrderSummary): string => {
  const contractNumber = draft.form.contractNumber.trim();

  if (contractNumber) {
    return contractNumber;
  }

  return baseOrder?.code ?? `SW-${extractOrderNumber(draft.id)}`;
};

const resolveDraftMargin = (draft: StoredOrderDraft, baseOrder?: OrderSummary): string => {
  if (draft.amount !== null && draft.amount > 0) {
    return DEFAULT_MARGIN;
  }

  return baseOrder?.margin ?? '—';
};

const mapDraftToSummary = (draft: StoredOrderDraft): OrderSummary => {
  const baseOrder = ordersMock.find((item) => item.id === draft.id);
  const customerName = draft.form.fullName.trim();

  return {
    id: draft.id,
    date: baseOrder?.date ?? formatDraftDate(draft.updatedAt),
    customer: customerName || baseOrder?.customer || 'Новый расчет',
    status: baseOrder?.status ?? 'new',
    amount: draft.amount ?? baseOrder?.amount ?? null,
    subtitle: baseOrder?.subtitle ?? 'Ожидание расчета',
    note: baseOrder?.note ?? 'Оценка',
    leadTime: resolveDraftLeadTime(draft, baseOrder),
    code: resolveDraftCode(draft, baseOrder),
    margin: resolveDraftMargin(draft, baseOrder),
    measurementDate: resolveDraftDate(draft.form.measurementDate, baseOrder?.measurementDate ?? ''),
    productionDate: resolveDraftDate(draft.form.productionDate, baseOrder?.productionDate ?? ''),
    installationDate: resolveDraftDate(draft.form.installationDate, baseOrder?.installationDate ?? ''),
    items: resolveDraftItems(draft, baseOrder),
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

  if (draft) {
    return cloneForm(draft.form);
  }

  const baseOrder = ordersMock.find((item) => item.id === orderId);
  return baseOrder ? createOrderCustomerFormFromOrder(baseOrder) : null;
};

const getOrderPositions = (orderId: string): CalculatorPosition[] | null => {
  const draft = readOrderDrafts().find((item) => item.id === orderId);

  if (!draft) {
    return null;
  }

  return clonePositions(draft.positions ?? []);
};

const getOrderServices = (orderId: string): OrderService[] | null => {
  const draft = readOrderDrafts().find((item) => item.id === orderId);

  if (!draft) {
    return null;
  }

  return cloneServices(draft.services ?? []);
};

const saveOrder = (
  orderId: string,
  form: OrderCustomerForm,
  amount?: number | null,
  positions?: CalculatorPosition[],
  services?: OrderService[],
): void => {
  const drafts = readOrderDrafts();
  const now = new Date().toISOString();
  const normalizedForm = cloneForm(form);
  const normalizedAmount = normalizeDraftAmount(amount);
  const normalizedPositions = clonePositions(positions ?? []);
  const normalizedServices = cloneServices(services ?? []);
  const draftIndex = drafts.findIndex((item) => item.id === orderId);

  if (draftIndex === -1) {
    drafts.unshift({
      id: orderId,
      form: normalizedForm,
      amount: normalizedAmount,
      positions: normalizedPositions,
      services: normalizedServices,
      createdAt: now,
      updatedAt: now,
    });
  } else {
    drafts[draftIndex] = {
      ...drafts[draftIndex],
      form: normalizedForm,
      amount: typeof amount === 'undefined' ? drafts[draftIndex].amount : normalizedAmount,
      positions: typeof positions === 'undefined' ? drafts[draftIndex].positions ?? [] : normalizedPositions,
      services: typeof services === 'undefined' ? drafts[draftIndex].services ?? [] : normalizedServices,
      updatedAt: now,
    };
  }

  writeOrderDrafts(drafts);
};

const createOrder = (
  form: OrderCustomerForm,
  amount?: number | null,
  positions?: CalculatorPosition[],
  services?: OrderService[],
): string => {
  const drafts = readOrderDrafts();
  const orderId = getNextOrderId(drafts);
  const now = new Date().toISOString();

  drafts.unshift({
    id: orderId,
    form: cloneForm(form),
    amount: normalizeDraftAmount(amount),
    positions: clonePositions(positions ?? []),
    services: cloneServices(services ?? []),
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
  getOrderServices,
  getOrders,
  saveOrder,
};
