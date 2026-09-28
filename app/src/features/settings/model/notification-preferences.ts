export type NotificationChannel = 'inApp' | 'push' | 'sms' | 'email';

export type NotificationEvent =
  | 'newLead'
  | 'deadlineReminder'
  | 'leadReturned'
  | 'workOrderChanged'
  | 'workOrderCancelled';

export interface NotificationPreferences {
  channels: Record<NotificationChannel, boolean>;
  events: Record<NotificationEvent, boolean>;
  updatedAt: string;
}

const STORAGE_KEY = 'superwindow.notification-preferences.v1';

const createDefaultPreferences = (): NotificationPreferences => ({
  channels: {
    inApp: true,
    push: false,
    sms: false,
    email: false,
  },
  events: {
    newLead: true,
    deadlineReminder: true,
    leadReturned: true,
    workOrderChanged: true,
    workOrderCancelled: true,
  },
  updatedAt: new Date().toISOString(),
});

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

export const loadNotificationPreferences = (): NotificationPreferences => {
  const defaults = createDefaultPreferences();

  try {
    const rawValue = localStorage.getItem(STORAGE_KEY);

    if (!rawValue) {
      return defaults;
    }

    const value = JSON.parse(rawValue) as unknown;

    if (!isRecord(value) || !isRecord(value.channels) || !isRecord(value.events)) {
      return defaults;
    }

    return {
      channels: {
        inApp: typeof value.channels.inApp === 'boolean' ? value.channels.inApp : defaults.channels.inApp,
        push: typeof value.channels.push === 'boolean' ? value.channels.push : defaults.channels.push,
        sms: typeof value.channels.sms === 'boolean' ? value.channels.sms : defaults.channels.sms,
        email: typeof value.channels.email === 'boolean' ? value.channels.email : defaults.channels.email,
      },
      events: {
        newLead: typeof value.events.newLead === 'boolean' ? value.events.newLead : defaults.events.newLead,
        deadlineReminder:
          typeof value.events.deadlineReminder === 'boolean'
            ? value.events.deadlineReminder
            : defaults.events.deadlineReminder,
        leadReturned:
          typeof value.events.leadReturned === 'boolean' ? value.events.leadReturned : defaults.events.leadReturned,
        workOrderChanged:
          typeof value.events.workOrderChanged === 'boolean'
            ? value.events.workOrderChanged
            : defaults.events.workOrderChanged,
        workOrderCancelled:
          typeof value.events.workOrderCancelled === 'boolean'
            ? value.events.workOrderCancelled
            : defaults.events.workOrderCancelled,
      },
      updatedAt: typeof value.updatedAt === 'string' ? value.updatedAt : defaults.updatedAt,
    };
  } catch {
    return defaults;
  }
};

export const saveNotificationPreferences = (
  preferences: NotificationPreferences,
): NotificationPreferences => {
  const nextPreferences = {
    ...preferences,
    updatedAt: new Date().toISOString(),
  };

  localStorage.setItem(STORAGE_KEY, JSON.stringify(nextPreferences));

  return nextPreferences;
};

export const getPushPermission = (): NotificationPermission | 'unsupported' => {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported';
  }

  return Notification.permission;
};

export const requestPushPermission = async (): Promise<NotificationPermission | 'unsupported'> => {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported';
  }

  return Notification.requestPermission();
};
