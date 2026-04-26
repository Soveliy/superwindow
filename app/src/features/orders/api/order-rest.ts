import {
  normalizeCalculatorPosition,
  type CalculatorPosition,
  type DrainageType,
  type HandleColor,
  type HandleType,
  type MullionOrientation,
  type OpeningType,
  type PackageType,
  type SealColor,
  type SillColor,
  type WindowColor,
  type WindowColorSide,
} from '@/features/calculator/model/positions.storage';
import { type OrderStatus, type OrderService, type OrderSummary } from '@/features/orders/model/orders.mock';
import { type OrderCustomerForm } from '@/features/orders/model/orders.storage';
import { LOCAL_AJAX_PATHS, postLocalAjaxJson } from '@/shared/api/local-ajax';

interface SaveRemoteOrderParams {
  orderId?: string | null;
  payload: unknown;
}

interface DeleteBasketItemParams {
  orderId?: string | null;
  orderCode?: string | null;
  positionId?: number | null;
  serviceType?: OrderService['type'] | null;
}

export interface RemoteOrderSnapshot {
  orderId: string;
  userId: string | null;
  code: string;
  amount: number | null;
  status: OrderStatus;
  form: OrderCustomerForm;
  positions: CalculatorPosition[];
  services: OrderService[];
  raw: unknown;
}

export interface RemoteOrderListItem extends OrderSummary {
  routeId: string;
  displayId: string;
  raw: unknown;
}

type UnknownRecord = Record<string, unknown>;

const isoDatePattern = /^\d{4}-\d{2}-\d{2}$/;
const packageTypes = new Set<PackageType>(['budget', 'standard', 'premium']);
const openingTypes = new Set<OpeningType>([
  'single',
  'single_turn',
  'double',
  'double_left_active',
  'double_right_active',
  'double_dual_active',
  'triple',
  'triple_dual_active',
  'triple_full_active',
  'balcony',
  'balcony_left_door',
  'balcony_right_door',
]);
const sealColors = new Set<SealColor>(['black', 'gray', 'white']);
const drainageTypes = new Set<DrainageType>(['bottom', 'none', 'street']);
const windowColorSides = new Set<WindowColorSide>(['outside', 'inside', 'solid']);
const windowColors = new Set<WindowColor>(['white', 'anthracite', 'golden_oak', 'dark_oak', 'mahogany', 'silver']);
const handleTypes = new Set<HandleType>(['standard', 'premium', 'design']);
const handleColors = new Set<HandleColor>(['white', 'brown', 'silver', 'gold']);
const mullionOrientations = new Set<MullionOrientation>(['vertical', 'horizontal']);
const sillColors = new Set<SillColor>(['white', 'brown', 'anthracite']);

const isRecord = (value: unknown): value is UnknownRecord =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const normalizeString = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }

  const normalizedValue = value.trim();
  return normalizedValue ? normalizedValue : null;
};

const getPhoneDigits = (value: string): string => value.replace(/\D/g, '');

const buildUserLogin = (form: OrderCustomerForm): string => {
  const phoneDigits = getPhoneDigits(form.phone);

  if (phoneDigits.length >= 3) {
    return `user_${phoneDigits}`;
  }

  return 'user_superwindow';
};

const buildUserEmail = (form: OrderCustomerForm, login: string): string => {
  const phoneDigits = getPhoneDigits(form.phone);
  const emailLocalPart = phoneDigits.length >= 3 ? `user_${phoneDigits}` : login;
  return `${emailLocalPart}@superwindow.local`;
};

const normalizeNumber = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const normalizedValue = value.replace(/\s+/g, '').replace(',', '.');

    if (!normalizedValue) {
      return null;
    }

    const parsed = Number.parseFloat(normalizedValue);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
};

const toIsoDate = (date: Date): string => {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');

  return `${year}-${month}-${day}`;
};

