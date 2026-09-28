import type {
  AppNotification,
  CompleteWorkOrderInput,
  ConvertLeadInput,
  LeadDetails,
  LeadsRepository,
  LeadSummary,
  ListLeadsQuery,
  ListWorkOrdersQuery,
  ScheduleLeadInput,
  ScheduledVisit,
  TakeLeadOptions,
  UpdateWorkOrderInput,
  WorkOrderDetails,
  WorkOrderSummary,
  WorkPhotoInput,
} from '@/features/leads/model/leads.types';
import { LeadsRepositoryError } from '@/features/leads/model/leads.types';
import {
  mutateLeadsDemoState,
  readLeadsDemoState,
} from '@/features/leads/model/leads.storage';

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;
const MAX_PHOTO_SIZE = 10 * 1024 * 1024;
const MAX_PHOTO_COUNT = 10;

const createId = (prefix: string): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`;
  }

  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
};

const addHours = (isoDate: string, hours: number): string => {
  const date = new Date(isoDate);
  return new Date(date.getTime() + hours * 60 * 60 * 1_000).toISOString();
};

const isExpired = (isoDate: string, now: Date): boolean => {
  const timestamp = Date.parse(isoDate);
  return Number.isFinite(timestamp) && timestamp <= now.getTime();
};

const toLocalDate = (date: Date): string => {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const validateDate = (value: string, fieldName: string): string => {
  const normalized = value.trim();

  if (!ISO_DATE_PATTERN.test(normalized)) {
    throw new LeadsRepositoryError('validation', `${fieldName}: ожидается дата в формате YYYY-MM-DD.`);
  }

  const parsed = new Date(`${normalized}T00:00:00`);

  if (Number.isNaN(parsed.getTime()) || toLocalDate(parsed) !== normalized) {
    throw new LeadsRepositoryError('validation', `${fieldName}: указана некорректная дата.`);
  }

  return normalized;
};

const normalizeOptionalTime = (value: string | undefined, fieldName: string): string | undefined => {
  if (value === undefined || !value.trim()) {
    return undefined;
  }

  const normalized = value.trim();

  if (!TIME_PATTERN.test(normalized)) {
    throw new LeadsRepositoryError('validation', `${fieldName}: ожидается время в формате HH:mm.`);
  }

  return normalized;
};

const normalizeVisit = (input: ScheduledVisit): ScheduledVisit => {
  const date = validateDate(input.date, 'Дата визита');
  const timeFrom = normalizeOptionalTime(input.timeFrom, 'Начало интервала');
  const timeTo = normalizeOptionalTime(input.timeTo, 'Конец интервала');

  if (timeFrom && timeTo && timeFrom >= timeTo) {
    throw new LeadsRepositoryError('validation', 'Конец временного интервала должен быть позже начала.');
  }

  return { date, timeFrom, timeTo };
};

const visitsEqual = (left: ScheduledVisit | undefined, right: ScheduledVisit): boolean =>
  left?.date === right.date &&
  left.timeFrom === right.timeFrom &&
  left.timeTo === right.timeTo;

const assertExpectedVersion = (
  actualVersion: number,
  expectedVersion: number | undefined,
  entityName: string,
): void => {
  if (expectedVersion !== undefined && expectedVersion !== actualVersion) {
    throw new LeadsRepositoryError(
      'conflict',
      `${entityName} уже изменён. Обновите данные и повторите действие.`,
      { status: 409, details: { actualVersion, expectedVersion } },
    );
  }
};

const maskPhone = (phone: string): string => {
  const digits = phone.replace(/\D/g, '');
  const suffix = digits.slice(-2).padStart(2, '*');
  return `+7 (9**) ***-**-${suffix}`;
};

const sanitizeAvailableLead = (lead: LeadDetails): LeadDetails => ({
  ...lead,
  customer: {
    ...lead.customer,
    name: `${lead.customer.name.split(/\s+/)[0] ?? 'Клиент'} ***`,
    phone: maskPhone(lead.customer.phone),
    isMasked: true,
  },
  location: {
    region: lead.location.region,
    city: lead.location.city,
  },
  factoryNotes: undefined,
  attachments: [],
});

const toVisibleLead = (lead: LeadDetails, dealerId: string): LeadDetails => {
  if (lead.status === 'available' && lead.dealerId !== dealerId) {
    return sanitizeAvailableLead(lead);
  }

  return lead;
};

const toLeadSummary = (lead: LeadDetails, dealerId: string): LeadSummary => {
  const visibleLead = toVisibleLead(lead, dealerId);

  return {
    id: visibleLead.id,
    externalId: visibleLead.externalId,
    version: visibleLead.version,
    status: visibleLead.status,
    serviceType: visibleLead.serviceType,
    title: visibleLead.title,
    product: visibleLead.project.product,
    region: visibleLead.region,
    city: visibleLead.city,
    budget: visibleLead.budget,
    reward: visibleLead.reward,
    publishedAt: visibleLead.publishedAt,
    expiresAt: visibleLead.expiresAt,
    customer: visibleLead.customer,
    scheduledVisit: visibleLead.scheduledVisit,
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

const findLead = (leads: LeadDetails[], id: string): LeadDetails => {
  const lead = leads.find((item) => item.id === id || item.externalId === id);

  if (!lead) {
    throw new LeadsRepositoryError('not_found', 'Лид не найден.', { status: 404 });
  }

  return lead;
};

const findWorkOrder = (workOrders: WorkOrderDetails[], id: string): WorkOrderDetails => {
  const workOrder = workOrders.find((item) => item.id === id || item.displayId === id);

  if (!workOrder) {
    throw new LeadsRepositoryError('not_found', 'Заказ не найден.', { status: 404 });
  }

  return workOrder;
};

const assertLeadOwner = (lead: LeadDetails, dealerId: string): void => {
  if (lead.dealerId !== dealerId) {
    throw new LeadsRepositoryError('unauthorized', 'Лид закреплён за другим дилером.', { status: 403 });
  }
};

const assertWorkOrderOwner = (workOrder: WorkOrderDetails, dealerId: string): void => {
  if (workOrder.dealerId !== dealerId) {
    throw new LeadsRepositoryError('unauthorized', 'Заказ закреплён за другим дилером.', { status: 403 });
  }
};

const createNotification = (
  input: Omit<AppNotification, 'id' | 'createdAt' | 'deliveries'>,
  now: string,
): AppNotification => ({
  ...input,
  id: createId('NOTIFY'),
  createdAt: now,
  deliveries: [
    { channel: 'in_app', status: 'sent', sentAt: now },
    { channel: 'push', status: 'pending' },
    { channel: 'sms', status: 'pending' },
    { channel: 'email', status: 'pending' },
  ],
});

const applyDeadlines = (
  state: ReturnType<typeof readLeadsDemoState>,
  dealerId: string,
  now: Date,
): void => {
  const nowIso = now.toISOString();

  for (const lead of state.leads) {
    if (lead.status === 'available' && isExpired(lead.expiresAt, now)) {
      lead.status = 'expired';
      lead.version += 1;
      lead.updatedAt = nowIso;
      continue;
    }

    if (
      lead.dealerId === dealerId &&
      lead.status === 'assigned' &&
      !lead.scheduledVisit &&
      lead.scheduleDueAt &&
      isExpired(lead.scheduleDueAt, now)
    ) {
      lead.status = 'available';
      lead.version += 1;
      lead.dealerId = undefined;
      lead.takenAt = undefined;
      lead.scheduleDueAt = undefined;
      lead.updatedAt = nowIso;
      state.notifications.unshift(
        createNotification(
          {
            type: 'lead_returned',
            title: 'Лид возвращён на витрину',
            message: `Для лида ${lead.id} дата не была назначена за 24 часа.`,
            leadId: lead.id,
          },
          nowIso,
        ),
      );
    }
  }
};

const hasDueDeadlines = (
  state: ReturnType<typeof readLeadsDemoState>,
  dealerId: string,
  now: Date,
): boolean =>
  state.leads.some(
    (lead) =>
      (lead.status === 'available' && isExpired(lead.expiresAt, now)) ||
      (lead.dealerId === dealerId &&
        lead.status === 'assigned' &&
        !lead.scheduledVisit &&
        Boolean(lead.scheduleDueAt && isExpired(lead.scheduleDueAt, now))),
  );

const readFreshState = async (dealerId: string): Promise<ReturnType<typeof readLeadsDemoState>> => {
  const state = readLeadsDemoState(dealerId);
  const now = new Date();

  if (!hasDueDeadlines(state, dealerId, now)) {
    return state;
  }

  return mutateLeadsDemoState(dealerId, (freshState) => {
    applyDeadlines(freshState, dealerId, now);
    return freshState;
  });
};

const matchesLeadScope = (lead: LeadDetails, query: ListLeadsQuery, dealerId: string): boolean => {
  if (query.scope === 'available' && lead.status !== 'available') {
    return false;
  }

  if (
    query.scope === 'my' &&
    (lead.dealerId !== dealerId || (lead.status !== 'assigned' && lead.status !== 'in_work'))
  ) {
    return false;
  }

  if (
    query.scope === 'archive' &&
    (lead.dealerId !== dealerId || !['converted', 'expired', 'cancelled'].includes(lead.status))
  ) {
    return false;
  }

  if (query.region && lead.region !== query.region) {
    return false;
  }

  if (query.serviceType && lead.serviceType !== query.serviceType) {
    return false;
  }

  if (query.product && lead.project.product !== query.product) {
    return false;
  }

  if (query.budgetMin !== undefined && (lead.budget?.max ?? 0) < query.budgetMin) {
    return false;
  }

  if (query.budgetMax !== undefined && (lead.budget?.min ?? Number.POSITIVE_INFINITY) > query.budgetMax) {
    return false;
  }

  if (query.search) {
    const haystack = `${lead.id} ${lead.externalId ?? ''} ${lead.title} ${lead.project.product} ${lead.city} ${lead.region}`.toLowerCase();
    if (!haystack.includes(query.search.trim().toLowerCase())) {
      return false;
    }
  }

  return true;
};

const nextWorkOrderNumber = (workOrders: WorkOrderDetails[], type: WorkOrderDetails['type']): number => {
  const prefix = type === 'delivery' ? 'Д-' : 'М-';

  return (
    workOrders.reduce((max, item) => {
      if (!item.displayId.startsWith(prefix)) {
        return max;
      }

      const number = Number.parseInt(item.displayId.slice(prefix.length), 10);
      return Number.isFinite(number) ? Math.max(max, number) : max;
    }, 122) + 1
  );
};

const createWorkOrderFromLead = (
  lead: LeadDetails,
  dealerId: string,
  now: string,
  workOrders: WorkOrderDetails[],
): WorkOrderDetails => {
  if (lead.serviceType === 'measurement') {
    throw new LeadsRepositoryError('validation', 'Для замера используется стандартный заказ.');
  }

  const number = nextWorkOrderNumber(workOrders, lead.serviceType);
  const displayPrefix = lead.serviceType === 'delivery' ? 'Д' : 'М';
  const defaultWarehouse = {
    region: 'Курская область',
    city: 'Курск',
    address: 'г. Курск, ул. Складская, д. 12',
    latitude: 51.768,
    longitude: 36.155,
  };

  return {
    id: `WORK-${displayPrefix}-${number}`,
    version: 1,
    type: lead.serviceType,
    status: 'assigned',
    displayId: `${displayPrefix}-${number}`,
    leadId: lead.id,
    dealerId,
    customer: { ...lead.customer, isMasked: false },
    product: lead.project.product,
    comment: lead.factoryNotes,
    reward: lead.reward,
    createdAt: now,
    plannedVisit: lead.scheduledVisit,
    warehouse: lead.serviceType === 'delivery' ? defaultWarehouse : undefined,
    destination: lead.location,
    route:
      lead.serviceType === 'delivery'
        ? { distanceKm: 11.8, durationMinutes: 28, mapImageUrl: lead.location.mapImageUrl }
        : undefined,
    reminder: {
      message: lead.serviceType === 'delivery' ? 'Позвонить за час до доставки' : 'Позвонить за час до монтажа',
      minutesBefore: 60,
    },
    photos: [],
    updatedAt: now,
  };
};

const normalizePhoto = (photo: WorkPhotoInput, index: number, now: string) => {
  const mimeType = photo.mimeType.trim().toLowerCase();

  if (!photo.name.trim() || !['image/jpeg', 'image/png', 'image/webp'].includes(mimeType)) {
    throw new LeadsRepositoryError('validation', `Фото ${index + 1} должно быть в формате JPEG, PNG или WebP.`);
  }

  if (!Number.isFinite(photo.size) || photo.size <= 0 || photo.size > MAX_PHOTO_SIZE) {
    throw new LeadsRepositoryError(
      'validation',
      `Размер файла ${photo.name} должен быть от 1 байта до 10 МБ.`,
    );
  }

  if (!new RegExp(`^data:${mimeType.replace('/', '\\/')};base64,`, 'i').test(photo.dataUrl)) {
    throw new LeadsRepositoryError('validation', `Не удалось прочитать изображение ${photo.name}.`);
  }

  return {
    id: createId('PHOTO'),
    name: photo.name.trim(),
    url: photo.dataUrl,
    thumbnailUrl: photo.dataUrl,
    mimeType,
    size: photo.size,
    createdAt: now,
  };
};

export const createDemoLeadsRepository = (dealerId: string): LeadsRepository => ({
  async listLeads(query) {
    const state = await readFreshState(dealerId);

    return state.leads
      .filter((lead) => matchesLeadScope(lead, query, dealerId))
      .sort((left, right) => Date.parse(right.publishedAt) - Date.parse(left.publishedAt))
      .map((lead) => toLeadSummary(lead, dealerId));
  },

  async getLead(id) {
    const state = await readFreshState(dealerId);
    const lead = findLead(state.leads, id);

    if (lead.status !== 'available' && lead.dealerId !== dealerId) {
      throw new LeadsRepositoryError('unauthorized', 'Нет доступа к этому лиду.', { status: 403 });
    }

    return toVisibleLead(lead, dealerId);
  },

  async takeLead(id, options: TakeLeadOptions = {}) {
    return mutateLeadsDemoState(dealerId, (state) => {
      const now = new Date();
      const nowIso = now.toISOString();
      applyDeadlines(state, dealerId, now);
      const lead = findLead(state.leads, id);

      if (lead.dealerId === dealerId && ['assigned', 'in_work', 'converted'].includes(lead.status)) {
        return lead;
      }

      assertExpectedVersion(lead.version, options.expectedVersion, 'Лид');

      if (lead.status !== 'available' || isExpired(lead.expiresAt, now)) {
        throw new LeadsRepositoryError('conflict', 'Лид уже недоступен.', {
          status: 409,
          details: { status: lead.status },
        });
      }

      lead.status = 'assigned';
      lead.dealerId = dealerId;
      lead.takenAt = nowIso;
      lead.scheduleDueAt = addHours(nowIso, 24);
      lead.customer.isMasked = false;
      lead.version += 1;
      lead.updatedAt = nowIso;
      state.notifications.unshift(
        createNotification(
          {
            type: 'lead_taken',
            title: 'Лид закреплён за вами',
            message: 'Контакт клиента открыт. Назначьте дату в течение 24 часов.',
            leadId: lead.id,
          },
          nowIso,
        ),
      );

      return lead;
    });
  },

  async scheduleLead(id, input: ScheduleLeadInput) {
    const visit = normalizeVisit(input);

    if (visit.date < toLocalDate(new Date())) {
      throw new LeadsRepositoryError('validation', 'Дата визита не может быть в прошлом.');
    }

    return mutateLeadsDemoState(dealerId, (state) => {
      const now = new Date();
      const nowIso = now.toISOString();
      applyDeadlines(state, dealerId, now);
      const lead = findLead(state.leads, id);
      assertLeadOwner(lead, dealerId);

      if (visitsEqual(lead.scheduledVisit, visit)) {
        return lead;
      }

      assertExpectedVersion(lead.version, input.expectedVersion, 'Лид');

      if (lead.status !== 'assigned' && lead.status !== 'in_work') {
        throw new LeadsRepositoryError('conflict', 'Для этого лида уже нельзя изменить дату.', {
          status: 409,
          details: { status: lead.status },
        });
      }

      lead.scheduledVisit = visit;
      lead.status = 'in_work';
      lead.version += 1;
      lead.updatedAt = nowIso;

      if (lead.serviceType !== 'measurement' && !lead.convertedWorkOrderId) {
        const workOrder = createWorkOrderFromLead(lead, dealerId, nowIso, state.workOrders);
        state.workOrders.unshift(workOrder);
        lead.status = 'converted';
        lead.convertedAt = nowIso;
        lead.convertedWorkOrderId = workOrder.id;
        state.notifications.unshift(
          createNotification(
            {
              type: 'work_order_assigned',
              title: `Назначен заказ ${workOrder.displayId}`,
              message: 'Дата сохранена. Заказ добавлен в список работ.',
              leadId: lead.id,
              workOrderId: workOrder.id,
            },
            nowIso,
          ),
        );
      }

      return lead;
    });
  },

  async convertLead(id, input: ConvertLeadInput) {
    if (!input.orderId?.trim() && !input.workOrderId?.trim()) {
      throw new LeadsRepositoryError('validation', 'Для конвертации нужен идентификатор заказа.');
    }

    return mutateLeadsDemoState(dealerId, (state) => {
      const lead = findLead(state.leads, id);
      assertLeadOwner(lead, dealerId);
      const orderId = input.orderId?.trim();
      const workOrderId = input.workOrderId?.trim();

      if (lead.status === 'converted') {
        if (
          (orderId && lead.convertedOrderId === orderId) ||
          (workOrderId && lead.convertedWorkOrderId === workOrderId)
        ) {
          return lead;
        }

        throw new LeadsRepositoryError('conflict', 'Лид уже связан с другим заказом.', { status: 409 });
      }

      assertExpectedVersion(lead.version, input.expectedVersion, 'Лид');

      if (lead.status !== 'assigned' && lead.status !== 'in_work') {
        throw new LeadsRepositoryError('conflict', 'Лид нельзя конвертировать в текущем статусе.', {
          status: 409,
          details: { status: lead.status },
        });
      }

      const now = new Date().toISOString();
      lead.status = 'converted';
      lead.convertedAt = now;
      lead.convertedOrderId = orderId;
      lead.convertedWorkOrderId = workOrderId;
      lead.version += 1;
      lead.updatedAt = now;
      return lead;
    });
  },

  async convertMeasurementLead(id, orderId, expectedVersion) {
    const normalizedOrderId = orderId.trim();

    if (!normalizedOrderId) {
      throw new LeadsRepositoryError('validation', 'Не указан идентификатор созданного заказа.');
    }

    const currentLead = findLead((await readFreshState(dealerId)).leads, id);

    if (currentLead.serviceType !== 'measurement') {
      throw new LeadsRepositoryError('validation', 'Этот метод предназначен только для лидов на замер.');
    }

    return this.convertLead(id, { orderId: normalizedOrderId, expectedVersion });
  },

  async listWorkOrders(query: ListWorkOrdersQuery = {}) {
    const state = await readFreshState(dealerId);
    const scope = query.scope ?? 'active';

    return state.workOrders
      .filter((workOrder) => {
        if (workOrder.dealerId !== dealerId) {
          return false;
        }

        const isArchive = workOrder.status === 'done' || workOrder.status === 'cancelled';

        if ((scope === 'archive') !== isArchive) {
          return false;
        }

        if (query.type && workOrder.type !== query.type) {
          return false;
        }

        if (query.search) {
          const haystack = `${workOrder.id} ${workOrder.displayId} ${workOrder.customer.name} ${workOrder.product}`.toLowerCase();
          return haystack.includes(query.search.trim().toLowerCase());
        }

        return true;
      })
      .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt))
      .map(toWorkOrderSummary);
  },

  async getWorkOrder(id) {
    const state = await readFreshState(dealerId);
    const workOrder = findWorkOrder(state.workOrders, id);
    assertWorkOrderOwner(workOrder, dealerId);
    return workOrder;
  },

  async updateWorkOrder(id, input: UpdateWorkOrderInput) {
    const plannedVisit = input.plannedVisit ? normalizeVisit(input.plannedVisit) : undefined;

    if (plannedVisit && plannedVisit.date < toLocalDate(new Date())) {
      throw new LeadsRepositoryError('validation', 'Плановая дата не может быть в прошлом.');
    }

    return mutateLeadsDemoState(dealerId, (state) => {
      const workOrder = findWorkOrder(state.workOrders, id);
      assertWorkOrderOwner(workOrder, dealerId);
      assertExpectedVersion(workOrder.version, input.expectedVersion, 'Заказ');

      if (workOrder.status === 'done' || workOrder.status === 'cancelled') {
        throw new LeadsRepositoryError('conflict', 'Завершённый или отменённый заказ нельзя изменить.', {
          status: 409,
        });
      }

      if (plannedVisit) {
        workOrder.plannedVisit = plannedVisit;
      }

      if (input.status) {
        workOrder.status = input.status;
      }

      if (input.comment !== undefined) {
        workOrder.comment = input.comment.trim() || undefined;
      }

      if (input.reminder !== undefined) {
        workOrder.reminder = input.reminder ?? undefined;
      }

      workOrder.version += 1;
      workOrder.updatedAt = new Date().toISOString();
      return workOrder;
    });
  },

  async completeWorkOrder(id, input: CompleteWorkOrderInput) {
    const actualDate = validateDate(input.actualDate, 'Фактическая дата выполнения');

    if (actualDate > toLocalDate(new Date())) {
      throw new LeadsRepositoryError('validation', 'Фактическая дата не может быть в будущем.');
    }

    if (input.photos.length < 1) {
      throw new LeadsRepositoryError('validation', 'Для монтажа и доставки обязателен фотоотчёт.');
    }

    if (input.photos.length > MAX_PHOTO_COUNT) {
      throw new LeadsRepositoryError('validation', `Можно загрузить не более ${MAX_PHOTO_COUNT} фотографий.`);
    }

    return mutateLeadsDemoState(dealerId, (state) => {
      const workOrder = findWorkOrder(state.workOrders, id);
      assertWorkOrderOwner(workOrder, dealerId);

      if (workOrder.status === 'done') {
        return workOrder;
      }

      assertExpectedVersion(workOrder.version, input.expectedVersion, 'Заказ');

      if (workOrder.status === 'cancelled') {
        throw new LeadsRepositoryError('conflict', 'Отменённый заказ нельзя завершить.', { status: 409 });
      }

      const now = new Date().toISOString();
      workOrder.photos = input.photos.map((photo, index) => normalizePhoto(photo, index, now));
      workOrder.actualDate = actualDate;
      workOrder.status = 'done';
      workOrder.completedAt = now;
      workOrder.version += 1;
      workOrder.updatedAt = now;
      state.notifications.unshift(
        createNotification(
          {
            type: 'work_order_completed',
            title: `Заказ ${workOrder.displayId} выполнен`,
            message: 'Фотоотчёт отправлен на проверку заводу.',
            workOrderId: workOrder.id,
          },
          now,
        ),
      );

      return workOrder;
    });
  },

  async listNotifications() {
    const state = await readFreshState(dealerId);
    return state.notifications.sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt));
  },

  async markNotificationRead(id) {
    return mutateLeadsDemoState(dealerId, (state) => {
      const notification = state.notifications.find((item) => item.id === id);

      if (!notification) {
        throw new LeadsRepositoryError('not_found', 'Уведомление не найдено.', { status: 404 });
      }

      if (!notification.readAt) {
        notification.readAt = new Date().toISOString();
      }

      return notification;
    });
  },

  async markAllRead() {
    return this.markAllNotificationsRead();
  },

  async markAllNotificationsRead() {
    return mutateLeadsDemoState(dealerId, (state) => {
      const now = new Date().toISOString();

      for (const notification of state.notifications) {
        notification.readAt ??= now;
      }

      return state.notifications;
    });
  },
});
