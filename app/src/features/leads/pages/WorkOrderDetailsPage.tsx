import { useCallback, useEffect, useRef, useState } from 'react';
import {
  BellRing,
  CalendarClock,
  CheckCircle2,
  CircleDollarSign,
  ClipboardCheck,
  LoaderCircle,
  MapPin,
  Package,
  Phone,
  PlayCircle,
  UserRound,
  Warehouse,
} from 'lucide-react';
import { useParams } from 'react-router-dom';
import {
  completeWorkOrder,
  getWorkOrder,
  LeadsRepositoryError,
  updateWorkOrder,
  type ScheduledVisit,
  type WorkOrderDetails,
  type WorkPhotoInput,
} from '@/features/leads';
import { ConfirmDialog } from '@/features/leads/ui/ConfirmDialog';
import { LeadBadge } from '@/features/leads/ui/LeadBadges';
import { DefinitionItem, DetailSection } from '@/features/leads/ui/LeadDetailsSection';
import { LeadPageFrame } from '@/features/leads/ui/LeadPageFrame';
import { ErrorState, InlineNotice, LoadingState } from '@/features/leads/ui/LeadUiState';
import { MapPreview, RoutePreview } from '@/features/leads/ui/MapPreview';
import { PhotoUploader } from '@/features/leads/ui/PhotoUploader';
import { ScheduleDialog } from '@/features/leads/ui/ScheduleDialog';
import { formatCompactDate, formatLeadDate, formatMoney, todayIsoDate } from '@/features/leads/ui/leads-format';
import { getLeadsErrorMessage } from '@/features/leads/ui/leads-errors';
import { cn } from '@/shared/lib/cn';

const workButtonClassName =
  'inline-flex min-h-14 w-full items-center justify-center gap-2 rounded px-4 text-base font-extrabold text-white shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60';
const primaryButtonClassName = `${workButtonClassName} bg-[#05264b] hover:bg-[#0a3b70]`;

const getAddress = (location: WorkOrderDetails['destination']): string =>
  location.address || [location.city, location.region].filter(Boolean).join(', ');

