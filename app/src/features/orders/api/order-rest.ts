import {
  isCalculatorPosition,
  normalizeCalculatorProductionQuery,
  normalizeCalculatorPosition,
  type CalculatorPosition,
  type CalculatorSashConfig,
  type DripColor,
  type DrainageType,
  type HandleColor,
  type HandleType,
  type MullionOrientation,
  type OpeningType,
  type PackageType,
  type SealColor,
  type SashId,
  type SillType,
  type SillColor,
  type WindowColor,
  type WindowColorSide,
} from '@/features/calculator/model/positions.storage';
import { type OrderStatus, type OrderService, type OrderSummary } from '@/features/orders/model/orders.mock';
import { type OrderCustomerForm } from '@/features/orders/model/orders.storage';
import { type OrderPaymentPayload } from '@/features/payment/model/payment-options';
import { authStorage } from '@/features/auth/model/auth-storage';
import { LOCAL_AJAX_PATHS, LocalAjaxError, postLocalAjaxJson } from '@/shared/api/local-ajax';

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

export interface RemoteInvoiceResponse {
  status: string | null;
  invoiceNo: number | null;
  orderCode: string | null;
  amount: number | null;
  customerId: string | null;
  raw: unknown;
}

export interface RemoteInvoicePdfResponse {
  invoiceNo: number;
  pdfUrl: string | null;
  fileName: string;
  contentType: string | null;
  raw: unknown;
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
const handleColors = new Set<HandleColor>(['white', 'anthracite', 'brown', 'light_brown', 'black']);
const mullionOrientations = new Set<MullionOrientation>(['vertical', 'horizontal']);
const sillTypes = new Set<SillType>(['fineber', 'komfort']);
const sillColors = new Set<SillColor>(['white', 'brown', 'anthracite']);
const dripColors = new Set<DripColor>(['white', 'brown', 'gray']);
const sashIds = new Set<SashId>(['single', 'left', 'center', 'right']);

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

const normalizeBoolean = (value: unknown): boolean | null => {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return value > 0;
  }

  if (typeof value === 'string') {
    const normalizedValue = value.trim().toLowerCase();

    if (['1', 'true', 'yes', 'y'].includes(normalizedValue)) {
      return true;
    }

    if (['0', 'false', 'no', 'n'].includes(normalizedValue)) {
      return false;
    }
  }

  return null;
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

const decodeArrayBufferText = (value: ArrayBuffer): string => {
  try {
    return new TextDecoder('utf-8').decode(value);
  } catch {
    return '';
  }
};

const isPdfArrayBuffer = (value: ArrayBuffer): boolean => {
  const bytes = new Uint8Array(value.slice(0, 4));
  return bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46;
};

const normalizePdfUrl = (value: unknown): string | null => {
  const directValue = normalizeString(value);

  if (directValue) {
    const compactValue = directValue.replace(/\s+/g, '');

    if (/^(https?:|blob:|data:application\/pdf)/i.test(directValue)) {
      return directValue;
    }

    if (/^JVBER/i.test(compactValue)) {
      return `data:application/pdf;base64,${compactValue}`;
    }
  }

  if (!isRecord(value) && !Array.isArray(value)) {
    return null;
  }

  const linkedValue = getString(value, [
    'pdf_url',
    'pdfUrl',
    'download_url',
    'downloadUrl',
    'file_url',
    'fileUrl',
    'url',
    'href',
    'link',
  ]);
  const linkedPdfUrl = normalizePdfUrl(linkedValue);

  if (linkedPdfUrl) {
    return linkedPdfUrl;
  }

  const base64Value = getString(value, ['pdf_base64', 'pdfBase64', 'base64', 'pdf', 'file', 'content', 'data']);
  return normalizePdfUrl(base64Value);
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
        sillType: getEnumValue(item, ['sillType', 'sill_type'], sillTypes),
        sillColor: normalizedType === 'sill' ? getEnumValue(item, ['sillColor', 'sill_color', 'color'], sillColors) : undefined,
        dripColor: normalizedType === 'drip' ? getEnumValue(item, ['dripColor', 'drip_color', 'color'], dripColors) : undefined,
      };

