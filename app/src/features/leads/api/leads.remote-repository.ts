import type {
  AppNotification,
  CompleteWorkOrderInput,
  ConvertLeadInput,
  CustomerContact,
  LeadAttachment,
  LeadDetails,
  LeadLocation,
  LeadProject,
  LeadsRepository,
  LeadServiceType,
  LeadStatus,
  LeadSummary,
  ListLeadsQuery,
  ListWorkOrdersQuery,
  Money,
  MoneyRange,
  NotificationDelivery,
  NotificationType,
  ScheduleLeadInput,
  ScheduledVisit,
  TakeLeadOptions,
  UpdateWorkOrderInput,
  WorkOrderDetails,
  WorkOrderStatus,
  WorkOrderSummary,
  WorkOrderType,
  WorkPhoto,
} from '@/features/leads/model/leads.types';
import { LeadsRepositoryError } from '@/features/leads/model/leads.types';
import { authStorage } from '@/features/auth/model/auth-storage';
import { LocalAjaxError, postLocalAjaxForm, postLocalAjaxJson } from '@/shared/api/local-ajax';

type UnknownRecord = Record<string, unknown>;

const LEADS_AJAX_PATHS = {
  listLeads: '/local/rest/api/v1/?action=leads_list',
  getLead: '/local/rest/api/v1/?action=lead_get',
  takeLead: '/local/rest/api/v1/?action=lead_take',
  scheduleLead: '/local/rest/api/v1/?action=lead_schedule',
  convertLead: '/local/rest/api/v1/?action=lead_measurement_convert',
  listWorkOrders: '/local/rest/api/v1/?action=work_orders_list',
  getWorkOrder: '/local/rest/api/v1/?action=work_order_get',
  updateWorkOrder: '/local/rest/api/v1/?action=work_order_update',
  completeWorkOrder: '/local/rest/api/v1/?action=work_order_complete',
  listNotifications: '/local/rest/api/v1/?action=notifications_list',
  markNotificationRead: '/local/rest/api/v1/?action=notification_read',
  markAllNotificationsRead: '/local/rest/api/v1/?action=notifications_read_all',
} as const;

const isRecord = (value: unknown): value is UnknownRecord =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const normalizeHttpUrl = (value: string | undefined): string | undefined => {
  if (!value?.trim()) {
    return undefined;
  }

  try {
    const base = typeof window === 'undefined' ? 'https://localhost/' : window.location.href;
    const url = new URL(value, base);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : undefined;
  } catch {
    return undefined;
  }
};

const normalizeImageUrl = (value: string | undefined): string | undefined => {
  const normalized = value?.trim();
  if (normalized && /^data:image\/(?:jpeg|png|webp);base64,[a-z0-9+/=\s]+$/i.test(normalized)) {
    return normalized;
  }

  return normalizeHttpUrl(normalized);
};

const parseJson = (value: unknown): unknown => {
  if (typeof value !== 'string') {
    return value;
  }

  const normalized = value.trim();

  if (!normalized || (!normalized.startsWith('{') && !normalized.startsWith('['))) {
    return value;
  }

  try {
    return JSON.parse(normalized) as unknown;
  } catch {
    return value;
  }
};

const getValue = (source: UnknownRecord, keys: readonly string[]): unknown => {
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(source, key) && source[key] !== null && source[key] !== undefined) {
      return source[key];
    }
  }

  return undefined;
};

const getRecord = (source: UnknownRecord, keys: readonly string[]): UnknownRecord | undefined => {
  const value = parseJson(getValue(source, keys));
  return isRecord(value) ? value : undefined;
};

const getArray = (source: UnknownRecord, keys: readonly string[]): unknown[] => {
  const value = parseJson(getValue(source, keys));
  return Array.isArray(value) ? value : [];
};

const toStringValue = (value: unknown): string | undefined => {
  if (typeof value === 'string') {
    const normalized = value.trim();
    return normalized || undefined;
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }

  return undefined;
};

const getString = (source: UnknownRecord, keys: readonly string[]): string | undefined =>
  toStringValue(getValue(source, keys));

const toNumber = (value: unknown): number | undefined => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const normalized = value.replace(/\s/g, '').replace(',', '.');
    const parsed = Number.parseFloat(normalized);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  return undefined;
};

const getNumber = (source: UnknownRecord, keys: readonly string[]): number | undefined =>
  toNumber(getValue(source, keys));

const toBoolean = (value: unknown): boolean | undefined => {
  if (typeof value === 'boolean') {
    return value;
  }

  if (value === 1 || value === '1' || value === 'true') {
    return true;
  }

  if (value === 0 || value === '0' || value === 'false') {
    return false;
  }

  return undefined;
};

