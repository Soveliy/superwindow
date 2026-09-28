import { authStorage } from '@/features/auth/model/auth-storage';
import {
  type NotificationChannel,
  type NotificationEvent,
  type NotificationPreferences,
} from '@/features/settings/model/notification-preferences';
import { LocalAjaxError, postLocalAjaxJson } from '@/shared/api/local-ajax';

const PREFERENCES_GET_PATH = '/local/rest/api/v1/?action=lead_notification_preferences_get';
const PREFERENCES_UPDATE_PATH = '/local/rest/api/v1/?action=lead_notification_preferences_update';

const channelKeys: Record<NotificationChannel, string> = {
  inApp: 'in_app',
  push: 'push',
  sms: 'sms',
  email: 'email',
};

const eventKeys: Record<NotificationEvent, string> = {
  newLead: 'new_lead',
  deadlineReminder: 'deadline_reminder',
  leadReturned: 'lead_returned',
  workOrderChanged: 'work_order',
  workOrderCancelled: 'cancelled',
};

const channels = Object.keys(channelKeys) as NotificationChannel[];
const events = Object.keys(eventKeys) as NotificationEvent[];

type UnknownRecord = Record<string, unknown>;

export interface NotificationPreferencesSyncResult {
  preferences: NotificationPreferences;
  remote: boolean;
  persistent: boolean;
}

const isRecord = (value: unknown): value is UnknownRecord =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const getRemoteCode = (payload: unknown): string | undefined => {
  if (!isRecord(payload)) {
    return undefined;
  }

  const error = isRecord(payload.error) ? payload.error : payload;
  return typeof error.code === 'string' ? error.code : undefined;
};

const isEndpointUnavailable = (error: unknown): boolean => {
  if (!(error instanceof LocalAjaxError)) {
    return false;
  }

  const code = getRemoteCode(error.payload);
  return (
    error.status === 404 ||
    error.status === 405 ||
    error.status === 501 ||
    code === 'storage_not_configured' ||
    code === 'storage_schema_error' ||
    code === 'action_not_found' ||
    code === 'not_implemented'
  );
};

const handleExpiredSession = (error: unknown): void => {
  if (!(error instanceof LocalAjaxError)) {
    return;
  }

  const code = getRemoteCode(error.payload);
  if (error.status !== 401 && code !== 'authentication_required' && code !== 'csrf_failed') {
    return;
  }

  authStorage.clearSession();
  if (typeof window !== 'undefined') {
    const appBaseUrl = new URL(import.meta.env.BASE_URL, window.location.origin);
    window.location.assign(new URL('login', appBaseUrl).href);
  }
};

const configuredMode = String(import.meta.env.VITE_LEADS_DATA_SOURCE ?? '').trim().toLowerCase();
const isDemoMode = !import.meta.env.PROD && configuredMode === 'demo';
const canUseLocalFallback = !import.meta.env.PROD && configuredMode !== 'remote';

const unwrapData = (response: unknown): UnknownRecord => {
  if (!isRecord(response)) {
    throw new Error('Сервер вернул некорректные настройки уведомлений.');
  }

  if (response.success === false) {
    const error = isRecord(response.error) ? response.error : response;
    throw new Error(typeof error.message === 'string' ? error.message : 'Не удалось сохранить настройки уведомлений.');
  }

  const data = isRecord(response.data) ? response.data : response;
  if (!isRecord(data.preferences)) {
    throw new Error('Сервер вернул некорректную матрицу уведомлений.');
  }

  return data;
};

const toServerMatrix = (preferences: NotificationPreferences): UnknownRecord =>
  Object.fromEntries(
    channels.map((channel) => [
      channelKeys[channel],
      Object.fromEntries(
        events.map((event) => [eventKeys[event], preferences.channels[channel] && preferences.events[event]]),
      ),
    ]),
  );

const fromServerMatrix = (
  matrix: UnknownRecord,
  fallback: NotificationPreferences,
  updatedAt?: unknown,
): NotificationPreferences => {
  const readValue = (channel: NotificationChannel, event: NotificationEvent): boolean => {
    const channelMatrix = matrix[channelKeys[channel]];
    return isRecord(channelMatrix) && channelMatrix[eventKeys[event]] === true;
  };

  const nextChannels = Object.fromEntries(
    channels.map((channel) => [channel, events.some((event) => readValue(channel, event))]),
  ) as Record<NotificationChannel, boolean>;
  const hasEnabledChannel = channels.some((channel) => nextChannels[channel]);
  const nextEvents = Object.fromEntries(
    events.map((event) => [
      event,
      hasEnabledChannel ? channels.some((channel) => readValue(channel, event)) : fallback.events[event],
    ]),
  ) as Record<NotificationEvent, boolean>;

  return {
    channels: nextChannels,
    events: nextEvents,
    updatedAt: typeof updatedAt === 'string' ? updatedAt : new Date().toISOString(),
  };
};

export const loadNotificationPreferencesRemote = async (
  fallback: NotificationPreferences,
): Promise<NotificationPreferencesSyncResult> => {
  if (isDemoMode) {
    return { preferences: fallback, remote: false, persistent: false };
  }

  try {
    const response = await postLocalAjaxJson({
      label: 'lead_notification_preferences_get',
      path: PREFERENCES_GET_PATH,
      payload: null,
      method: 'GET',
    });
    const data = unwrapData(response);

    return {
      preferences: fromServerMatrix(data.preferences as UnknownRecord, fallback, data.updatedAt),
      remote: true,
      persistent: data.persistent !== false,
    };
  } catch (error) {
    handleExpiredSession(error);
    if (canUseLocalFallback && isEndpointUnavailable(error)) {
      return { preferences: fallback, remote: false, persistent: false };
    }
    throw error;
  }
};

export const saveNotificationPreferencesRemote = async (
  preferences: NotificationPreferences,
): Promise<NotificationPreferencesSyncResult> => {
  if (isDemoMode) {
    return { preferences, remote: false, persistent: false };
  }

  try {
    const response = await postLocalAjaxJson({
      label: 'lead_notification_preferences_update',
      path: PREFERENCES_UPDATE_PATH,
      payload: { preferences: toServerMatrix(preferences) },
      csrfToken: authStorage.getSession()?.token,
    });
    const data = unwrapData(response);

    return {
      preferences: fromServerMatrix(data.preferences as UnknownRecord, preferences, data.updatedAt),
      remote: true,
      persistent: data.persistent !== false,
    };
  } catch (error) {
    handleExpiredSession(error);
    if (canUseLocalFallback && isEndpointUnavailable(error)) {
      return { preferences, remote: false, persistent: false };
    }
    throw error;
  }
};