      return nextItem;
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);

  return normalizedItems.length > 0 ? normalizedItems : undefined;
};

const normalizeSashId = (value: unknown): SashId | null => {
  const normalizedValue = normalizeString(value);
  return normalizedValue && sashIds.has(normalizedValue as SashId) ? (normalizedValue as SashId) : null;
};

const normalizeSashItems = (items: unknown[]): CalculatorSashConfig[] | undefined => {
  const normalizedItems = items
    .map((item): CalculatorSashConfig | null => {
      if (isRecord(item)) {
        const id = normalizeSashId(findFirstByKeys(item, ['id', 'sashId', 'sash_id']));

        if (!id) {
          return null;
        }

        const mosquitoScreenEnabled =
          normalizeBoolean(
            findFirstByKeys(item, ['mosquitoScreenEnabled', 'mosquito_screen_enabled', 'hasMosquitoScreen', 'enabled', 'active']),
          ) ?? false;

        return {
          id,
          mosquitoScreenEnabled,
        };
      }

      const id = normalizeSashId(item);

      if (!id) {
        return null;
      }

      return {
        id,
        mosquitoScreenEnabled: true,
      };
    })
    .filter((item): item is CalculatorSashConfig => item !== null);

  return normalizedItems.length > 0 ? normalizedItems : undefined;
};