const appendQuery = (path: string, values: Record<string, string | number | undefined>): string => {
  const query = Object.entries(values)
    .filter((entry): entry is [string, string | number] => entry[1] !== undefined && entry[1] !== '')
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
    .join('&');

  return query ? `${path}&${query}` : path;
};

const normalizeLeadStatus = (value: unknown): LeadStatus => {
  const normalized = toStringValue(value)?.toLowerCase();
  const aliases: Record<string, LeadStatus> = {
    available: 'available',
    new: 'available',
    assigned: 'assigned',
    taken: 'assigned',
    in_work: 'in_work',
    scheduled: 'in_work',
    converted: 'converted',
    expired: 'expired',
    cancelled: 'cancelled',
    canceled: 'cancelled',
  };

  return normalized ? aliases[normalized] ?? 'available' : 'available';
};

const normalizeLeadType = (value: unknown): LeadServiceType => {
  const normalized = toStringValue(value)?.toLowerCase();

  if (normalized === 'installation' || normalized === 'install' || normalized === 'монтаж') {
    return 'installation';
  }

  if (normalized === 'delivery' || normalized === 'доставка') {
    return 'delivery';
  }

  return 'measurement';
};

const normalizeWorkOrderType = (value: unknown): WorkOrderType =>
  normalizeLeadType(value) === 'delivery' ? 'delivery' : 'installation';

const normalizeWorkOrderStatus = (value: unknown): WorkOrderStatus => {
  const normalized = toStringValue(value)?.toLowerCase();
  const aliases: Record<string, WorkOrderStatus> = {
    assigned: 'assigned',
    scheduled: 'in_work',
    in_work: 'in_work',
    in_progress: 'in_work',
    done: 'done',
    completed: 'done',
    cancelled: 'cancelled',
    canceled: 'cancelled',
  };

  return normalized ? aliases[normalized] ?? 'assigned' : 'assigned';
};

const normalizeMoney = (value: unknown): Money | undefined => {
  const parsed = parseJson(value);

  if (isRecord(parsed)) {
    const amount = getNumber(parsed, ['amount', 'value', 'sum']);
    return amount === undefined ? undefined : { amount, currency: 'RUB' };
  }

  const amount = toNumber(parsed);
  return amount === undefined ? undefined : { amount, currency: 'RUB' };
};

const normalizeMoneyRange = (value: unknown, source?: UnknownRecord): MoneyRange | undefined => {
  const parsed = parseJson(value);
  const record = isRecord(parsed) ? parsed : undefined;
  const min = record
    ? getNumber(record, ['min', 'from', 'budgetMin', 'budget_min'])
    : source
      ? getNumber(source, ['budgetMin', 'budget_min', 'budgetFrom', 'budget_from'])
      : undefined;
  const max = record
    ? getNumber(record, ['max', 'to', 'budgetMax', 'budget_max'])
    : source
      ? getNumber(source, ['budgetMax', 'budget_max', 'budgetTo', 'budget_to'])
      : undefined;

  if (min === undefined && max === undefined) {
    const amount = toNumber(parsed);
    return amount === undefined ? undefined : { min: amount, max: amount, currency: 'RUB' };
  }

  return {
    min: min ?? max ?? 0,
    max: max ?? min ?? 0,
    currency: 'RUB',
  };
};

const normalizeCustomer = (source: UnknownRecord, status?: LeadStatus): CustomerContact => {
  const customer = getRecord(source, ['customer', 'client']) ?? source;
  const phone = getString(customer, ['phone', 'phoneNumber', 'phone_number']) ?? '';

  return {
    name:
      getString(customer, ['name', 'fullName', 'full_name', 'customerName', 'customer_name', 'clientName', 'client_name']) ??
      'Клиент',
    phone,
    isMasked:
      toBoolean(getValue(customer, ['isMasked', 'is_masked', 'masked'])) ??
      (phone.includes('*') || status === 'available'),
  };
};

const maskRemotePhone = (phone: string): string => {
  const digits = phone.replace(/\D/g, '');
  return `+7 (9**) ***-**-${digits.slice(-2).padStart(2, '*')}`;
};

const parseCoordinates = (value: unknown): { latitude?: number; longitude?: number } => {
  const parsed = parseJson(value);

  if (Array.isArray(parsed)) {
    return { latitude: toNumber(parsed[0]), longitude: toNumber(parsed[1]) };
  }

  if (isRecord(parsed)) {
    return {
      latitude: getNumber(parsed, ['latitude', 'lat']),
      longitude: getNumber(parsed, ['longitude', 'lng', 'lon']),
    };
  }

  if (typeof parsed === 'string') {
    const [latitude, longitude] = parsed.split(/[,;]/).map((part) => toNumber(part));
    return { latitude, longitude };
  }

  return {};
};