const normalizeDateValue = (value: unknown): string => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return toIsoDate(new Date(value));
  }

  if (typeof value !== 'string') {
    return '';
  }

  const normalizedValue = value.trim();

  if (!normalizedValue) {
    return '';
  }

  if (isoDatePattern.test(normalizedValue)) {
    return normalizedValue;
  }

  const dottedMatch = normalizedValue.match(/^(\d{2})[./-](\d{2})[./-](\d{4})$/);

  if (dottedMatch) {
    const [, day, month, year] = dottedMatch;
    return `${year}-${month}-${day}`;
  }

  const parsedDate = new Date(normalizedValue);
  return Number.isNaN(parsedDate.getTime()) ? '' : toIsoDate(parsedDate);
};

const findFirstByKeys = (source: unknown, keys: readonly string[]): unknown => {
  const keySet = new Set(keys);
  const queue: unknown[] = [source];
  const visited = new Set<unknown>();

  while (queue.length > 0) {
    const current = queue.shift();

    if (!current || visited.has(current)) {
      continue;
    }

    visited.add(current);

    if (isRecord(current)) {
      for (const [key, value] of Object.entries(current)) {
        if (keySet.has(key)) {
          return value;
        }
      }

      queue.push(...Object.values(current));
      continue;
    }

    if (Array.isArray(current)) {
      queue.push(...current);
    }
  }

  return undefined;
};

const getString = (source: unknown, keys: readonly string[]): string | null => normalizeString(findFirstByKeys(source, keys));
const getNumber = (source: unknown, keys: readonly string[]): number | null => normalizeNumber(findFirstByKeys(source, keys));

const getArray = (source: unknown, keys: readonly string[]): unknown[] => {
  const value = findFirstByKeys(source, keys);
  return Array.isArray(value) ? value : [];
};

const getEnumValue = <T extends string>(source: unknown, keys: readonly string[], values: Set<T>): T | undefined => {
  const value = getString(source, keys);
  return value && values.has(value as T) ? (value as T) : undefined;
};

const normalizeOrderStatus = (value: unknown): OrderStatus => {
  const normalizedValue = normalizeString(value);

  if (normalizedValue === 'ready' || normalizedValue === 'paid' || normalizedValue === 'new' || normalizedValue === 'in_progress') {
    return normalizedValue;
  }

  if (normalizedValue === 'OP') {
    return 'paid';
  }

  return 'new';
};

const extractRequiredId = (source: unknown, keys: readonly string[], entityLabel: string): string => {
  const directStringId = normalizeString(source);

  if (directStringId) {
    return directStringId;
  }

  const directNumberId = normalizeNumber(source);

  if (directNumberId !== null) {
    return String(Math.trunc(directNumberId));
  }

  const expandedKeys = [...keys, 'ID', 'Id', 'USER_ID', 'CLIENT_ID'];
  const idFromKeys = getString(source, expandedKeys);

  if (idFromKeys) {
    return idFromKeys;
  }

  const numericIdFromKeys = getNumber(source, expandedKeys);

  if (numericIdFromKeys !== null) {
    return String(Math.trunc(numericIdFromKeys));
  }

  const wrappedSources = ['result', 'data', 'user', 'client', 'payload']
    .map((key) => findFirstByKeys(source, [key]))
    .filter((value): value is NonNullable<typeof value> => value !== undefined && value !== null);

  for (const wrappedSource of wrappedSources) {
    const wrappedStringId = normalizeString(wrappedSource);

    if (wrappedStringId) {
      return wrappedStringId;
    }

    const wrappedNumericId = normalizeNumber(wrappedSource);

    if (wrappedNumericId !== null) {
      return String(Math.trunc(wrappedNumericId));
    }

    const wrappedId =
      getString(wrappedSource, expandedKeys) ??
      (() => {
        const numericWrappedId = getNumber(wrappedSource, expandedKeys);
        return numericWrappedId !== null ? String(Math.trunc(numericWrappedId)) : null;
      })();

    if (wrappedId) {
      return wrappedId;
    }
  }

  console.warn(`[${entityLabel}] id is missing in response`, source);
  throw new Error(`${entityLabel} id is missing in response`);
};

const parseJsonString = (value: unknown): unknown => {
  if (typeof value !== 'string') {
    return null;
  }

  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
};

const getItemProps = (source: unknown): UnknownRecord | null => {
  const props = findFirstByKeys(source, ['props']);
  return isRecord(props) ? props : null;
};