export const WorkOrderDetailsPage = () => {
  const { workOrderId } = useParams<{ workOrderId: string }>();
  const [workOrder, setWorkOrder] = useState<WorkOrderDetails | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [pageError, setPageError] = useState('');
  const [actionError, setActionError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [isPending, setIsPending] = useState(false);
  const [isScheduleOpen, setScheduleOpen] = useState(false);
  const [isCompletionConfirmOpen, setCompletionConfirmOpen] = useState(false);
  const [actualDate, setActualDate] = useState('');
  const [newPhotos, setNewPhotos] = useState<WorkPhotoInput[]>([]);
  const [completionValidationError, setCompletionValidationError] = useState('');
  const loadSequenceRef = useRef(0);

  const load = useCallback(async () => {
    const sequence = ++loadSequenceRef.current;
    if (!workOrderId) {
      setPageError('Не указан идентификатор задания.');
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setPageError('');
    try {
      const loadedWorkOrder = await getWorkOrder(workOrderId);
      if (sequence === loadSequenceRef.current) {
        setWorkOrder(loadedWorkOrder);
        setActualDate(loadedWorkOrder.actualDate ?? '');
      }
    } catch (caughtError) {
      if (sequence === loadSequenceRef.current) {
        setPageError(getLeadsErrorMessage(caughtError, 'Не удалось загрузить задание.'));
      }
    } finally {
      if (sequence === loadSequenceRef.current) {
        setIsLoading(false);
      }
    }
  }, [workOrderId]);

  useEffect(() => {
    setWorkOrder(null);
    setActionError('');
    setSuccessMessage('');
    setScheduleOpen(false);
    setCompletionConfirmOpen(false);
    setActualDate('');
    setNewPhotos([]);
    setCompletionValidationError('');
    void load();
    return () => {
      loadSequenceRef.current += 1;
    };
  }, [load]);

  const savePlannedVisit = async (visit: ScheduledVisit) => {
    if (!workOrderId || !workOrder) {
      return;
    }

    setIsPending(true);
    setActionError('');
    setSuccessMessage('');
    try {
      const updated = await updateWorkOrder(workOrderId, {
        plannedVisit: visit,
        expectedVersion: workOrder.version,
      });
      setWorkOrder(updated);
      setScheduleOpen(false);
      setSuccessMessage('Плановая дата и временной интервал сохранены.');
    } catch (caughtError) {
      if (caughtError instanceof LeadsRepositoryError && caughtError.code === 'conflict') {
        setScheduleOpen(false);
        setActionError('Задание изменилось в другой вкладке. Данные обновлены.');
        await load();
      } else {
        setActionError(getLeadsErrorMessage(caughtError, 'Не удалось изменить плановую дату.'));
      }
    } finally {
      setIsPending(false);
    }
  };

  const requestCompletion = () => {
    setCompletionValidationError('');
    setActionError('');

    if (!actualDate) {
      setCompletionValidationError('Укажите фактическую дату выполнения.');
      return;
    }

    if (newPhotos.length < 1) {
      setCompletionValidationError('Добавьте минимум одно фото выполненной работы.');
      return;
    }

    setCompletionConfirmOpen(true);
  };

  const startCurrentWorkOrder = async () => {
    if (!workOrderId || !workOrder || workOrder.status !== 'assigned') {
      return;
    }

    setIsPending(true);
    setActionError('');
    setSuccessMessage('');
    try {
      const updated = await updateWorkOrder(workOrderId, {
        status: 'in_work',
        expectedVersion: workOrder.version,
      });
      setWorkOrder(updated);
      setSuccessMessage('Работа начата. После выполнения укажите фактическую дату и добавьте фотоотчёт.');
    } catch (caughtError) {
      if (caughtError instanceof LeadsRepositoryError && caughtError.code === 'conflict') {
        setActionError('Задание изменилось в другой вкладке. Данные обновлены.');
        await load();
      } else {
        setActionError(getLeadsErrorMessage(caughtError, 'Не удалось начать работу.'));
      }
    } finally {
      setIsPending(false);
    }
  };

  const completeCurrentWorkOrder = async () => {
    if (!workOrderId || !workOrder) {
      return;
    }

    setIsPending(true);
    setActionError('');
    try {
      const updated = await completeWorkOrder(workOrderId, {
        actualDate,
        photos: newPhotos,
        expectedVersion: workOrder.version,
      });
      setWorkOrder(updated);
      setNewPhotos([]);
      setCompletionConfirmOpen(false);
      setSuccessMessage('Работа отмечена выполненной. Фотоотчёт отправлен заводу.');
    } catch (caughtError) {
      setCompletionConfirmOpen(false);
      if (caughtError instanceof LeadsRepositoryError && caughtError.code === 'conflict') {
        setActionError('Задание уже изменилось. Мы обновили данные — проверьте статус.');
        await load();
      } else {
        setActionError(getLeadsErrorMessage(caughtError, 'Не удалось завершить работу.'));
      }
    } finally {
      setIsPending(false);
    }
  };

  const isEditable = workOrder?.status === 'assigned' || workOrder?.status === 'in_work';
  const isDelivery = workOrder?.type === 'delivery';

  const footer =
    workOrder?.status === 'assigned' ? (
      <button type="button" onClick={() => void startCurrentWorkOrder()} disabled={isPending} className={primaryButtonClassName}>
        {isPending ? (
          <LoaderCircle className="h-5 w-5 animate-spin" aria-hidden="true" />
        ) : (
          <PlayCircle className="h-5 w-5" aria-hidden="true" />
        )}
        Начать работу
      </button>
    ) : workOrder?.status === 'in_work' ? (
      <button type="button" onClick={requestCompletion} disabled={isPending} className={cn(workButtonClassName, isDelivery ? 'bg-emerald-500 hover:bg-emerald-600' : 'bg-[#05264b] hover:bg-[#0a3b70]')}>
        {isPending ? (
          <LoaderCircle className="h-5 w-5 animate-spin" aria-hidden="true" />
        ) : (
          <CheckCircle2 className="h-5 w-5" aria-hidden="true" />
        )}
        Отметить выполненным
      </button>
    ) : null;

  return (
    <LeadPageFrame title="Детали лида" backTo="/work-orders" footer={isDelivery ? footer : undefined}>
      {isLoading ? <LoadingState label="Загружаем задание…" /> : null}
      {!isLoading && pageError ? <ErrorState message={pageError} onRetry={() => void load()} /> : null}

      {!isLoading && !pageError && workOrder ? (
        <div className="space-y-4">
          <section className={isDelivery ? 'rounded-lg border border-slate-300 bg-surface p-4 shadow-sm' : 'pb-2'}>
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-xl font-extrabold tracking-tight text-ink-800">{isDelivery ? '' : 'Заказ '}{workOrder.displayId}</p>
              <LeadBadge value={workOrder.type} kind="service" />
              <LeadBadge value={workOrder.status} kind="status" className="ml-auto" />
            </div>
            <p className="mt-2 text-xs text-slate-500">Создано {formatLeadDate(workOrder.createdAt, true)}</p>
          </section>

          {successMessage ? (
            <InlineNotice tone="success">
              <span className="inline-flex items-start gap-2">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                {successMessage}
              </span>
            </InlineNotice>
          ) : null}
          {actionError ? <InlineNotice tone="error">{actionError}</InlineNotice> : null}
          {workOrder.cancellationReason ? (
            <InlineNotice tone="error">Задание отменено: {workOrder.cancellationReason}</InlineNotice>
          ) : null}

          <DetailSection title={isDelivery ? 'Клиент' : 'Клиент и объект'} icon={UserRound} variant="work">
            <dl className="grid gap-3">
              <DefinitionItem label={isDelivery ? 'Клиент' : 'ФИО'}>{workOrder.customer.name}</DefinitionItem>
              <DefinitionItem label="Телефон">
                <a
                  href={`tel:${workOrder.customer.phone.replace(/[^+\d]/g, '')}`}
                  className="inline-flex items-center gap-1.5 font-semibold text-ink-800 hover:underline"
                >
                  <Phone className="h-4 w-4" aria-hidden="true" />
                  {workOrder.customer.phone}
                </a>
              </DefinitionItem>
              {!isDelivery ? <DefinitionItem label="Адрес">{getAddress(workOrder.destination)}</DefinitionItem> : null}
              <DefinitionItem label={isDelivery ? 'Товар' : 'Продукт'} className={isDelivery ? 'border-t border-slate-300 pt-3' : undefined}>{workOrder.product}</DefinitionItem>
              {workOrder.comment ? (
                <DefinitionItem label="Комментарий" className="border border-slate-300 bg-slate-100 px-2 py-2">
                  <span className={isDelivery ? undefined : 'italic'}>{workOrder.comment}</span>
                </DefinitionItem>
              ) : null}
            </dl>
          </DetailSection>

          {isDelivery && workOrder.warehouse ? (
            <DetailSection title="Адрес склада" icon={Warehouse}>
              <p className="mb-5 text-sm leading-relaxed text-ink-700">{getAddress(workOrder.warehouse)}</p>
              <RoutePreview origin={workOrder.warehouse} destination={workOrder.destination} route={workOrder.route} />
              <div className="mt-5">
                <p className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-600">
                  <MapPin className="h-5 w-5 shrink-0" aria-hidden="true" />
                  Адрес точки назначения
                </p>
                <p className="mt-2 text-sm leading-relaxed text-ink-700">{getAddress(workOrder.destination)}</p>
              </div>
            </DetailSection>
          ) : isDelivery ? (
            <DetailSection title="Место выполнения" icon={MapPin}>
              <p className="mb-3 text-sm font-medium text-ink-700">{getAddress(workOrder.destination)}</p>
              <MapPreview location={workOrder.destination} />
            </DetailSection>
          ) : null}

          {workOrder.reminder ? (
            <InlineNotice tone="info">
              <span className="inline-flex items-start gap-2">
                <BellRing className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                <span>
                  <strong className="block">Напоминание</strong>
                  {workOrder.reminder.message} ({workOrder.reminder.minutesBefore} мин. до визита)
                </span>
              </span>
            </InlineNotice>
          ) : null}

          <DetailSection title="Вознаграждение дилера" icon={CircleDollarSign} variant="work">
            <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Сумма вознаграждения</p>
            <p className="mt-1 text-2xl font-extrabold text-ink-800">{formatMoney(workOrder.reward)}</p>
            <p className="mt-2 text-xs leading-relaxed text-slate-500">
              Будет начислено после успешного завершения работы и проверки фотоотчёта.
            </p>
          </DetailSection>

          <DetailSection
            title="Планирование"
            icon={CalendarClock}
            variant="work"
          >
            <div className="grid grid-cols-[1fr_auto] items-end gap-4 border border-slate-300 bg-slate-100 px-2 py-2.5">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Плановая дата</p>
                <p className="mt-1 text-lg font-extrabold text-ink-800">{formatCompactDate(workOrder.plannedVisit?.date)}</p>
              </div>
              <div className="text-right">
                <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Время</p>
                <p className="mt-1 font-semibold text-ink-700">
                  {workOrder.plannedVisit?.timeFrom
                    ? workOrder.plannedVisit.timeTo
                      ? `${workOrder.plannedVisit.timeFrom}–${workOrder.plannedVisit.timeTo}`
                      : workOrder.plannedVisit.timeFrom
                    : 'Не указано'}
                </p>
              </div>
            </div>
            {isEditable ? (
              <button type="button" onClick={() => setScheduleOpen(true)} className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded border border-ink-800 px-3 text-sm font-semibold text-ink-800 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400">
                <CalendarClock className="h-4 w-4" aria-hidden="true" />
                {workOrder.plannedVisit ? 'Изменить дату' : 'Задать дату'}
              </button>
            ) : null}
          </DetailSection>

          <DetailSection title="Исполнение" icon={ClipboardCheck} variant="work">
            {workOrder.status === 'in_work' ? (
              <div className="space-y-4">
                <label className="block">
                  <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Фактическая дата выполнения *</span>
                  <input
                    type="date"
                    value={actualDate}
                    max={todayIsoDate()}
                    onChange={(event) => {
                      setActualDate(event.target.value);
                      setCompletionValidationError('');
                    }}
                    className="mt-1 h-11 w-full rounded-sm border border-slate-300 bg-surface px-3 text-sm font-semibold text-ink-800 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
                    required
                  />
                </label>
                <div>
                  <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">Фотоотчёт (обязательно) *</p>
                  <PhotoUploader
                    value={newPhotos}
                    onChange={(photos) => {
                      setNewPhotos(photos);
                      setCompletionValidationError('');
                    }}
                    disabled={isPending}
                  />
                </div>
                {completionValidationError ? (
                  <p className="text-sm font-semibold text-error" role="alert">{completionValidationError}</p>
                ) : null}
              </div>
            ) : workOrder.status === 'assigned' ? (
              <InlineNotice tone="info">
                Нажмите «Начать работу», когда приступите к монтажу или доставке. После этого станет доступен фотоотчёт.
              </InlineNotice>
            ) : workOrder.status === 'done' ? (
              <div>
                <dl className="grid gap-4 sm:grid-cols-2">
                  <DefinitionItem label="Фактическая дата">{formatCompactDate(workOrder.actualDate)}</DefinitionItem>
                  <DefinitionItem label="Завершено">{formatLeadDate(workOrder.completedAt, true)}</DefinitionItem>
                </dl>
                {workOrder.photos.length > 0 ? (
                  <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3" aria-label="Фотоотчёт">
                    {workOrder.photos.map((photo, index) => (
                      <li key={photo.id}>
                        <a href={photo.url} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-xl border border-slate-300">
                          <img
                            src={photo.thumbnailUrl || photo.url}
                            alt={`Фотоотчёт ${index + 1}: ${photo.name}`}
                            className="aspect-square w-full object-cover"
                            loading="lazy"
                          />
                        </a>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-3 text-sm text-slate-500">Фотоотчёт недоступен.</p>
                )}
              </div>
            ) : (
              <p className="text-sm text-slate-500">Отменённое задание нельзя отметить выполненным.</p>
            )}
            {!isDelivery && footer ? <div className="mt-6">{footer}</div> : null}
          </DetailSection>

          <p className="inline-flex items-center gap-1.5 px-1 text-xs text-slate-500">
            <Package className="h-3.5 w-3.5" aria-hidden="true" />
            Последнее изменение {formatLeadDate(workOrder.updatedAt, true)}
          </p>
        </div>
      ) : null}

      {isScheduleOpen && workOrder ? (
        <ScheduleDialog
          serviceType={workOrder.type}
          initialValue={workOrder.plannedVisit}
          isPending={isPending}
          serverError={actionError}
          onSubmit={(visit) => void savePlannedVisit(visit)}
          onClose={() => setScheduleOpen(false)}
        />
      ) : null}

      {isCompletionConfirmOpen && workOrder ? (
        <ConfirmDialog
          title="Завершить работу?"
          description={`Будет зафиксирована дата ${formatCompactDate(actualDate)} и отправлено фото: ${newPhotos.length}. После подтверждения изменить отчёт нельзя.`}
          confirmLabel="Завершить"
          onConfirm={() => void completeCurrentWorkOrder()}
          onCancel={() => setCompletionConfirmOpen(false)}
          isPending={isPending}
        />
      ) : null}
    </LeadPageFrame>
  );
};