const normalizeLocation = (
  source: UnknownRecord,
  nestedKeys: readonly string[] = ['location'],
  fieldPrefix = '',
): LeadLocation => {
  const nestedLocation = getRecord(source, nestedKeys);
  const location = nestedLocation ?? source;
  const effectivePrefix = nestedLocation ? '' : fieldPrefix;
  const prefixed = (camelName: string, snakeName: string): string[] =>
    effectivePrefix
      ? [`${effectivePrefix}${camelName[0]?.toUpperCase() ?? ''}${camelName.slice(1)}`, `${effectivePrefix}_${snakeName}`]
      : [camelName, snakeName];
  const coordinates = parseCoordinates(
    getValue(location, [
      ...prefixed('coordinates', 'coordinates'),
      ...prefixed('geo', 'geo'),
    ]),
  );

  return {
    region: getString(location, prefixed('region', 'region')) ?? '',
    city: getString(location, prefixed('city', 'city')) ?? '',
    address: getString(location, prefixed('address', 'address')),
    latitude:
      getNumber(location, [...prefixed('latitude', 'latitude'), ...prefixed('lat', 'lat')]) ??
      coordinates.latitude,
    longitude:
      getNumber(location, [...prefixed('longitude', 'longitude'), ...prefixed('lng', 'lng')]) ??
      coordinates.longitude,
    mapImageUrl: normalizeImageUrl(getString(location, prefixed('mapImageUrl', 'map_image_url'))),
  };
};

const normalizeTimeWindow = (value: unknown): Pick<ScheduledVisit, 'timeFrom' | 'timeTo'> => {
  const parsed = parseJson(value);

  if (isRecord(parsed)) {
    return {
      timeFrom: getString(parsed, ['timeFrom', 'time_from', 'from', 'start']),
      timeTo: getString(parsed, ['timeTo', 'time_to', 'to', 'end']),
    };
  }

  if (typeof parsed === 'string') {
    const [timeFrom, timeTo] = parsed.split(/\s*(?:-|–|—)\s*/);
    return { timeFrom: toStringValue(timeFrom), timeTo: toStringValue(timeTo) };
  }

  return {};
};

const normalizeVisit = (source: UnknownRecord, keys: readonly string[]): ScheduledVisit | undefined => {
  const nested = getRecord(source, keys);
  const rawDate = nested
    ? getString(nested, ['date', 'plannedDate', 'planned_date', 'scheduledAt', 'scheduled_at'])
    : getString(source, keys);

  if (!rawDate) {
    return undefined;
  }

  const date = rawDate.slice(0, 10);
  const windowSource = nested ?? source;
  const timeWindow = normalizeTimeWindow(
    getValue(windowSource, ['timeWindow', 'time_window', 'plannedTime', 'planned_time']),
  );
  const isoTime = rawDate.includes('T') ? rawDate.slice(11, 16) : undefined;

  return {
    date,
    timeFrom: getString(windowSource, ['timeFrom', 'time_from']) ?? timeWindow.timeFrom ?? isoTime,
    timeTo: getString(windowSource, ['timeTo', 'time_to']) ?? timeWindow.timeTo,
  };
};

const normalizeAttachment = (value: unknown, index: number): LeadAttachment | null => {
  if (typeof value === 'string') {
    const url = normalizeHttpUrl(value);
    if (!url) {
      return null;
    }

    return {
      id: `attachment-${index + 1}`,
      name: value.split('/').pop() ?? `Файл ${index + 1}`,
      url,
      kind: /\.(png|jpe?g|webp|gif)$/i.test(value) ? 'image' : 'document',
    };
  }

  if (!isRecord(value)) {
    return null;
  }

  const url = normalizeHttpUrl(getString(value, ['url', 'downloadUrl', 'download_url', 'src']));
  if (!url) {
    return null;
  }
  const mimeType = getString(value, ['mimeType', 'mime_type', 'type']);
  const explicitKind = getString(value, ['kind']);
  const kind =
    explicitKind === 'image' || mimeType?.startsWith('image/') || /\.(png|jpe?g|webp|gif)$/i.test(url)
      ? 'image'
      : 'document';

  return {
    id: getString(value, ['id', 'fileId', 'file_id']) ?? `attachment-${index + 1}`,
    name: getString(value, ['name', 'fileName', 'file_name']) ?? `Файл ${index + 1}`,
    url,
    kind,
    mimeType,
    size: getNumber(value, ['size', 'fileSize', 'file_size']),
    thumbnailUrl: normalizeImageUrl(getString(value, ['thumbnailUrl', 'thumbnail_url', 'previewUrl', 'preview_url'])),
  };
};