const getOrderProps = (source: unknown): UnknownRecord | null => {
  const props = findFirstByKeys(source, ['order_props', 'props']);
  return isRecord(props) ? props : null;
};

const parseDimensions = (value: unknown): { width?: number; height?: number } => {
  if (typeof value !== 'string') {
    return {};
  }

  const match = value.match(/(\d+(?:[.,]\d+)?)\s*x\s*(\d+(?:[.,]\d+)?)/i);

  if (!match) {
    return {};
  }

  const width = normalizeNumber(match[1]);
  const height = normalizeNumber(match[2]);

  return {
    width: width ?? undefined,
    height: height ?? undefined,
  };
};

const parseMullionOffsetsFromProps = (props: UnknownRecord | null): Record<string, number> | undefined => {
  if (!props) {
    return undefined;
  }

  const offsets = Object.entries(props).reduce<Record<string, number>>((acc, [key, value]) => {
    const match = key.match(/^mullionOffset_(\d+)$/);

    if (!match || typeof value !== 'string') {
      return acc;
    }

    const leftPartMatch = value.match(/:\s*(\d+(?:[.,]\d+)?)\s*мм/i);
    const leftPart = leftPartMatch ? normalizeNumber(leftPartMatch[1]) : null;

    if (leftPart !== null) {
      acc[match[1]] = Math.max(0, Math.trunc(leftPart));
    }

    return acc;
  }, {});

  return Object.keys(offsets).length > 0 ? offsets : undefined;
};

const parsePackageType = (source: unknown): PackageType | undefined => {
  const explicitType = getEnumValue(source, ['packageType', 'package_type'], packageTypes);

  if (explicitType) {
    return explicitType;
  }

  const packageLabel = getString(source, ['packageLabel', 'package_label']);

  if (packageLabel === 'Бюджет') {
    return 'budget';
  }
  if (packageLabel === 'Стандарт') {
    return 'standard';
  }
  if (packageLabel === 'Премиум') {
    return 'premium';
  }

  const itemName = getString(source, ['name']) ?? '';

  if (itemName.includes('Премиум')) {
    return 'premium';
  }
  if (itemName.includes('Стандарт')) {
    return 'standard';
  }
  if (itemName.includes('Бюджет')) {
    return 'budget';
  }

  return undefined;
};

