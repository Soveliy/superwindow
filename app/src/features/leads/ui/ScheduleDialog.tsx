import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { CalendarClock, LoaderCircle, X } from 'lucide-react';
import type { LeadServiceType, ScheduledVisit } from '@/features/leads/model/leads.types';
import { InlineNotice } from '@/features/leads/ui/LeadUiState';
import { getScheduleDeadlineLabel, todayIsoDate } from '@/features/leads/ui/leads-format';
import { useModalDialog } from '@/shared/ui/useModalDialog';

interface ScheduleDialogProps {
  serviceType: LeadServiceType;
  initialValue?: ScheduledVisit;
  scheduleDueAt?: string;
  isPending?: boolean;
  serverError?: string;
  onSubmit: (value: ScheduledVisit) => void;
  onClose: () => void;
}

const fieldClassName =
  'mt-1 h-12 w-full rounded-xl border border-slate-300 bg-slate-100 px-3 text-sm font-semibold text-ink-800 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100';

export const ScheduleDialog = ({
  serviceType,
  initialValue,
  scheduleDueAt,
  isPending = false,
  serverError,
  onSubmit,
  onClose,
}: ScheduleDialogProps) => {
  const dateInputRef = useRef<HTMLInputElement | null>(null);
  const dialogRef = useRef<HTMLElement | null>(null);
  useModalDialog(dialogRef, dateInputRef);
  const [date, setDate] = useState(initialValue?.date ?? '');
  const [timeFrom, setTimeFrom] = useState(initialValue?.timeFrom ?? '');
  const [timeTo, setTimeTo] = useState(initialValue?.timeTo ?? '');
  const [validationError, setValidationError] = useState('');
  const serviceLabel = { measurement: 'замер', installation: 'монтаж', delivery: 'доставку' }[serviceType];

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !isPending) {
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isPending, onClose]);

  const deadlineNotice = useMemo(() => getScheduleDeadlineLabel(scheduleDueAt), [scheduleDueAt]);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setValidationError('');

    if (!date) {
      setValidationError('Укажите плановую дату.');
      dateInputRef.current?.focus();
      return;
    }

    if ((timeFrom && !timeTo) || (!timeFrom && timeTo)) {
      setValidationError('Укажите начало и окончание временного интервала.');
      return;
    }

    if (timeFrom && timeTo && timeFrom >= timeTo) {
      setValidationError('Время окончания должно быть позже времени начала.');
      return;
    }

    onSubmit({
      date,
      ...(timeFrom ? { timeFrom } : {}),
      ...(timeTo ? { timeTo } : {}),
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center overflow-y-auto bg-slate-900/60 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur-[2px] sm:items-center">
      <section
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="schedule-title"
        aria-describedby="schedule-description"
        tabIndex={-1}
        className="max-h-[calc(100dvh-1.5rem)] w-full max-w-md overflow-y-auto rounded-2xl border border-slate-200 bg-surface p-5 shadow-panel"
      >
        <div className="flex items-start justify-between gap-3">
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-brand-100 text-ink-700">
            <CalendarClock className="h-5 w-5" aria-hidden="true" />
          </span>
          <button
            type="button"
            onClick={onClose}
            disabled={isPending}
            className="inline-flex h-9 w-9 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 disabled:opacity-50"
            aria-label="Закрыть"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <h2 id="schedule-title" className="mt-4 text-xl font-extrabold text-ink-800">
          Запланировать {serviceLabel}
        </h2>
        <p id="schedule-description" className="mt-1 text-sm text-slate-500">Дата будет передана заводу и появится в вашем задании.</p>
        <InlineNotice tone="warning" className="mt-4">{deadlineNotice}</InlineNotice>

        <form onSubmit={submit} className="mt-5 space-y-4">
          <label className="block">
            <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Плановая дата *</span>
            <input
              ref={dateInputRef}
              type="date"
              value={date}
              min={todayIsoDate()}
              onChange={(event) => setDate(event.target.value)}
              className={fieldClassName}
              required
            />
          </label>

          <fieldset>
            <legend className="text-xs font-bold uppercase tracking-wide text-slate-500">Временной интервал</legend>
            <div className="grid grid-cols-2 gap-3">
              <label>
                <span className="sr-only">Начало</span>
                <input
                  type="time"
                  value={timeFrom}
                  onChange={(event) => setTimeFrom(event.target.value)}
                  className={fieldClassName}
                  aria-label="Время начала"
                />
              </label>
              <label>
                <span className="sr-only">Окончание</span>
                <input
                  type="time"
                  value={timeTo}
                  onChange={(event) => setTimeTo(event.target.value)}
                  className={fieldClassName}
                  aria-label="Время окончания"
                />
              </label>
            </div>
            <p className="mt-1 text-xs text-slate-500">Если точное время неизвестно, оставьте оба поля пустыми.</p>
          </fieldset>

          {validationError || serverError ? (
            <p className="text-sm font-semibold text-error" role="alert">{validationError || serverError}</p>
          ) : null}

          <div className="grid grid-cols-2 gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              disabled={isPending}
              className="h-12 rounded-xl border border-slate-300 bg-surface px-4 text-sm font-semibold text-ink-700 hover:bg-slate-100 disabled:opacity-50"
            >
              Отмена
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-[#052c56] px-4 text-sm font-extrabold text-white hover:bg-[#0a3b70] disabled:opacity-60"
            >
              {isPending ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
              Сохранить
            </button>
          </div>
        </form>
      </section>
    </div>
  );
};