const normalizeProject = (source: UnknownRecord): LeadProject => {
  const project = getRecord(source, ['project', 'specification']) ?? source;
  const budget = normalizeMoneyRange(getValue(project, ['budget', 'budgetRange', 'budget_range']), project);

  return {
    product:
      getString(project, ['product', 'productType', 'product_type', 'description', 'projectDescription', 'project_description']) ??
      'Оконные конструкции',
    volume: getString(project, ['volume', 'quantityLabel', 'quantity_label', 'amountLabel', 'amount_label']),
    budget,
  };
};

const requireRecord = (value: unknown, entityName: string): UnknownRecord => {
  const parsed = parseJson(value);

  if (!isRecord(parsed)) {
    throw new LeadsRepositoryError('server', `Сервер вернул некорректные данные: ${entityName}.`, {
      details: { reason: 'malformed_response', value },
    });
  }

  return parsed;
};

const normalizeLead = (value: unknown): LeadDetails => {
  const source = requireRecord(value, 'lead');
  const status = normalizeLeadStatus(getValue(source, ['status', 'leadStatus', 'lead_status']));
  const project = normalizeProject(source);
  const location = normalizeLocation(source);
  const id = getString(source, ['id', 'leadId', 'lead_id']);

  if (!id) {
    throw new LeadsRepositoryError('server', 'Сервер не вернул идентификатор лида.', {
      details: { reason: 'malformed_response', value },
    });
  }

  const attachments = getArray(source, ['attachments', 'files', 'fileList', 'file_list'])
    .map(normalizeAttachment)
    .filter((item): item is LeadAttachment => item !== null);
  const publishedAt =
    getString(source, ['publishedAt', 'published_at', 'createdAt', 'created_at']) ?? new Date().toISOString();
  const budget = normalizeMoneyRange(getValue(source, ['budget', 'budgetRange', 'budget_range']), source) ?? project.budget;

  const lead: LeadDetails = {
    id,
    externalId: getString(source, ['externalId', 'external_id', 'b24Id', 'b24_id']),
    version: getNumber(source, ['version']) ?? 1,
    status,
    serviceType: normalizeLeadType(getValue(source, ['serviceType', 'service_type', 'leadType', 'lead_type', 'type'])),
    title: getString(source, ['title', 'name']) ?? project.product,
    product: project.product,
    region: getString(source, ['region']) ?? location.region,
    city: getString(source, ['city']) ?? location.city,
    budget,
    reward: normalizeMoney(getValue(source, ['reward', 'dealerReward', 'dealer_reward', 'fee'])),
    publishedAt,
    expiresAt: getString(source, ['expiresAt', 'expires_at', 'dateExpire', 'date_expire', 'expireAt', 'expire_at']) ?? publishedAt,
    customer: normalizeCustomer(source, status),
    scheduledVisit: normalizeVisit(source, ['scheduledVisit', 'scheduled_visit', 'scheduledAt', 'scheduled_at', 'requiredDate', 'required_date']),
    project,
    location,
    factoryNotes: getString(source, ['factoryNotes', 'factory_notes', 'notes', 'comment']),
    attachments,
    dealerId: getString(source, ['dealerId', 'dealer_id']),
    takenAt: getString(source, ['takenAt', 'taken_at', 'assignedAt', 'assigned_at']),
    scheduleDueAt: getString(source, ['scheduleDueAt', 'schedule_due_at', 'scheduleDeadline', 'schedule_deadline']),
    convertedAt: getString(source, ['convertedAt', 'converted_at']),
    convertedOrderId: getString(source, ['convertedOrderId', 'converted_order_id', 'orderId', 'order_id']),
    convertedWorkOrderId: getString(source, ['convertedWorkOrderId', 'converted_work_order_id', 'workOrderId', 'work_order_id']),
    cancellationReason: getString(source, ['cancellationReason', 'cancellation_reason']),
    createdAt: getString(source, ['createdAt', 'created_at']) ?? publishedAt,
    updatedAt: getString(source, ['updatedAt', 'updated_at']) ?? publishedAt,
  };

  if (lead.status !== 'available') {
    return lead;
  }

  return {
    ...lead,
    customer: {
      ...lead.customer,
      name: `${lead.customer.name.split(/\s+/)[0] ?? 'Клиент'} ***`,
      phone: maskRemotePhone(lead.customer.phone),
      isMasked: true,
    },
    location: {
      region: lead.location.region,
      city: lead.location.city,
    },
    factoryNotes: undefined,
    attachments: [],
  };
};

const toLeadSummary = (lead: LeadDetails): LeadSummary => ({
  id: lead.id,
  externalId: lead.externalId,
  version: lead.version,
  status: lead.status,
  serviceType: lead.serviceType,
  title: lead.title,
  product: lead.project.product,
  region: lead.region,
  city: lead.city,
  budget: lead.budget,
  reward: lead.reward,
  publishedAt: lead.publishedAt,
  expiresAt: lead.expiresAt,
  customer: lead.customer,
  scheduledVisit: lead.scheduledVisit,
});

