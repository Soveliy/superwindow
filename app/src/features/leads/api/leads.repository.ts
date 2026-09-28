import { createDemoLeadsRepository } from '@/features/leads/api/leads.demo-repository';
import { createRemoteLeadsRepository } from '@/features/leads/api/leads.remote-repository';
import { authStorage } from '@/features/auth/model/auth-storage';
import type {
  CompleteWorkOrderInput,
  ConvertLeadInput,
  LeadsRepository,
  ListLeadsQuery,
  ListWorkOrdersQuery,
  ScheduleLeadInput,
  TakeLeadOptions,
  UpdateWorkOrderInput,
} from '@/features/leads/model/leads.types';
import { LeadsRepositoryError } from '@/features/leads/model/leads.types';
import { env } from '@/shared/config/env';

export type LeadsDataSourceMode = 'auto' | 'remote' | 'demo';

export interface CreateLeadsRepositoryOptions {
  mode?: LeadsDataSourceMode;
  dealerId?: string;
  getDealerId?: () => string;
}

type RepositoryOperation = keyof LeadsRepository;

const normalizeMode = (value: unknown): LeadsDataSourceMode => {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';

  if (normalized === 'remote' || normalized === 'demo') {
    return normalized;
  }

  return 'auto';
};

const configuredMode: LeadsDataSourceMode = import.meta.env.PROD
  ? 'remote'
  : normalizeMode(import.meta.env.VITE_LEADS_DATA_SOURCE);

const readOnlyOperations = new Set<RepositoryOperation>([
  'listLeads',
  'getLead',
  'listWorkOrders',
  'getWorkOrder',
  'listNotifications',
]);

const getSessionDealerId = (): string => {
  try {
    return authStorage.getSession()?.dealerId ?? env.devAuthDealerId;
  } catch {
    return env.devAuthDealerId;
  }
};

const getErrorMetadata = (error: LeadsRepositoryError): { reason?: string; remoteCode?: string } => {
  if (!error.details || typeof error.details !== 'object' || Array.isArray(error.details)) {
    return {};
  }

  const details = error.details as Record<string, unknown>;
  return {
    reason: typeof details.reason === 'string' ? details.reason : undefined,
    remoteCode: typeof details.remoteCode === 'string' ? details.remoteCode : undefined,
  };
};

const isRemoteUnavailable = (error: unknown): boolean => {
  if (!(error instanceof LeadsRepositoryError)) {
    return false;
  }

  const { reason, remoteCode } = getErrorMetadata(error);
  const unavailableCodes = new Set([
    'action_not_found',
    'unknown_action',
    'route_not_found',
    'not_implemented',
    'storage_not_configured',
    'storage_schema_error',
    'import_not_configured',
  ]);

  if (reason === 'malformed_response') {
    return true;
  }

  if (remoteCode && unavailableCodes.has(remoteCode)) {
    return true;
  }

  return !remoteCode && (error.status === 404 || error.status === 405 || error.status === 501);
};