const normalizeAdditionalOptions = (source: unknown): CalculatorPosition['additionalOptions'] => {
  const items = getArray(source, ['additionalOptions', 'additional_options', 'options']);
  const itemProps = getItemProps(source);
  const propBasedItems =
    itemProps === null
      ? []
      : Object.entries(itemProps)
          .filter(([key]) => /^additionalOption_\d+ \(code\)$/.test(key))
          .map(([, value]) => parseJsonString(value))
          .filter((value): value is unknown => value !== null);
  const normalizedSourceItems = items.length > 0 ? items : propBasedItems;

  if (normalizedSourceItems.length === 0) {
    return undefined;
  }

  const normalizedItems = normalizedSourceItems
    .map((item, index) => {
      if (!isRecord(item)) {
        return null;
      }

      const type = getString(item, ['type', 'optionType', 'option_type']);

      if (type !== 'sill' && type !== 'drip') {
        return null;
      }

      const normalizedType: 'sill' | 'drip' = type;

      const nextItem = {
        id: Math.max(1, Math.trunc(getNumber(item, ['id', 'optionId', 'option_id']) ?? index + 1)),
        type: normalizedType,
        length: getNumber(item, ['length', 'lengthMm', 'length_mm']) ?? undefined,
        width: getNumber(item, ['width', 'widthMm', 'width_mm']) ?? undefined,
        sillColor: getEnumValue(item, ['sillColor', 'sill_color', 'color'], sillColors),
      };

      return nextItem;
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);

  return normalizedItems.length > 0 ? normalizedItems : undefined;
};

const normalizePosition = (source: unknown, index: number): CalculatorPosition | null => {
  if (!isRecord(source)) {
    return null;
  }

  const type = getString(source, ['serviceType', 'service_type', 'type']);

  if (type === 'installation' || type === 'delivery' || type === 'service') {
    return null;
  }

  const itemProps = getItemProps(source);
  const dimensions = parseDimensions(itemProps?.dimensions);

  const rawPosition: CalculatorPosition = {
    id: Math.max(1, Math.trunc(getNumber(source, ['positionId', 'position_id', 'id', 'basketId', 'basket_id']) ?? index + 1)),
    width: getNumber(source, ['widthMm', 'width_mm', 'width']) ?? dimensions.width,
    height: getNumber(source, ['heightMm', 'height_mm', 'height']) ?? dimensions.height,
    price: getNumber(source, ['price', 'totalPrice', 'total_price', 'amount']) ?? undefined,
    openingType: getEnumValue(source, ['openingType', 'opening_type'], openingTypes),
    profileId: getString(source, ['profileId', 'profile_id']) ?? undefined,
    packageType: parsePackageType(source),
    sealColor: getEnumValue(source, ['sealColor', 'seal_color'], sealColors),
    drainage: getEnumValue(source, ['drainage', 'drainageType', 'drainage_type'], drainageTypes),
    windowColorSide: getEnumValue(source, ['windowColorSide', 'window_color_side'], windowColorSides),
    windowColor: getEnumValue(source, ['windowColor', 'window_color'], windowColors),
    handleType: getEnumValue(source, ['handleType', 'handle_type'], handleTypes),
    handleColor: getEnumValue(source, ['handleColor', 'handle_color'], handleColors),
    mullionOrientation: getEnumValue(source, ['mullionOrientation', 'mullion_orientation'], mullionOrientations),
    additionalOptions: normalizeAdditionalOptions(source),
  };

  const mullionOffsetsValue = findFirstByKeys(source, ['mullionOffsets', 'mullion_offsets']);

  if (isRecord(mullionOffsetsValue)) {
    rawPosition.mullionOffsets = Object.entries(mullionOffsetsValue).reduce<Record<string, number>>((acc, [key, value]) => {
      const normalizedValue = normalizeNumber(value);

      if (normalizedValue !== null && /^\d+$/.test(key)) {
        acc[key] = Math.max(0, Math.trunc(normalizedValue));
      }

      return acc;
    }, {});
  }

  if (!rawPosition.mullionOffsets) {
    rawPosition.mullionOffsets = parseMullionOffsetsFromProps(itemProps);
  }

  return normalizeCalculatorPosition(rawPosition);
};

const normalizeService = (source: unknown): OrderService | null => {
  if (!isRecord(source)) {
    return null;
  }

  const rawService = parseJsonString(findFirstByKeys(source, ['rawService', 'raw_service']));

  if (isRecord(rawService)) {
    const rawServiceType = getString(rawService, ['type']);

    if (rawServiceType === 'installation') {
      return {
        type: 'installation',
        discount: Math.max(0, Math.round(getNumber(rawService, ['discount']) ?? 0)),
      };
    }

    if (rawServiceType === 'delivery') {
      const rawDeliveryMode = getString(rawService, ['mode', 'deliveryMode', 'delivery_mode']);
      return {
        type: 'delivery',
        mode: rawDeliveryMode === 'pickup' ? 'pickup' : 'manual',
        price: Math.max(0, Math.round(getNumber(rawService, ['price', 'finalPrice', 'final_price']) ?? 0)),
      };
    }
  }

  const serviceType = getString(source, ['serviceType', 'service_type', 'type']);

  if (serviceType === 'installation' || getNumber(source, ['discount']) !== null) {
    return {
      type: 'installation',
      discount: Math.max(0, Math.round(getNumber(source, ['discount']) ?? 0)),
    };
  }

  const deliveryMode = getString(source, ['deliveryMode', 'delivery_mode', 'mode']);

  if (serviceType === 'delivery' || deliveryMode === 'manual' || deliveryMode === 'pickup') {
    return {
      type: 'delivery',
      mode: deliveryMode === 'pickup' ? 'pickup' : 'manual',
      price: Math.max(0, Math.round(getNumber(source, ['price', 'finalPrice', 'final_price', 'amount']) ?? 0)),
    };
  }

  return null;
};

const buildOrderForm = (source: unknown, fallbackCode: string): OrderCustomerForm => {
  const orderProps = getOrderProps(source);

  return {
    fullName: getString(orderProps, ['FIO', 'fullName', 'full_name', 'customerName', 'customer_name', 'fio']) ?? '',
    phone: getString(orderProps, ['PHONE', 'phone', 'phoneNumber', 'phone_number']) ?? '',
    address: getString(orderProps, ['ADDRESS', 'address', 'deliveryAddress', 'delivery_address']) ?? '',
    contractNumber:
      getString(orderProps, ['ORDER_CODE', 'contractNumber', 'contract_number', 'code', 'orderCode', 'order_code']) ?? fallbackCode,
    measurementDate: normalizeDateValue(findFirstByKeys(orderProps, ['MEASUREMENT_DATE', 'measurementDate', 'measurement_date'])),
    productionDate: normalizeDateValue(
      findFirstByKeys(orderProps, ['PRODUCTION_DATE', 'productionDate', 'production_date', 'readinessDate', 'readiness_date']),
    ),
    installationDate: normalizeDateValue(findFirstByKeys(orderProps, ['INSTALLATION_DATE', 'installationDate', 'installation_date'])),
    comment: getString(source, ['comment', 'note', 'notes']) ?? '',
  };
};

const resolveSummaryStatusMeta = (status: OrderStatus): Pick<OrderSummary, 'subtitle' | 'note'> => {
  if (status === 'paid') {
    return {
      subtitle: 'Оплата получена',
      note: 'Оплачен',
    };
  }

  if (status === 'in_progress') {
    return {
      subtitle: 'Заказ в работе',
      note: 'В производстве',
    };
  }

  if (status === 'ready') {
    return {
      subtitle: 'Готов к монтажу',
      note: 'Монтаж',
    };
  }

  return {
    subtitle: 'Ожидание расчета',
    note: 'Оценка',
  };
};

const buildOrderSummary = (source: unknown): RemoteOrderListItem | null => {
  if (!isRecord(source)) {
    return null;
  }

  const orderProps = getOrderProps(source);
  const status = normalizeOrderStatus(findFirstByKeys(source, ['status']));
  const statusMeta = resolveSummaryStatusMeta(status);
  const routeId = String(getNumber(source, ['id']) ?? getString(source, ['id']) ?? '');
  const displayId = getString(orderProps, ['ORDER_ID', 'orderId', 'order_id']) ?? routeId;
  const code = getString(orderProps, ['ORDER_CODE', 'orderCode', 'order_code', 'code']);

  if (!routeId) {
    return null;
  }

  return {
    routeId,
    displayId: displayId ?? routeId,
    id: routeId,
    date: getString(source, ['date']) ?? '',
    customer: getString(orderProps, ['FIO', 'fullName', 'full_name', 'customerName', 'customer_name']) ?? 'Новый расчет',
    status,
    amount: getNumber(source, ['price', 'amount', 'total']),
    subtitle: statusMeta.subtitle,
    note: statusMeta.note,
    leadTime: '',
    code: code ?? '—',
    margin: '—',
    measurementDate: normalizeDateValue(findFirstByKeys(orderProps, ['MEASUREMENT_DATE', 'measurementDate', 'measurement_date'])),
    productionDate: normalizeDateValue(findFirstByKeys(orderProps, ['PRODUCTION_DATE', 'productionDate', 'production_date'])),
    installationDate: normalizeDateValue(findFirstByKeys(orderProps, ['INSTALLATION_DATE', 'installationDate', 'installation_date'])),
    items: [],
    raw: source,
  };
};

const buildPositions = (source: unknown): CalculatorPosition[] => {
  const productEntries = getArray(source, ['positions', 'products', 'productItems', 'product_items', 'basket', 'items']);

  return productEntries
    .map((item, index) => normalizePosition(item, index))
    .filter((item): item is CalculatorPosition => item !== null);
};

const buildServices = (source: unknown): OrderService[] => {
  const explicitServices = getArray(source, ['services']);
  const fallbackEntries = explicitServices.length > 0 ? explicitServices : getArray(source, ['basket', 'items']);

  return fallbackEntries
    .map((item) => normalizeService(item))
    .filter((item): item is OrderService => item !== null);
};

export const registerOrGetUser = async (form: OrderCustomerForm): Promise<string> => {
  const login = buildUserLogin(form);
  const email = buildUserEmail(form, login);
  const response = await postLocalAjaxJson({
    label: 'user_register_or_get',
    path: LOCAL_AJAX_PATHS.registerOrGetUser,
    payload: {
      source: 'order-details',
      action: 'user_register_or_get',
      login,
      email,
      fio: form.fullName.trim(),
      phone: form.phone.trim(),
      address: form.address.trim(),
      user: {
        fullName: form.fullName.trim(),
        fio: form.fullName.trim(),
        phone: form.phone.trim(),
        address: form.address.trim(),
        comment: form.comment.trim(),
        login,
        email,
      },
    },
  });

  console.log('[user_register_or_get] raw response', response);
  return extractRequiredId(response, ['userId', 'user_id', 'clientId', 'client_id', 'id'], 'user');
};

export const saveRemoteOrder = async ({ orderId, payload }: SaveRemoteOrderParams): Promise<{ orderId: string; response: unknown }> => {
  const isExistingOrder = Boolean(orderId);
  const label = isExistingOrder ? 'order_refresh' : 'order_create';
  const path = isExistingOrder
    ? `${LOCAL_AJAX_PATHS.refreshOrder}&order_id=${encodeURIComponent(String(orderId))}`
    : LOCAL_AJAX_PATHS.addOrder;
  const response = await postLocalAjaxJson({ label, path, payload });

  return {
    orderId: getString(response, ['orderId', 'order_id', 'id']) ?? orderId ?? extractRequiredId(response, ['orderId', 'order_id', 'id'], 'order'),
    response,
  };
};

export const getRemoteOrder = async (orderId: string): Promise<RemoteOrderSnapshot> => {
  const response = await postLocalAjaxJson({
    label: 'order_get',
    path: `${LOCAL_AJAX_PATHS.getOrder}&order_id=${encodeURIComponent(orderId)}`,
    method: 'GET',
    payload: null,
  });

  const resolvedOrderId = getString(response, ['orderId', 'order_id', 'id']) ?? orderId;
  const code = getString(response, ['code', 'orderCode', 'order_code', 'ORDER_CODE']) ?? resolvedOrderId;

  return {
    orderId: resolvedOrderId,
    userId: getString(response, ['userId', 'user_id', 'clientId', 'client_id']),
    code,
    amount: getNumber(response, ['amount', 'total', 'orderTotal', 'order_total', 'price']),
    status: normalizeOrderStatus(findFirstByKeys(response, ['status', 'orderStatus', 'order_status'])),
    form: buildOrderForm(response, code),
    positions: buildPositions(response),
    services: buildServices(response),
    raw: response,
  };
};

export const getRemoteOrders = async (): Promise<RemoteOrderListItem[]> => {
  const response = await postLocalAjaxJson({
    label: 'orders',
    path: LOCAL_AJAX_PATHS.getOrders,
    method: 'GET',
    payload: null,
  });

  console.log('[orders] raw response', response);

  const items = getArray(response, ['items']);
  const normalizedItems = items
    .map((item) => buildOrderSummary(item))
    .filter((item): item is RemoteOrderListItem => item !== null);

  console.log('[orders] normalized items', normalizedItems);

  return normalizedItems;
};

export const deleteBasketItem = async ({
  orderId,
  orderCode,
  positionId,
  serviceType,
}: DeleteBasketItemParams): Promise<void> => {
  await postLocalAjaxJson({
    label: 'basket_del',
    path: LOCAL_AJAX_PATHS.deleteBasketItem,
    payload: {
      source: 'order-details',
      action: 'basket_del',
      order_id: orderId ?? null,
      orderId: orderId ?? null,
      order_code: orderCode ?? null,
      orderCode: orderCode ?? null,
      position_id: positionId ?? null,
      positionId: positionId ?? null,
      service_type: serviceType ?? null,
      serviceType: serviceType ?? null,
    },
  });
};