const normalizePhoto = (value: unknown, index: number): WorkPhoto | null => {
  if (typeof value === 'string' || typeof value === 'number') {
    const id = String(value);
    return {
      id,
      name: `Фото ${index + 1}`,
      url: '',
      mimeType: 'image/jpeg',
      size: 0,
      createdAt: '',
    };
  }

  if (!isRecord(value)) {
    return null;
  }

  return {
    id: getString(value, ['id', 'fileId', 'file_id']) ?? `photo-${index + 1}`,
    name: getString(value, ['name', 'fileName', 'file_name']) ?? `Фото ${index + 1}`,
    url: normalizeImageUrl(getString(value, ['url', 'downloadUrl', 'download_url', 'src'])) ?? '',
    thumbnailUrl: normalizeImageUrl(getString(value, ['thumbnailUrl', 'thumbnail_url', 'previewUrl', 'preview_url'])),
    mimeType: getString(value, ['mimeType', 'mime_type']) ?? 'image/jpeg',
    size: getNumber(value, ['size', 'fileSize', 'file_size']) ?? 0,
    createdAt: getString(value, ['createdAt', 'created_at']) ?? '',
  };
};

const normalizeWorkOrder = (value: unknown): WorkOrderDetails => {
  const source = requireRecord(value, 'work order');
  const id = getString(source, ['id', 'workOrderId', 'work_order_id']);

  if (!id) {
    throw new LeadsRepositoryError('server', 'Сервер не вернул идентификатор заказа.', {
      details: { reason: 'malformed_response', value },
    });
  }

  const destination = normalizeLocation(source, ['destination', 'location']);
  const warehouse = normalizeLocation(source, ['warehouse'], 'warehouse');
  const routeSource = getRecord(source, ['route']);
  const reminderSource = getRecord(source, ['reminder']);
  const photos = getArray(source, ['photos', 'photoIds', 'photo_ids'])
    .map(normalizePhoto)
    .filter((item): item is WorkPhoto => item !== null);
  const createdAt = getString(source, ['createdAt', 'created_at']) ?? new Date().toISOString();

  return {
    id,
    version: getNumber(source, ['version']) ?? 1,
    type: normalizeWorkOrderType(getValue(source, ['type', 'workOrderType', 'work_order_type'])),
    status: normalizeWorkOrderStatus(getValue(source, ['status'])),
    displayId: getString(source, ['displayId', 'display_id', 'orderNumber', 'order_number', 'title']) ?? id,
    customer: normalizeCustomer(source),
    product: getString(source, ['product', 'productType', 'product_type', 'title']) ?? 'Оконные конструкции',
    reward: normalizeMoney(getValue(source, ['reward', 'dealerReward', 'dealer_reward', 'fee'])),
    createdAt,
    plannedVisit: normalizeVisit(source, ['plannedVisit', 'planned_visit', 'plannedAt', 'planned_at', 'plannedDate', 'planned_date']),
    actualDate: getString(source, ['actualDate', 'actual_date'])?.slice(0, 10),
    destination,
    leadId: getString(source, ['leadId', 'lead_id']),
    dealerId: getString(source, ['dealerId', 'dealer_id']) ?? '',
    comment: getString(source, ['comment', 'resultComment', 'result_comment']),
    warehouse: warehouse.address || warehouse.latitude !== undefined ? warehouse : undefined,
    route: routeSource
      ? {
          distanceKm: getNumber(routeSource, ['distanceKm', 'distance_km', 'distance']),
          durationMinutes: getNumber(routeSource, ['durationMinutes', 'duration_minutes', 'duration']),
          mapImageUrl: normalizeImageUrl(getString(routeSource, ['mapImageUrl', 'map_image_url'])),
        }
      : undefined,
    reminder: reminderSource
      ? {
          message: getString(reminderSource, ['message', 'text']) ?? 'Напоминание о звонке клиенту',
          minutesBefore: getNumber(reminderSource, ['minutesBefore', 'minutes_before']) ?? 60,
        }
      : undefined,
    photos,
    completedAt: getString(source, ['completedAt', 'completed_at']),
    cancellationReason: getString(source, ['cancellationReason', 'cancellation_reason']),
    updatedAt: getString(source, ['updatedAt', 'updated_at']) ?? createdAt,
  };
};

const toWorkOrderSummary = (workOrder: WorkOrderDetails): WorkOrderSummary => ({
  id: workOrder.id,
  version: workOrder.version,
  type: workOrder.type,
  status: workOrder.status,
  displayId: workOrder.displayId,
  customer: workOrder.customer,
  product: workOrder.product,
  reward: workOrder.reward,
  createdAt: workOrder.createdAt,
  plannedVisit: workOrder.plannedVisit,
  actualDate: workOrder.actualDate,
  destination: workOrder.destination,
});