const normalizeSashes = (source: unknown): CalculatorPosition['sashes'] => {
  const explicitValue = findFirstByKeys(source, ['sashes', 'sashConfigs', 'sash_configs']);
  const parsedExplicitValue = parseJsonString(explicitValue);
  const explicitItems = Array.isArray(explicitValue)
    ? explicitValue
    : Array.isArray(parsedExplicitValue)
      ? parsedExplicitValue
      : getArray(parsedExplicitValue, ['sashes', 'items']);
  const explicitSashes = normalizeSashItems(explicitItems);

  if (explicitSashes) {
    return explicitSashes;
  }

  const screensValue = findFirstByKeys(source, ['mosquitoScreens', 'mosquito_screens']);
  const parsedScreensValue = parseJsonString(screensValue);
  const screenItems = Array.isArray(screensValue)
    ? screensValue
    : Array.isArray(parsedScreensValue)
      ? parsedScreensValue
      : getArray(parsedScreensValue, ['mosquitoScreens', 'mosquito_screens', 'items']);

  return normalizeSashItems(screenItems);
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
  const persistedPositionSource = findFirstByKeys(source, ['rawPosition', 'raw_position']);
  const parsedPersistedPosition = parseJsonString(persistedPositionSource);
  const persistedPosition = isCalculatorPosition(parsedPersistedPosition)
    ? normalizeCalculatorPosition(parsedPersistedPosition)
    : null;
  const additionalOptions = normalizeAdditionalOptions(source);
  const sashes = normalizeSashes(source);
  const resolvedPositionId =
    getNumber(itemProps, ['positionId', 'position_id']) ??
    persistedPosition?.id ??
    getNumber(source, ['positionId', 'position_id']) ??
    (itemProps ? null : getNumber(source, ['id'])) ??
    index + 1;

  const rawPosition: CalculatorPosition = {
    ...persistedPosition,
    id: Math.max(1, Math.trunc(resolvedPositionId)),
    width: getNumber(source, ['widthMm', 'width_mm', 'width']) ?? dimensions.width ?? persistedPosition?.width,
    height: getNumber(source, ['heightMm', 'height_mm', 'height']) ?? dimensions.height ?? persistedPosition?.height,
    price: getNumber(source, ['price', 'totalPrice', 'total_price', 'amount']) ?? persistedPosition?.price,
    serverPrice: getNumber(source, ['serverPrice', 'server_price']) ?? persistedPosition?.serverPrice,
    customerPrice: getNumber(source, ['customerPrice', 'customer_price']) ?? persistedPosition?.customerPrice,
    dealerDiscountPercent:
      getNumber(source, ['dealerDiscountPercent', 'dealer_discount_percent']) ?? persistedPosition?.dealerDiscountPercent,
    dealerProfitAmount: getNumber(source, ['dealerProfitAmount', 'dealer_profit_amount']) ?? persistedPosition?.dealerProfitAmount,
    dealerProfitCode: getString(source, ['dealerProfitCode', 'dealer_profit_code']) ?? persistedPosition?.dealerProfitCode,
    openingType: getEnumValue(source, ['openingType', 'opening_type'], openingTypes) ?? persistedPosition?.openingType,
    profileId: getString(source, ['profileId', 'profile_id']) ?? persistedPosition?.profileId,
    packageType: parsePackageType(source) ?? persistedPosition?.packageType,
    sealColor: getEnumValue(source, ['sealColor', 'seal_color'], sealColors) ?? persistedPosition?.sealColor,
    drainage: getEnumValue(source, ['drainage', 'drainageType', 'drainage_type'], drainageTypes) ?? persistedPosition?.drainage,
    windowColorSide:
      getEnumValue(source, ['windowColorSide', 'window_color_side'], windowColorSides) ?? persistedPosition?.windowColorSide,
    windowColor: getEnumValue(source, ['windowColor', 'window_color'], windowColors) ?? persistedPosition?.windowColor,
    handleType: getEnumValue(source, ['handleType', 'handle_type'], handleTypes) ?? persistedPosition?.handleType,
    handleColor: getEnumValue(source, ['handleColor', 'handle_color'], handleColors) ?? persistedPosition?.handleColor,
    mullionOrientation:
      getEnumValue(source, ['mullionOrientation', 'mullion_orientation'], mullionOrientations) ??
      persistedPosition?.mullionOrientation,
    additionalOptions:
      (additionalOptions?.length ?? 0) > 0 ? additionalOptions : persistedPosition?.additionalOptions,
    sashes: (sashes?.length ?? 0) > 0 ? sashes : persistedPosition?.sashes,
  };
  const productionQuerySource = findFirstByKeys(source, ['productionQuery', 'production_query', 'query']);
  const productionQuery =
    normalizeCalculatorProductionQuery(productionQuerySource) ??
    normalizeCalculatorProductionQuery(parseJsonString(productionQuerySource));

  if (productionQuery) {
    rawPosition.productionQuery = productionQuery;

    if (typeof rawPosition.dealerDiscountPercent === 'undefined') {
      const productionDiscount = normalizeNumber(productionQuery.discount);

      if (productionDiscount !== null) {
        rawPosition.dealerDiscountPercent = Math.max(0, productionDiscount);
      }
    }
  }

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

const formatOrderItemPrice = (value: number, currency: string | null): string => {
  try {
    return new Intl.NumberFormat('ru-RU', {
      style: 'currency',
      currency: currency || 'RUB',
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return String(value);
  }
};

const isServiceBasketItem = (source: unknown): boolean => {
  const serviceType = getString(source, ['serviceType', 'service_type', 'type']);
  return serviceType === 'installation' || serviceType === 'delivery' || serviceType === 'service';
};

const getOrderItemDimensionsLabel = (source: unknown, props: UnknownRecord | null): string | null => {
  const explicitLabel =
    getString(props, ['dimensions', 'dimensionsLabel', 'dimensions_label']) ??
    getString(source, ['dimensions', 'dimensionsLabel', 'dimensions_label']);

  if (explicitLabel) {
    return explicitLabel;
  }

  const width = getNumber(source, ['widthMm', 'width_mm', 'width']);
  const height = getNumber(source, ['heightMm', 'height_mm', 'height']);

  if (width !== null && width > 0 && height !== null && height > 0) {
    return `${width} x ${height} мм`;
  }

  return null;
};

const buildOrderItemLabel = (source: unknown, index: number): string | null => {
  if (!isRecord(source) || isServiceBasketItem(source)) {
    return null;
  }

  const props = getItemProps(source);
  const positionId = getString(props, ['positionId']) ?? getString(source, ['positionId', 'position_id']);
  const itemName = getString(source, ['name', 'title']);
  const schemeLabel = getString(props, ['openingTypeLabel']) ?? getString(source, ['openingTypeLabel', 'opening_type_label']);
  const baseLabel = itemName ?? schemeLabel ?? `Позиция ${positionId ?? index + 1}`;
  const dimensionsLabel = getOrderItemDimensionsLabel(source, props);
  const quantity = getNumber(source, ['quantity']);
  const price = getNumber(source, ['price', 'amount', 'totalPrice', 'total_price']);
  const currency = getString(source, ['currency']);

  return [
    baseLabel,
    dimensionsLabel,
    quantity !== null && quantity > 1 ? `${quantity} шт.` : null,
    price !== null && price > 0 ? formatOrderItemPrice(price, currency) : null,
  ]
    .filter((item): item is string => Boolean(item))
    .join(' · ');
};

const buildOrderItemLabels = (source: unknown): string[] => {
  const productEntries = getArray(source, ['positions', 'products', 'productItems', 'product_items', 'basket', 'items']);

  return productEntries
    .map((item, index) => buildOrderItemLabel(item, index))
    .filter((item): item is string => item !== null && item.trim().length > 0);
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
    items: buildOrderItemLabels(source),
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

export const registerOrGetUser = async (form: OrderCustomerForm, isUpdate = false): Promise<string> => {
  const login = buildUserLogin(form);
  const email = buildUserEmail(form, login);
  const response = await postLocalAjaxJson({
    label: 'user_register_or_get',
    path: LOCAL_AJAX_PATHS.registerOrGetUser,
    payload: {
      source: 'order-details',
      action: 'user_register_or_get',
      isUpdate,
      is_update: isUpdate,
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

  return extractRequiredId(response, ['userId', 'user_id', 'clientId', 'client_id', 'id'], 'user');
};

export const saveRemoteOrder = async ({ orderId, payload }: SaveRemoteOrderParams): Promise<{ orderId: string; response: unknown }> => {
  const isExistingOrder = Boolean(orderId);
  const label = isExistingOrder ? 'order_refresh' : 'order_create';
  const path = isExistingOrder
    ? `${LOCAL_AJAX_PATHS.refreshOrder}&order_id=${encodeURIComponent(String(orderId))}`
    : LOCAL_AJAX_PATHS.addOrder;
  const response = await postLocalAjaxJson({
    label,
    path,
    payload,
    csrfToken: authStorage.getSession()?.token,
  });

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
  const code = getString(response, ['code', 'orderCode', 'order_code', 'ORDER_CODE']) ?? '';

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

  const items = getArray(response, ['items']);
  const normalizedItems = items
    .map((item) => buildOrderSummary(item))
    .filter((item): item is RemoteOrderListItem => item !== null);

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

export const updateRemoteOrderCode = async ({
  orderId,
  orderCode,
}: {
  orderId: string;
  orderCode: string;
}): Promise<void> => {
  await postLocalAjaxJson({
    label: 'order_code_update',
    path: LOCAL_AJAX_PATHS.updateOrderCode,
    payload: {
      source: 'order-details',
      action: 'order_code_update',
      order_id: orderId,
      orderId,
      order_code: orderCode,
      orderCode,
    },
  });
};

export const updateRemoteOrderPayment = async ({
  orderId,
  payment,
}: {
  orderId: string;
  payment: OrderPaymentPayload;
}): Promise<void> => {
  await postLocalAjaxJson({
    label: 'order_payment_update',
    path: LOCAL_AJAX_PATHS.updateOrderPayment,
    payload: {
      source: 'payment',
      action: 'order_payment_update',
      order_id: orderId,
      orderId,
      payment,
      values: {
        payment,
      },
    },
  });
};

export const markRemoteOrderPaid = async ({
  orderId,
  payment,
}: {
  orderId: string;
  payment: OrderPaymentPayload;
}): Promise<void> => {
  await postLocalAjaxJson({
    label: 'order_paid_full',
    path: LOCAL_AJAX_PATHS.markOrderPaid,
    payload: {
      source: 'payment',
      action: 'order_paid_full',
      order_id: orderId,
      orderId,
      payment,
      values: {
        payment,
      },
    },
  });
};

export const requestRemoteInvoice = async (payload: unknown): Promise<RemoteInvoiceResponse> => {
  const response = await postLocalAjaxJson({
    label: 'get_data_invoice',
    path: LOCAL_AJAX_PATHS.getDataInvoice,
    payload,
  });

  return {
    status: getString(response, ['status']),
    invoiceNo: getNumber(response, ['invoice_no', 'invoiceNo']),
    orderCode: getString(response, ['order_code', 'orderCode', 'code']),
    amount: getNumber(response, ['amount']),
    customerId: getString(response, ['customer_id', 'customerId']),
    raw: response,
  };
};

export const requestRemoteInvoicePdf = async ({
  invoiceNo,
  document = 'Коммерческое предложение +',
}: {
  invoiceNo: number;
  document?: string;
}): Promise<RemoteInvoicePdfResponse> => {
  if (!Number.isFinite(invoiceNo) || invoiceNo <= 0) {
    throw new Error('Не получен номер счета для печати КП.');
  }

  const payload = {
    source: 'order-details',
    action: 'get_data_print_invoice',
    invoice_no: invoiceNo,
    invoiceNo,
    document,
  };

  const response = await fetch(LOCAL_AJAX_PATHS.getDataPrintInvoice, {
    method: 'POST',
    credentials: 'same-origin',
    headers: {
      'Content-Type': 'application/json',
      'X-Requested-With': 'XMLHttpRequest',
    },
    body: JSON.stringify(payload),
  });

  const contentType = response.headers.get('content-type');
  const responseBuffer = await response.arrayBuffer();
  const responseText = decodeArrayBufferText(responseBuffer);
  const parsedResponse = parseJsonString(responseText);
  const responsePayload = parsedResponse ?? responseText;

  if (!response.ok) {
    throw new LocalAjaxError(response.status, responsePayload, '[local-ajax] get_data_print_invoice failed');
  }

  const isPdf = isPdfArrayBuffer(responseBuffer);
  const isDeclaredPdf = Boolean(contentType?.toLowerCase().includes('pdf'));

  if (isDeclaredPdf && !isPdf) {
    throw new LocalAjaxError(
      502,
      {
        success: false,
        error: {
          code: 'invalid_pdf_response',
          message: responseBuffer.byteLength === 0 ? 'Server returned an empty PDF' : 'Server returned invalid PDF content',
          responseBytes: responseBuffer.byteLength,
        },
      },
      'Сервер не вернул корректный файл КП. Попробуйте ещё раз.',
    );
  }

  const blobPdfUrl = isPdf
    ? URL.createObjectURL(new Blob([responseBuffer], { type: contentType ?? 'application/pdf' }))
    : null;
  const pdfUrl = blobPdfUrl ?? normalizePdfUrl(responsePayload);

  if (!pdfUrl) {
    throw new LocalAjaxError(
      502,
      responsePayload,
      'Сервер не вернул файл КП. Попробуйте ещё раз.',
    );
  }

  const result: RemoteInvoicePdfResponse = {
    invoiceNo,
    pdfUrl,
    fileName: `invoice-${invoiceNo}.pdf`,
    contentType,
    raw: isPdf ? '[PDF binary]' : responsePayload,
  };

  return result;
};
