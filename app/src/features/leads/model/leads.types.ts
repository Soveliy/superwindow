export type CurrencyCode = 'RUB';

export interface Money {
  amount: number;
  currency: CurrencyCode;
}

export interface MoneyRange {
  min: number;
  max: number;
  currency: CurrencyCode;
}

export type LeadScope = 'available' | 'my' | 'archive';
export type LeadServiceType = 'measurement' | 'installation' | 'delivery';
export type LeadStatus =
  | 'available'
  | 'assigned'
  | 'in_work'
  | 'converted'
  | 'expired'
  | 'cancelled';

export interface CustomerContact {
  name: string;
  phone: string;
  isMasked: boolean;
}

export interface LeadProject {
  product: string;
  volume?: string;
  budget?: MoneyRange;
}

export interface LeadLocation {
  region: string;
  city: string;
  address?: string;
  latitude?: number;
  longitude?: number;
  mapImageUrl?: string;
}

export type LeadAttachmentKind = 'image' | 'document';

export interface LeadAttachment {
  id: string;
  name: string;
  url: string;
  kind: LeadAttachmentKind;
  mimeType?: string;
  size?: number;
  thumbnailUrl?: string;
}

export interface ScheduledVisit {
  date: string;
  timeFrom?: string;
  timeTo?: string;
}

export interface LeadSummary {
  id: string;
  externalId?: string;
  version: number;
  status: LeadStatus;
  serviceType: LeadServiceType;
  title: string;
  product: string;
  region: string;
  city: string;
  budget?: MoneyRange;
  reward?: Money;
  publishedAt: string;
  expiresAt: string;
  customer: CustomerContact;
  scheduledVisit?: ScheduledVisit;
}

export interface LeadDetails extends LeadSummary {
  project: LeadProject;
  location: LeadLocation;
  factoryNotes?: string;
  attachments: LeadAttachment[];
  dealerId?: string;
  takenAt?: string;
  scheduleDueAt?: string;
  convertedAt?: string;
  convertedOrderId?: string;
  convertedWorkOrderId?: string;
  cancellationReason?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ListLeadsQuery {
  scope: LeadScope;
  region?: string;
  serviceType?: LeadServiceType;
  product?: string;
  budgetMin?: number;
  budgetMax?: number;
  search?: string;
}

export interface TakeLeadOptions {
  expectedVersion?: number;
}

export interface ScheduleLeadInput {
  date: string;
  timeFrom?: string;
  timeTo?: string;
  expectedVersion?: number;
}

export interface ConvertLeadInput {
  orderId?: string;
  workOrderId?: string;
  expectedVersion?: number;
}

export type WorkOrderType = Exclude<LeadServiceType, 'measurement'>;
export type WorkOrderStatus = 'assigned' | 'in_work' | 'done' | 'cancelled';
export type WorkOrderScope = 'active' | 'archive';

export interface WorkOrderRoute {
  distanceKm?: number;
  durationMinutes?: number;
  mapImageUrl?: string;
}

export interface WorkOrderReminder {
  message: string;
  minutesBefore: number;
}

export interface WorkPhoto {
  id: string;
  name: string;
  url: string;
  thumbnailUrl?: string;
  mimeType: string;
  size: number;
  createdAt: string;
}

export interface WorkPhotoInput {
  name: string;
  mimeType: string;
  size: number;
  dataUrl: string;
}

export interface WorkOrderSummary {
  id: string;
  version: number;
  type: WorkOrderType;
  status: WorkOrderStatus;
  displayId: string;
  customer: CustomerContact;
  product: string;
  reward?: Money;
  createdAt: string;
  plannedVisit?: ScheduledVisit;
  actualDate?: string;
  destination: LeadLocation;
}

export interface WorkOrderDetails extends WorkOrderSummary {
  leadId?: string;
  dealerId: string;
  comment?: string;
  warehouse?: LeadLocation;
  route?: WorkOrderRoute;
  reminder?: WorkOrderReminder;
  photos: WorkPhoto[];
  completedAt?: string;
  cancellationReason?: string;
  updatedAt: string;
}

export interface ListWorkOrdersQuery {
  scope?: WorkOrderScope;
  type?: WorkOrderType;
  search?: string;
}

export interface UpdateWorkOrderInput {
  plannedVisit?: ScheduledVisit;
  status?: Extract<WorkOrderStatus, 'assigned' | 'in_work'>;
  comment?: string;
  reminder?: WorkOrderReminder | null;
  expectedVersion?: number;
}

export interface CompleteWorkOrderInput {
  actualDate: string;
  photos: WorkPhotoInput[];
  expectedVersion?: number;
}

export type NotificationType =
  | 'lead_available'
  | 'lead_taken'
  | 'lead_schedule_due'
  | 'lead_returned'
  | 'work_order_assigned'
  | 'work_order_due'
  | 'work_order_completed'
  | 'work_order_cancelled';

export type NotificationChannel = 'in_app' | 'push' | 'sms' | 'email';
export type NotificationDeliveryStatus = 'pending' | 'sent' | 'failed';

export interface NotificationDelivery {
  channel: NotificationChannel;
  status: NotificationDeliveryStatus;
  sentAt?: string;
}

export interface AppNotification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  createdAt: string;
  readAt?: string;
  leadId?: string;
  workOrderId?: string;
  deliveries: NotificationDelivery[];
}

export type LeadsRepositoryErrorCode =
  | 'not_found'
  | 'conflict'
  | 'validation'
  | 'unauthorized'
  | 'forbidden'
  | 'network'
  | 'server';

export class LeadsRepositoryError extends Error {
  readonly code: LeadsRepositoryErrorCode;
  readonly status?: number;
  readonly details?: unknown;

  constructor(
    code: LeadsRepositoryErrorCode,
    message: string,
    options: { status?: number; details?: unknown; cause?: unknown } = {},
  ) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = 'LeadsRepositoryError';
    this.code = code;
    this.status = options.status;
    this.details = options.details;
  }
}

export interface LeadsRepository {
  listLeads(query: ListLeadsQuery): Promise<LeadSummary[]>;
  getLead(id: string): Promise<LeadDetails>;
  takeLead(id: string, options?: TakeLeadOptions): Promise<LeadDetails>;
  scheduleLead(id: string, input: ScheduleLeadInput): Promise<LeadDetails>;
  convertLead(id: string, input: ConvertLeadInput): Promise<LeadDetails>;
  convertMeasurementLead(id: string, orderId: string, expectedVersion?: number): Promise<LeadDetails>;
  listWorkOrders(query?: ListWorkOrdersQuery): Promise<WorkOrderSummary[]>;
  getWorkOrder(id: string): Promise<WorkOrderDetails>;
  updateWorkOrder(id: string, input: UpdateWorkOrderInput): Promise<WorkOrderDetails>;
  completeWorkOrder(id: string, input: CompleteWorkOrderInput): Promise<WorkOrderDetails>;
  listNotifications(): Promise<AppNotification[]>;
  markNotificationRead(id: string): Promise<AppNotification>;
  markAllRead(): Promise<AppNotification[]>;
  markAllNotificationsRead(): Promise<AppNotification[]>;
}