const notificationTypeAliases: Record<string, NotificationType> = {
  new_lead: 'lead_available',
  lead_available: 'lead_available',
  lead_taken: 'lead_taken',
  deadline_reminder: 'lead_schedule_due',
  lead_schedule_due: 'lead_schedule_due',
  lead_returned: 'lead_returned',
  work_order: 'work_order_assigned',
  work_order_assigned: 'work_order_assigned',
  work_order_due: 'work_order_due',
  work_order_completed: 'work_order_completed',
  cancelled: 'work_order_cancelled',
  work_order_cancelled: 'work_order_cancelled',
};

const normalizeNotification = (value: unknown): AppNotification => {
  const source = requireRecord(value, 'notification');
  const payload = getRecord(source, ['payload']) ?? {};
  const rawChannels = getArray(source, ['channels']);
  const deliveryRecord = getRecord(source, ['delivery']) ?? {};
  const channels = rawChannels
    .map(toStringValue)
    .filter((channel): channel is 'in_app' | 'push' | 'sms' | 'email' =>
      channel === 'in_app' || channel === 'push' || channel === 'sms' || channel === 'email',
    );
  const deliveries: NotificationDelivery[] = channels.map((channel) => {
    const delivery = isRecord(deliveryRecord[channel]) ? deliveryRecord[channel] : undefined;
    const rawStatus = delivery ? getString(delivery, ['status']) : undefined;
    const status = rawStatus === 'available' || rawStatus === 'sent' ? 'sent' : rawStatus === 'failed' ? 'failed' : 'pending';

    return {
      channel,
      status,
      sentAt: delivery ? getString(delivery, ['sentAt', 'sent_at']) : undefined,
    };
  });
  const rawType = getString(source, ['type', 'event']) ?? 'new_lead';

  return {
    id: getString(source, ['id', 'notificationId', 'notification_id']) ?? rawType,
    type: notificationTypeAliases[rawType] ?? 'lead_available',
    title: getString(source, ['title']) ?? 'Уведомление',
    message: getString(source, ['message']) ?? '',
    createdAt: getString(source, ['createdAt', 'created_at']) ?? new Date().toISOString(),
    readAt: getString(source, ['readAt', 'read_at']),
    leadId: getString(source, ['leadId', 'lead_id']) ?? getString(payload, ['leadId', 'lead_id']),
    workOrderId:
      getString(source, ['workOrderId', 'work_order_id']) ?? getString(payload, ['workOrderId', 'work_order_id']),
    deliveries,
  };
};

const extractRemoteError = (payload: unknown): { code?: string; message?: string; details?: unknown } => {
  if (!isRecord(payload)) {
    return {};
  }

  const error = isRecord(payload.error) ? payload.error : payload;
  return {
    code: getString(error, ['code', 'errorCode', 'error_code']),
    message: getString(error, ['message', 'errorMessage', 'error_message']),
    details: getValue(error, ['details', 'data']),
  };
};

const mapErrorCode = (status: number | undefined, remoteCode: string | undefined) => {
  if (
    status === 401 ||
    remoteCode === 'authentication_required' ||
    remoteCode === 'csrf_failed' ||
    remoteCode?.includes('unauthorized')
  ) {
    return 'unauthorized' as const;
  }

  if (status === 403 || remoteCode?.includes('forbidden') || remoteCode?.includes('mismatch')) {
    return 'forbidden' as const;
  }

  if (status === 404 || remoteCode?.includes('not_found')) {
    return 'not_found' as const;
  }

  if (status === 409 || remoteCode?.includes('conflict') || remoteCode?.includes('already')) {
    return 'conflict' as const;
  }

  if (status === 400 || status === 422 || remoteCode?.includes('validation') || remoteCode?.includes('invalid')) {
    return 'validation' as const;
  }

  return 'server' as const;
};

const expireBrowserSession = (): void => {
  authStorage.clearSession();

  if (typeof window === 'undefined') {
    return;
  }

  const appBaseUrl = new URL(import.meta.env.BASE_URL, window.location.origin);
  const loginUrl = new URL('login', appBaseUrl).href;
  if (window.location.href !== loginUrl) {
    window.location.assign(loginUrl);
  }
};

const throwNormalizedRemoteError = (error: unknown): never => {
  const normalized = normalizeLeadsRemoteError(error);
  if (normalized.code === 'unauthorized') {
    expireBrowserSession();
  }
  throw normalized;
};

