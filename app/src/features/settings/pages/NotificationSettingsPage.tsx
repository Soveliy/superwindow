import { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  BellRing,
  BriefcaseBusiness,
  Clock3,
  Mail,
  MessageSquareText,
  RotateCcw,
  Smartphone,
  XCircle,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { authStorage } from '@/features/auth/model/auth-storage';
import {
  loadNotificationPreferencesRemote,
  saveNotificationPreferencesRemote,
} from '@/features/settings/api/notification-preferences-api';
import {
  getPushPermission,
  loadNotificationPreferences,
  requestPushPermission,
  saveNotificationPreferences,
  type NotificationChannel,
  type NotificationEvent,
} from '@/features/settings/model/notification-preferences';
import { Toggle } from '@/shared/ui/Toggle';
import { Button } from '@/shared/ui/Button';

const channelOptions: Array<{
  id: NotificationChannel;
  title: string;
  description: string;
  icon: typeof BellRing;
}> = [
  {
    id: 'inApp',
    title: 'В приложении',
    description: 'Центр уведомлений и счётчик новых событий.',
    icon: BellRing,
  },
  {
    id: 'push',
    title: 'Push-уведомления',
    description: 'Системные уведомления браузера и установленного PWA.',
    icon: Smartphone,
  },
  {
    id: 'sms',
    title: 'SMS',
    description: 'Критичные напоминания на телефон дилера.',
    icon: MessageSquareText,
  },
  {
    id: 'email',
    title: 'Email',
    description: 'Копии уведомлений и итоговые сообщения.',
    icon: Mail,
  },
];

const eventOptions: Array<{
  id: NotificationEvent;
  title: string;
  description: string;
  icon: typeof BellRing;
}> = [
  {
    id: 'newLead',
    title: 'Новые лиды',
    description: 'Появление нового подходящего лида на витрине.',
    icon: BellRing,
  },
  {
    id: 'deadlineReminder',
    title: 'Срок заполнения даты',
    description: 'Напоминания за 12 часов и за 1 час до возврата лида.',
    icon: Clock3,
  },
  {
    id: 'leadReturned',
    title: 'Лид возвращён',
    description: 'Дата не была заполнена в течение 24 часов.',
    icon: RotateCcw,
  },
  {
    id: 'workOrderChanged',
    title: 'Изменения заказа',
    description: 'Создание заказа, перенос даты и подтверждение выполнения.',
    icon: BriefcaseBusiness,
  },
  {
    id: 'workOrderCancelled',
    title: 'Отмена заказа',
    description: 'Заказ монтажа или доставки отменён заводом.',
    icon: XCircle,
  },
];

const getPushStatusLabel = (permission: ReturnType<typeof getPushPermission>): string | null => {
  if (permission === 'unsupported') {
    return 'Этот браузер не поддерживает push-уведомления.';
  }

  if (permission === 'denied') {
    return 'Уведомления запрещены в настройках браузера.';
  }

  if (permission === 'granted') {
    return 'Разрешение браузера получено.';
  }

  return 'При включении браузер запросит разрешение.';
};

export const NotificationSettingsPage = () => {
  const navigate = useNavigate();
  const session = authStorage.getSession();
  const [preferences, setPreferences] = useState(loadNotificationPreferences);
  const [pushPermission, setPushPermission] = useState(getPushPermission);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    let active = true;
    const localPreferences = loadNotificationPreferences();

    void loadNotificationPreferencesRemote(localPreferences)
      .then((result) => {
        if (!active) {
          return;
        }
        const nextPreferences = saveNotificationPreferences(result.preferences);
        setPreferences(nextPreferences);
        setSyncError(
          result.remote && !result.persistent
            ? 'Серверное хранилище настроек ещё не установлено; пока используются значения по умолчанию.'
            : null,
        );
      })
      .catch(() => {
        if (active) {
          setSyncError('Не удалось загрузить серверные настройки. Проверьте соединение и повторите позже.');
        }
      })
      .finally(() => {
        if (active) {
          setIsLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, []);

  const deliveryHint = useMemo(() => {
    const destinations = [session?.dealerEmail ? `email: ${session.dealerEmail}` : null, 'SMS: номер из профиля дилера']
      .filter(Boolean)
      .join(' · ');

    return destinations || 'Контакты будут взяты из профиля дилера.';
  }, [session?.dealerEmail]);

  const toggleChannel = async (channel: NotificationChannel): Promise<void> => {
    setSaveMessage(null);
    setSyncError(null);

    if (channel === 'push' && !preferences.channels.push) {
      const permission = await requestPushPermission();
      setPushPermission(permission);

      if (permission !== 'granted') {
        return;
      }
    }

    setPreferences((current) => ({
      ...current,
      channels: {
        ...current.channels,
        [channel]: !current.channels[channel],
      },
    }));
  };

  const toggleEvent = (event: NotificationEvent): void => {
    setSaveMessage(null);
    setSyncError(null);
    setPreferences((current) => ({
      ...current,
      events: {
        ...current.events,
        [event]: !current.events[event],
      },
    }));
  };

  const handleSave = async (): Promise<void> => {
    setIsSaving(true);
    setSyncError(null);
    const nextPreferences = saveNotificationPreferences(preferences);
    setPreferences(nextPreferences);
    try {
      const result = await saveNotificationPreferencesRemote(nextPreferences);
      const normalized = saveNotificationPreferences(result.preferences);
      setPreferences(normalized);
      setSaveMessage(
        result.remote
          ? 'Настройки уведомлений сохранены для вашего профиля.'
          : 'Настройки сохранены на этом устройстве. Серверный модуль пока работает в демо-режиме.',
      );
    } catch {
      setSaveMessage(null);
      setSyncError('Настройки сохранены на устройстве, но сервер не подтвердил изменения. Повторите попытку при стабильном соединении.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-page px-2 py-3">
      <main className="mx-auto w-full max-w-[576px] rounded-xl bg-surface shadow-panel">
        <section className="px-4 pb-8 pt-5">
          <header className="mb-5 grid grid-cols-[40px_1fr_40px] items-center">
            <button
              type="button"
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-ink-700 transition-colors hover:bg-slate-100"
              onClick={() => navigate('/settings')}
              aria-label="Вернуться к настройкам"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
            <h1 className="text-center text-xl font-extrabold tracking-tight text-ink-800">Уведомления</h1>
            <span />
          </header>

          <div className="mb-5 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
            <p className="text-sm font-semibold text-ink-800">Куда отправлять</p>
            <p className="mt-1 text-xs leading-5 text-slate-500">{deliveryHint}</p>
          </div>

          <section aria-labelledby="notification-channels-title">
            <h2 id="notification-channels-title" className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">
              Каналы
            </h2>
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-50">
              {channelOptions.map((option, index) => {
                const Icon = option.icon;
                const checked = preferences.channels[option.id];
                const pushUnavailable =
                  option.id === 'push' &&
                  !checked &&
                  (pushPermission === 'unsupported' || pushPermission === 'denied');

                return (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => void toggleChannel(option.id)}
                    disabled={isLoading || isSaving || pushUnavailable}
                    className={`flex w-full items-center gap-3 px-3 py-3 text-left transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-55 ${
                      index > 0 ? 'border-t border-slate-200' : ''
                    }`}
                    aria-pressed={checked}
                  >
                    <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-surface text-brand-600">
                      <Icon className="h-5 w-5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold text-ink-800">{option.title}</span>
                      <span className="mt-0.5 block text-xs leading-4 text-slate-500">{option.description}</span>
                      {option.id === 'push' ? (
                        <span className="mt-1 block text-[11px] font-medium text-slate-400">
                          {getPushStatusLabel(pushPermission)}
                        </span>
                      ) : null}
                    </span>
                    <Toggle checked={checked} />
                  </button>
                );
              })}
            </div>
          </section>

          <section className="mt-6" aria-labelledby="notification-events-title">
            <h2 id="notification-events-title" className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">
              События
            </h2>
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-50">
              {eventOptions.map((option, index) => {
                const Icon = option.icon;
                const checked = preferences.events[option.id];

                return (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => toggleEvent(option.id)}
                    disabled={isLoading || isSaving}
                    className={`flex w-full items-center gap-3 px-3 py-3 text-left transition-colors hover:bg-slate-100 ${
                      index > 0 ? 'border-t border-slate-200' : ''
                    }`}
                    aria-pressed={checked}
                  >
                    <Icon className="h-5 w-5 shrink-0 text-brand-600" />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold text-ink-800">{option.title}</span>
                      <span className="mt-0.5 block text-xs leading-4 text-slate-500">{option.description}</span>
                    </span>
                    <Toggle checked={checked} />
                  </button>
                );
              })}
            </div>
          </section>

          <p className="mt-4 text-xs leading-5 text-slate-500">
            SMS, email и серверная отправка push начнут работать после подключения реквизитов каналов. Внутренние уведомления уже доступны в интерфейсе.
          </p>

          {saveMessage ? (
            <p role="status" className="mt-4 rounded-xl border border-slate-300 bg-slate-100 px-3 py-2 text-sm font-semibold text-ink-700">
              {saveMessage}
            </p>
          ) : null}

          {syncError ? (
            <p role="alert" className="mt-4 rounded-xl border border-error/40 bg-error/10 px-3 py-2 text-sm font-semibold text-error">
              {syncError}
            </p>
          ) : null}

          <Button className="mt-5" onClick={() => void handleSave()} disabled={isLoading || isSaving}>
            {isSaving ? 'Сохраняем…' : isLoading ? 'Загружаем…' : 'Сохранить настройки'}
          </Button>
        </section>
      </main>
    </div>
  );
};
