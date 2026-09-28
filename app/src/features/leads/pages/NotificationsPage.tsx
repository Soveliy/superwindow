import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Bell,
  BellRing,
  CheckCheck,
  CircleCheck,
  Clock3,
  Mail,
  MessageSquareText,
  PackageCheck,
  Radio,
  Smartphone,
  Undo2,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import {
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  type AppNotification,
  type NotificationChannel,
} from '@/features/leads';
import { LeadPageFrame } from '@/features/leads/ui/LeadPageFrame';
import { EmptyState, ErrorState, LoadingState } from '@/features/leads/ui/LeadUiState';
import { formatLeadDate } from '@/features/leads/ui/leads-format';
import { getLeadsErrorMessage } from '@/features/leads/ui/leads-errors';

const channelLabels: Record<NotificationChannel, string> = {
  in_app: 'В приложении',
  push: 'Push',
  sms: 'SMS',
  email: 'Email',
};

const deliveryStatusLabels = {
  sent: 'Отправлено',
  pending: 'В очереди',
  failed: 'Ошибка',
} as const;

const channelIcons = {
  in_app: Bell,
  push: Smartphone,
  sms: MessageSquareText,
  email: Mail,
} as const;

const notificationIcons = {
  lead_available: Radio,
  lead_taken: CircleCheck,
  lead_schedule_due: Clock3,
  lead_returned: Undo2,
  work_order_assigned: BellRing,
  work_order_due: Clock3,
  work_order_completed: PackageCheck,
  work_order_cancelled: Undo2,
} as const;

const getTarget = (notification: AppNotification): string | null => {
  if (notification.workOrderId) {
    return `/work-orders/${notification.workOrderId}`;
  }

  if (notification.leadId) {
    return `/leads/${notification.leadId}`;
  }

  return null;
};

export const NotificationsPage = () => {
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [isMarkingAll, setMarkingAll] = useState(false);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError('');
    try {
      setNotifications(await listNotifications());
    } catch (caughtError) {
      setError(getLeadsErrorMessage(caughtError, 'Не удалось загрузить уведомления.'));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const unreadCount = useMemo(() => notifications.filter((notification) => !notification.readAt).length, [notifications]);

  const openNotification = async (notification: AppNotification) => {
    const target = getTarget(notification);
    if (!notification.readAt) {
      setPendingId(notification.id);
      try {
        const updated = await markNotificationRead(notification.id);
        setNotifications((items) => items.map((item) => (item.id === updated.id ? updated : item)));
      } catch (caughtError) {
        setError(getLeadsErrorMessage(caughtError, 'Не удалось отметить уведомление прочитанным.'));
        setPendingId(null);
        return;
      }
      setPendingId(null);
    }

    if (target) {
      navigate(target);
    }
  };

  const markAllRead = async () => {
    setMarkingAll(true);
    setError('');
    try {
      setNotifications(await markAllNotificationsRead());
    } catch (caughtError) {
      setError(getLeadsErrorMessage(caughtError, 'Не удалось отметить уведомления прочитанными.'));
    } finally {
      setMarkingAll(false);
    }
  };

  return (
    <LeadPageFrame title="Уведомления" backTo="/leads">
      <div className="mb-4 flex items-center justify-between gap-3">
        <p className="text-sm text-slate-500">
          {unreadCount > 0 ? `Непрочитанных: ${unreadCount}` : 'Все уведомления прочитаны'}
        </p>
        {unreadCount > 0 ? (
          <button
            type="button"
            onClick={() => void markAllRead()}
            disabled={isMarkingAll}
            className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-slate-300 bg-surface px-3 text-xs font-semibold text-ink-700 hover:bg-slate-100 disabled:opacity-60"
          >
            <CheckCheck className="h-4 w-4" aria-hidden="true" />
            Прочитать все
          </button>
        ) : null}
      </div>

      {isLoading ? <LoadingState label="Загружаем уведомления…" /> : null}
      {!isLoading && error ? <ErrorState message={error} onRetry={() => void load()} compact /> : null}
      {!isLoading && !error && notifications.length === 0 ? (
        <EmptyState title="Уведомлений пока нет" message="Здесь появятся новые лиды, напоминания и изменения по вашим работам." />
      ) : null}

      {!isLoading && notifications.length > 0 ? (
        <ul className="space-y-3" aria-live="polite">
          {notifications.map((notification) => {
            const Icon = notificationIcons[notification.type];
            const target = getTarget(notification);

            return (
              <li key={notification.id}>
                <article
                  className={`relative overflow-hidden rounded-2xl border p-4 transition-colors ${
                    notification.readAt
                      ? 'border-slate-200 bg-slate-50'
                      : 'border-brand-300 bg-brand-50'
                  }`}
                >
                  {!notification.readAt ? (
                    <span className="absolute right-3 top-3 h-2.5 w-2.5 rounded-full bg-error" aria-label="Непрочитано" />
                  ) : null}
                  <div className="flex items-start gap-3 pr-4">
                    <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-surface text-ink-700 shadow-sm">
                      <Icon className="h-5 w-5" aria-hidden="true" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <h2 className="pr-2 text-sm font-extrabold text-ink-800">{notification.title}</h2>
                      <p className="mt-1 text-sm leading-relaxed text-slate-600">{notification.message}</p>
                      <p className="mt-2 text-xs text-slate-500">{formatLeadDate(notification.createdAt, true)}</p>
                    </div>
                  </div>

                  {notification.deliveries.length > 0 ? (
                    <ul className="mt-3 flex flex-wrap gap-1.5" aria-label="Каналы доставки">
                      {notification.deliveries.map((delivery) => {
                        const ChannelIcon = channelIcons[delivery.channel];
                        return (
                          <li
                            key={delivery.channel}
                            className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[10px] font-semibold ${
                              delivery.status === 'failed'
                                ? 'border-error/30 bg-error/10 text-error'
                                : delivery.status === 'sent'
                                  ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700'
                                  : 'border-slate-300 bg-surface text-slate-500'
                            }`}
                          >
                            <ChannelIcon className="h-3 w-3" aria-hidden="true" />
                            {channelLabels[delivery.channel]} · {deliveryStatusLabels[delivery.status]}
                          </li>
                        );
                      })}
                    </ul>
                  ) : null}

                  <button
                    type="button"
                    onClick={() => void openNotification(notification)}
                    disabled={pendingId === notification.id}
                    className="mt-3 w-full rounded-xl border border-slate-300 bg-surface px-3 py-2 text-sm font-semibold text-ink-700 transition-colors hover:bg-slate-100 disabled:opacity-60"
                  >
                    {target ? 'Открыть' : notification.readAt ? 'Прочитано' : 'Отметить прочитанным'}
                  </button>
                </article>
              </li>
            );
          })}
        </ul>
      ) : null}
    </LeadPageFrame>
  );
};