export const normalizeLeadsRemoteError = (error: unknown): LeadsRepositoryError => {
  if (error instanceof LeadsRepositoryError) {
    return error;
  }

  if (error instanceof LocalAjaxError) {
    const remote = extractRemoteError(error.payload);
    return new LeadsRepositoryError(
      mapErrorCode(error.status, remote.code),
      remote.message ?? 'Не удалось выполнить запрос к серверу.',
      {
        status: error.status,
        details: { remoteCode: remote.code, remoteDetails: remote.details, payload: error.payload },
        cause: error,
      },
    );
  }

  if (error instanceof TypeError) {
    return new LeadsRepositoryError('network', 'Нет связи с сервером. Проверьте подключение к интернету.', {
      details: { reason: 'network' },
      cause: error,
    });
  }

  return new LeadsRepositoryError('server', error instanceof Error ? error.message : 'Неизвестная ошибка сервера.', {
    cause: error,
  });
};

const unwrapResponse = (response: unknown): unknown => {
  if (!isRecord(response)) {
    throw new LeadsRepositoryError('server', 'Сервер вернул ответ неизвестного формата.', {
      details: { reason: 'malformed_response', response },
    });
  }

  if (response.success === false) {
    const remote = extractRemoteError(response);
    throw new LeadsRepositoryError(mapErrorCode(undefined, remote.code), remote.message ?? 'Операция не выполнена.', {
      details: { remoteCode: remote.code, remoteDetails: remote.details, response },
    });
  }

  return Object.prototype.hasOwnProperty.call(response, 'data') ? response.data : response;
};

const extractItems = (value: unknown): unknown[] => {
  if (Array.isArray(value)) {
    return value;
  }

  if (!isRecord(value)) {
    throw new LeadsRepositoryError('server', 'Сервер вернул некорректный список.', {
      details: { reason: 'malformed_response', value },
    });
  }

  const items = getArray(value, ['items', 'leads', 'workOrders', 'work_orders', 'notifications']);

  if (items.length === 0 && !Object.values(value).some(Array.isArray)) {
    return [];
  }

  return items;
};

const extractEntity = (value: unknown, keys: readonly string[]): unknown => {
  if (!isRecord(value)) {
    return value;
  }

  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(value, key)) {
      return value[key];
    }
  }

  return value;
};

const callRemote = async (label: string, path: string, payload: unknown, method: 'GET' | 'POST' = 'POST') => {
  try {
    const response = await postLocalAjaxJson({
      label,
      path,
      payload,
      method,
      csrfToken: method === 'GET' ? undefined : authStorage.getSession()?.token,
    });
    return unwrapResponse(response);
  } catch (error) {
    throwNormalizedRemoteError(error);
  }
};

const dataUrlToBlob = (dataUrl: string): Blob => {
  const match = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=\r\n]+)$/i.exec(dataUrl);
  if (!match) {
    throw new LeadsRepositoryError('validation', 'Фото имеет неподдерживаемый формат. Используйте JPEG, PNG или WebP.');
  }

  const binary = atob(match[2].replace(/\s+/g, ''));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new Blob([bytes], { type: match[1].toLowerCase() });
};

const callRemoteWorkOrderCompletion = async (id: string, input: CompleteWorkOrderInput): Promise<unknown> => {
  const formData = new FormData();
  formData.set('work_order_id', id);
  formData.set('workOrderId', id);
  formData.set('actual_date', input.actualDate);
  formData.set('actualDate', input.actualDate);
  if (input.expectedVersion !== undefined) {
    formData.set('expected_version', String(input.expectedVersion));
    formData.set('expectedVersion', String(input.expectedVersion));
  }

  input.photos.forEach((photo) => {
    const blob = dataUrlToBlob(photo.dataUrl);
    formData.append('photos[]', blob, photo.name);
  });

  try {
    const response = await postLocalAjaxForm({
      label: 'work_order_complete',
      path: LEADS_AJAX_PATHS.completeWorkOrder,
      formData,
      csrfToken: authStorage.getSession()?.token,
    });
    return unwrapResponse(response);
  } catch (error) {
    throwNormalizedRemoteError(error);
  }
};

const REMOTE_PAGE_SIZE = 50;
const REMOTE_PAGE_LIMIT = 100;

const fetchAllRemoteItems = async (
  label: string,
  path: string,
  query: Record<string, string | number | undefined>,
): Promise<unknown[]> => {
  const items: unknown[] = [];

  for (let page = 1; page <= REMOTE_PAGE_LIMIT; page += 1) {
    const data = await callRemote(
      label,
      appendQuery(path, { ...query, page, page_size: REMOTE_PAGE_SIZE }),
      null,
      'GET',
    );
    const batch = extractItems(data);
    items.push(...batch);

    if (batch.length < REMOTE_PAGE_SIZE) {
      return items;
    }
  }

  throw new LeadsRepositoryError('server', 'Список слишком большой для безопасной загрузки.', {
    details: { reason: 'pagination_limit', pageLimit: REMOTE_PAGE_LIMIT },
  });
};

