import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Building2,
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  FileText,
  LockKeyhole,
  MapPin,
  Package,
  Phone,
  UserRound,
} from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  getLead,
  LeadsRepositoryError,
  scheduleLead,
  takeLead,
  type LeadDetails,
  type ScheduledVisit,
} from '@/features/leads';
import { AttachmentsPanel } from '@/features/leads/ui/AttachmentsPanel';
import { ConfirmDialog } from '@/features/leads/ui/ConfirmDialog';
import { LeadBadge } from '@/features/leads/ui/LeadBadges';
import { DefinitionItem, DetailSection } from '@/features/leads/ui/LeadDetailsSection';
import { LeadPageFrame } from '@/features/leads/ui/LeadPageFrame';
import { ErrorState, InlineNotice, LoadingState } from '@/features/leads/ui/LeadUiState';
import { MapPreview } from '@/features/leads/ui/MapPreview';
import { ScheduleDialog } from '@/features/leads/ui/ScheduleDialog';
import { formatLeadDate, formatMoney, formatMoneyRange, formatVisit, getScheduleDeadlineLabel } from '@/features/leads/ui/leads-format';
import { getLeadsErrorMessage } from '@/features/leads/ui/leads-errors';

const primaryButtonClassName =
  'inline-flex min-h-[60px] w-full items-center justify-center gap-2 rounded bg-[#05264b] px-4 text-lg font-extrabold uppercase tracking-wide text-white shadow-sm transition-colors hover:bg-[#0a3b70] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60';

const visitDateLabels: Record<LeadDetails['serviceType'], string> = {
  measurement: 'Дата замера',
  installation: 'Дата монтажа',
  delivery: 'Дата доставки',
};