export const createLeadsRepository = (
  options: CreateLeadsRepositoryOptions = {},
): LeadsRepository => {
  const mode = options.mode ?? configuredMode;
  const remoteRepository = createRemoteLeadsRepository();
  const demoRepositories = new Map<string, LeadsRepository>();
  const unavailableOperations = new Set<RepositoryOperation>();
  const resolveDealerId = (): string =>
    options.dealerId ?? options.getDealerId?.() ?? getSessionDealerId();
  const getDemoRepository = (): LeadsRepository => {
    const dealerId = resolveDealerId();
    const cached = demoRepositories.get(dealerId);

    if (cached) {
      return cached;
    }

    const repository = createDemoLeadsRepository(dealerId);
    demoRepositories.set(dealerId, repository);
    return repository;
  };

  const run = async <TResult>(
    operation: RepositoryOperation,
    remoteCall: (repository: LeadsRepository) => Promise<TResult>,
    demoCall: (repository: LeadsRepository) => Promise<TResult>,
  ): Promise<TResult> => {
    if (mode === 'demo' || (mode === 'auto' && unavailableOperations.has(operation))) {
      return demoCall(getDemoRepository());
    }

    try {
      return await remoteCall(remoteRepository);
    } catch (error) {
      if (mode !== 'auto' || !readOnlyOperations.has(operation) || !isRemoteUnavailable(error)) {
        throw error;
      }

      unavailableOperations.add(operation);
      return demoCall(getDemoRepository());
    }
  };

  return {
    listLeads: (query) => run('listLeads', (repository) => repository.listLeads(query), (repository) => repository.listLeads(query)),
    getLead: (id) => run('getLead', (repository) => repository.getLead(id), (repository) => repository.getLead(id)),
    takeLead: (id, takeOptions) =>
      run('takeLead', (repository) => repository.takeLead(id, takeOptions), (repository) => repository.takeLead(id, takeOptions)),
    scheduleLead: (id, input) =>
      run('scheduleLead', (repository) => repository.scheduleLead(id, input), (repository) => repository.scheduleLead(id, input)),
    convertLead: (id, input) =>
      run('convertLead', (repository) => repository.convertLead(id, input), (repository) => repository.convertLead(id, input)),
    convertMeasurementLead: (id, orderId, expectedVersion) =>
      run(
        'convertMeasurementLead',
        (repository) => repository.convertMeasurementLead(id, orderId, expectedVersion),
        (repository) => repository.convertMeasurementLead(id, orderId, expectedVersion),
      ),
    listWorkOrders: (query) =>
      run('listWorkOrders', (repository) => repository.listWorkOrders(query), (repository) => repository.listWorkOrders(query)),
    getWorkOrder: (id) =>
      run('getWorkOrder', (repository) => repository.getWorkOrder(id), (repository) => repository.getWorkOrder(id)),
    updateWorkOrder: (id, input) =>
      run(
        'updateWorkOrder',
        (repository) => repository.updateWorkOrder(id, input),
        (repository) => repository.updateWorkOrder(id, input),
      ),
    completeWorkOrder: (id, input) =>
      run(
        'completeWorkOrder',
        (repository) => repository.completeWorkOrder(id, input),
        (repository) => repository.completeWorkOrder(id, input),
      ),
    listNotifications: () =>
      run('listNotifications', (repository) => repository.listNotifications(), (repository) => repository.listNotifications()),
    markNotificationRead: (id) =>
      run(
        'markNotificationRead',
        (repository) => repository.markNotificationRead(id),
        (repository) => repository.markNotificationRead(id),
      ),
    markAllRead: () =>
      run('markAllRead', (repository) => repository.markAllRead(), (repository) => repository.markAllRead()),
    markAllNotificationsRead: () =>
      run(
        'markAllNotificationsRead',
        (repository) => repository.markAllNotificationsRead(),
        (repository) => repository.markAllNotificationsRead(),
      ),
  };
};

export const leadsRepository = createLeadsRepository({ getDealerId: getSessionDealerId });

export const listLeads = (query: ListLeadsQuery) => leadsRepository.listLeads(query);
export const getLead = (id: string) => leadsRepository.getLead(id);
export const takeLead = (id: string, options?: TakeLeadOptions) => leadsRepository.takeLead(id, options);
export const scheduleLead = (id: string, input: ScheduleLeadInput) => leadsRepository.scheduleLead(id, input);
export const convertLead = (id: string, input: ConvertLeadInput) => leadsRepository.convertLead(id, input);
export const convertMeasurementLead = (id: string, orderId: string, expectedVersion?: number) =>
  leadsRepository.convertMeasurementLead(id, orderId, expectedVersion);
export const listWorkOrders = (query?: ListWorkOrdersQuery) => leadsRepository.listWorkOrders(query);
export const getWorkOrder = (id: string) => leadsRepository.getWorkOrder(id);
export const updateWorkOrder = (id: string, input: UpdateWorkOrderInput) =>
  leadsRepository.updateWorkOrder(id, input);
export const completeWorkOrder = (id: string, input: CompleteWorkOrderInput) =>
  leadsRepository.completeWorkOrder(id, input);
export const listNotifications = () => leadsRepository.listNotifications();
export const markNotificationRead = (id: string) => leadsRepository.markNotificationRead(id);
export const markAllRead = () => leadsRepository.markAllRead();
export const markAllNotificationsRead = () => leadsRepository.markAllNotificationsRead();