export const createRemoteLeadsRepository = (): LeadsRepository => ({
  async listLeads(query: ListLeadsQuery) {
    const items = await fetchAllRemoteItems(
      'leads_list',
      LEADS_AJAX_PATHS.listLeads,
      {
        scope: query.scope,
        region: query.region,
        type: query.serviceType,
        product: query.product,
        budget_min: query.budgetMin,
        budget_max: query.budgetMax,
        search: query.search,
      },
    );
    return items.map((item) => toLeadSummary(normalizeLead(item)));
  },

  async getLead(id) {
    const data = await callRemote(
      'lead_get',
      appendQuery(LEADS_AJAX_PATHS.getLead, { lead_id: id }),
      null,
      'GET',
    );
    return normalizeLead(extractEntity(data, ['lead', 'item']));
  },

  async takeLead(id, options: TakeLeadOptions = {}) {
    const data = await callRemote('lead_take', LEADS_AJAX_PATHS.takeLead, {
      lead_id: id,
      leadId: id,
      expected_version: options.expectedVersion,
      expectedVersion: options.expectedVersion,
    });
    return normalizeLead(extractEntity(data, ['lead', 'item']));
  },

  async scheduleLead(id, input: ScheduleLeadInput) {
    const data = await callRemote('lead_schedule', LEADS_AJAX_PATHS.scheduleLead, {
      lead_id: id,
      leadId: id,
      date: input.date,
      time_from: input.timeFrom,
      timeFrom: input.timeFrom,
      time_to: input.timeTo,
      timeTo: input.timeTo,
      expected_version: input.expectedVersion,
      expectedVersion: input.expectedVersion,
    });
    return normalizeLead(extractEntity(data, ['lead', 'item']));
  },

  async convertLead(id, input: ConvertLeadInput) {
    const data = await callRemote('lead_measurement_convert', LEADS_AJAX_PATHS.convertLead, {
      lead_id: id,
      leadId: id,
      order_id: input.orderId,
      orderId: input.orderId,
      work_order_id: input.workOrderId,
      workOrderId: input.workOrderId,
      expected_version: input.expectedVersion,
      expectedVersion: input.expectedVersion,
    });
    return normalizeLead(extractEntity(data, ['lead', 'item']));
  },

  async convertMeasurementLead(id, orderId, expectedVersion) {
    return this.convertLead(id, { orderId, expectedVersion });
  },

  async listWorkOrders(query: ListWorkOrdersQuery = {}) {
    const items = await fetchAllRemoteItems(
      'work_orders_list',
      LEADS_AJAX_PATHS.listWorkOrders,
      {
        scope: query.scope,
        type: query.type,
        search: query.search,
      },
    );
    return items.map((item) => toWorkOrderSummary(normalizeWorkOrder(item)));
  },

  async getWorkOrder(id) {
    const data = await callRemote(
      'work_order_get',
      appendQuery(LEADS_AJAX_PATHS.getWorkOrder, { work_order_id: id, order_id: id }),
      null,
      'GET',
    );
    return normalizeWorkOrder(extractEntity(data, ['workOrder', 'work_order', 'item']));
  },

  async updateWorkOrder(id, input: UpdateWorkOrderInput) {
    const data = await callRemote('work_order_update', LEADS_AJAX_PATHS.updateWorkOrder, {
      work_order_id: id,
      workOrderId: id,
      planned_visit: input.plannedVisit,
      plannedVisit: input.plannedVisit,
      date: input.plannedVisit?.date,
      time_from: input.plannedVisit?.timeFrom,
      time_to: input.plannedVisit?.timeTo,
      status: input.status,
      comment: input.comment,
      reminder: input.reminder,
      expected_version: input.expectedVersion,
      expectedVersion: input.expectedVersion,
    });
    return normalizeWorkOrder(extractEntity(data, ['workOrder', 'work_order', 'item']));
  },

  async completeWorkOrder(id, input: CompleteWorkOrderInput) {
    const data = await callRemoteWorkOrderCompletion(id, input);
    return normalizeWorkOrder(extractEntity(data, ['workOrder', 'work_order', 'item']));
  },

  async listNotifications() {
    const items = await fetchAllRemoteItems('notifications_list', LEADS_AJAX_PATHS.listNotifications, {});
    return items.map(normalizeNotification);
  },

  async markNotificationRead(id) {
    const data = await callRemote('notification_read', LEADS_AJAX_PATHS.markNotificationRead, {
      notification_id: id,
      notificationId: id,
    });
    return normalizeNotification(extractEntity(data, ['notification', 'item']));
  },

  async markAllRead() {
    return this.markAllNotificationsRead();
  },

  async markAllNotificationsRead() {
    await callRemote('notifications_read_all', LEADS_AJAX_PATHS.markAllNotificationsRead, {});
    return this.listNotifications();
  },
});

export { LEADS_AJAX_PATHS };