export const LeadDetailsPage = () => {
  const { leadId } = useParams<{ leadId: string }>();
  const navigate = useNavigate();
  const [lead, setLead] = useState<LeadDetails | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [pageError, setPageError] = useState('');
  const [actionError, setActionError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [isTakeConfirmOpen, setTakeConfirmOpen] = useState(false);
  const [isScheduleOpen, setScheduleOpen] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const loadSequenceRef = useRef(0);

  const load = useCallback(async () => {
    const sequence = ++loadSequenceRef.current;
    if (!leadId) {
      setPageError('Не указан идентификатор лида.');
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setPageError('');
    try {
      const loadedLead = await getLead(leadId);
      if (sequence === loadSequenceRef.current) {
        setLead(loadedLead);
      }
    } catch (caughtError) {
      if (sequence === loadSequenceRef.current) {
        setPageError(getLeadsErrorMessage(caughtError, 'Не удалось загрузить лид.'));
      }
    } finally {
      if (sequence === loadSequenceRef.current) {
        setIsLoading(false);
      }
    }
  }, [leadId]);

  useEffect(() => {
    setLead(null);
    setActionError('');
    setSuccessMessage('');
    setTakeConfirmOpen(false);
    setScheduleOpen(false);
    void load();
    return () => {
      loadSequenceRef.current += 1;
    };
  }, [load]);

  const takeCurrentLead = async () => {
    if (!leadId || !lead) {
      return;
    }

    setIsPending(true);
    setActionError('');
    setSuccessMessage('');
    try {
      const updatedLead = await takeLead(leadId, { expectedVersion: lead.version });
      setLead(updatedLead);
      setTakeConfirmOpen(false);
      setSuccessMessage('Лид закреплён за вами. Контакты открыты.');
      setScheduleOpen(true);
    } catch (caughtError) {
      if (caughtError instanceof LeadsRepositoryError && caughtError.code === 'conflict') {
        setTakeConfirmOpen(false);
        setActionError('Лид уже забрал другой дилер или данные изменились. Список обновлён.');
        await load();
      } else {
        setActionError(getLeadsErrorMessage(caughtError, 'Не удалось взять лид.'));
      }
    } finally {
      setIsPending(false);
    }
  };

  const saveSchedule = async (visit: ScheduledVisit) => {
    if (!leadId || !lead) {
      return;
    }

    setIsPending(true);
    setActionError('');
    setSuccessMessage('');
    try {
      const updatedLead = await scheduleLead(leadId, { ...visit, expectedVersion: lead.version });
      setLead(updatedLead);
      setScheduleOpen(false);
      setSuccessMessage(
        updatedLead.serviceType === 'measurement'
          ? 'Дата замера сохранена. Теперь создайте стандартный заказ.'
          : 'Дата сохранена. Рабочее задание создано автоматически.',
      );
    } catch (caughtError) {
      if (caughtError instanceof LeadsRepositoryError && caughtError.code === 'conflict') {
        setActionError('Лид изменился в другой вкладке. Данные обновлены — проверьте дату и повторите действие.');
        setScheduleOpen(false);
        await load();
      } else {
        setActionError(getLeadsErrorMessage(caughtError, 'Не удалось сохранить дату.'));
      }
    } finally {
      setIsPending(false);
    }
  };

  const createMeasurementOrder = () => {
    if (!lead?.scheduledVisit) {
      setActionError('Сначала укажите дату замера.');
      setScheduleOpen(true);
      return;
    }

    const sourceParams = new URLSearchParams({
      sourceLeadId: lead.id,
      sourceLeadVersion: String(lead.version),
    });

    navigate(`/orders/new?${sourceParams.toString()}`, {
      state: {
        resetCalculatorPositions: true,
        draftForm: {
          fullName: lead.customer.name,
          phone: lead.customer.phone,
          address: lead.location.address || [lead.location.city, lead.location.region].filter(Boolean).join(', '),
          contractNumber: '',
          measurementDate: lead.scheduledVisit.date,
          productionDate: '',
          installationDate: '',
          comment: lead.factoryNotes ?? '',
        },
        sourceLeadId: lead.id,
        sourceLeadVersion: lead.version,
      },
    });
  };

  const backTo = useMemo(() => {
    if (lead?.status === 'available') {
      return '/leads';
    }

    return lead && ['converted', 'expired', 'cancelled'].includes(lead.status) ? '/leads/archive' : '/leads/my';
  }, [lead]);

  const footer = useMemo(() => {
    if (!lead) {
      return null;
    }

    if (lead.status === 'available') {
      return (
        <button type="button" onClick={() => setTakeConfirmOpen(true)} className={primaryButtonClassName}>
          Забрать лид
        </button>
      );
    }

    if (lead.status === 'assigned') {
      return (
        <button type="button" onClick={() => setScheduleOpen(true)} className={primaryButtonClassName}>
          <CalendarClock className="h-5 w-5" aria-hidden="true" />
          Указать дату
        </button>
      );
    }

    if (lead.serviceType === 'measurement' && lead.status === 'in_work' && lead.scheduledVisit) {
      return (
        <button type="button" onClick={createMeasurementOrder} className={primaryButtonClassName}>
          <ClipboardList className="h-5 w-5" aria-hidden="true" />
          Создать заказ
        </button>
      );
    }

    if (lead.convertedWorkOrderId) {
      return (
        <Link to={`/work-orders/${lead.convertedWorkOrderId}`} className={primaryButtonClassName}>
          Открыть задание
        </Link>
      );
    }

    if (lead.convertedOrderId) {
      return (
        <Link to={`/orders/${lead.convertedOrderId}`} className={primaryButtonClassName}>
          Открыть заказ
        </Link>
      );
    }

    return null;
  }, [lead]);

  return (
    <LeadPageFrame title="Детали лида" backTo={backTo} footer={footer}>
      {isLoading ? <LoadingState label="Загружаем лид…" /> : null}
      {!isLoading && pageError ? <ErrorState message={pageError} onRetry={() => void load()} /> : null}

      {!isLoading && !pageError && lead ? (
        <div className="space-y-6">
          <section>
            <div className="flex flex-wrap items-center gap-2">
              <LeadBadge value={lead.status} kind="status" appearance="detail" />
              <span className="text-xs font-semibold text-slate-500">ID: {lead.externalId || lead.id}</span>
              <LeadBadge value={lead.serviceType} kind="service" className="ml-auto" />
            </div>
            <h2 className="mt-3 text-2xl font-extrabold leading-tight tracking-tight text-ink-800">{lead.title}</h2>
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
          {lead.status === 'assigned' ? (
            <InlineNotice tone="warning">
              <strong className="block">Дата обязательна</strong>
              {getScheduleDeadlineLabel(lead.scheduleDueAt)}
            </InlineNotice>
          ) : null}
          {lead.cancellationReason ? (
            <InlineNotice tone="error">Причина отмены: {lead.cancellationReason}</InlineNotice>
          ) : null}

          <DetailSection title="Информация о клиенте" icon={UserRound}>
            <dl className="grid gap-4 sm:grid-cols-2">
              <DefinitionItem label="Имя">{lead.customer.name}</DefinitionItem>
              <DefinitionItem label="Телефон">
                {lead.customer.isMasked ? (
                  <span>
                    {lead.customer.phone}
                    <span className="mt-1 flex items-center gap-1 text-xs font-normal text-slate-500">
                      <LockKeyhole className="h-3.5 w-3.5" aria-hidden="true" />
                      Откроется после взятия лида
                    </span>
                  </span>
                ) : (
                  <a
                    href={`tel:${lead.customer.phone.replace(/[^+\d]/g, '')}`}
                    className="inline-flex items-center gap-1.5 font-semibold text-ink-800 hover:underline"
                  >
                    <Phone className="h-4 w-4" aria-hidden="true" />
                    {lead.customer.phone}
                  </a>
                )}
              </DefinitionItem>
            </dl>
          </DetailSection>

          <DetailSection title="Спецификация проекта" icon={Package}>
            <dl className="grid gap-4 sm:grid-cols-2">
              <DefinitionItem label="Продукт" className="sm:col-span-2">{lead.project.product}</DefinitionItem>
              {lead.project.volume ? <DefinitionItem label="Объём">{lead.project.volume}</DefinitionItem> : null}
              <DefinitionItem label={lead.serviceType === 'measurement' ? 'Оценочный бюджет' : 'Вознаграждение'}>
                {lead.serviceType === 'measurement'
                  ? formatMoneyRange(lead.project.budget || lead.budget)
                  : formatMoney(lead.reward)}
              </DefinitionItem>
            </dl>
          </DetailSection>

          <DetailSection title="Местоположение" icon={MapPin}>
            <dl className="grid gap-4 sm:grid-cols-2">
              <DefinitionItem label="Регион">{lead.location.region}</DefinitionItem>
              <DefinitionItem label="Город">{lead.location.city}</DefinitionItem>
              {lead.location.address ? (
                <DefinitionItem label="Адрес" className="sm:col-span-2">{lead.location.address}</DefinitionItem>
              ) : (
                <DefinitionItem label="Точный адрес" className="sm:col-span-2">
                  <span className="inline-flex items-center gap-1.5 text-slate-500">
                    <LockKeyhole className="h-3.5 w-3.5" aria-hidden="true" />
                    Будет доступен после взятия лида
                  </span>
                </DefinitionItem>
              )}
            </dl>
            {lead.location.address || lead.location.latitude !== undefined || lead.location.mapImageUrl ? (
              <MapPreview location={lead.location} className="mt-4" />
            ) : null}
          </DetailSection>

          {lead.factoryNotes ? (
            <DetailSection title="Заметки завода" icon={FileText}>
              <p className="text-sm leading-7 text-slate-600">{lead.factoryNotes}</p>
            </DetailSection>
          ) : null}

          {lead.scheduledVisit ? (
            <DetailSection
              title="Планирование"
              icon={CalendarClock}
              action={
                lead.status === 'assigned' || lead.status === 'in_work' ? (
                  <button type="button" onClick={() => setScheduleOpen(true)} className="text-xs font-semibold text-ink-700 hover:underline">
                    Изменить
                  </button>
                ) : null
              }
            >
              <dl className="grid gap-4 sm:grid-cols-2">
                <DefinitionItem label={visitDateLabels[lead.serviceType]}>
                  {formatVisit(lead.scheduledVisit)}
                </DefinitionItem>
                <DefinitionItem label="Сохранено">{formatLeadDate(lead.updatedAt, true)}</DefinitionItem>
              </dl>
            </DetailSection>
          ) : null}

          <AttachmentsPanel attachments={lead.attachments} />

          <p className="flex items-center gap-1.5 px-1 text-xs text-slate-500">
            <Building2 className="h-3.5 w-3.5" aria-hidden="true" />
            Опубликовано {formatLeadDate(lead.publishedAt, true)}
          </p>
        </div>
      ) : null}

      {isTakeConfirmOpen && lead ? (
        <ConfirmDialog
          title="Забрать этот лид?"
          description="Лид закрепится за вами, контакты откроются. Плановую дату нужно указать в течение 24 часов, иначе лид вернётся на витрину."
          confirmLabel="Забрать"
          onConfirm={() => void takeCurrentLead()}
          onCancel={() => setTakeConfirmOpen(false)}
          isPending={isPending}
        />
      ) : null}

      {isScheduleOpen && lead ? (
        <ScheduleDialog
          serviceType={lead.serviceType}
          initialValue={lead.scheduledVisit}
          scheduleDueAt={lead.scheduleDueAt}
          isPending={isPending}
          serverError={actionError}
          onSubmit={(visit) => void saveSchedule(visit)}
          onClose={() => setScheduleOpen(false)}
        />
      ) : null}
    </LeadPageFrame>
  );
};
