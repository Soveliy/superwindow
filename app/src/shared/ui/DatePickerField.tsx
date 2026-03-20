import { useEffect, useMemo, useRef, useState } from 'react';
import { CalendarDays } from 'lucide-react';
import Calendar, { type CalendarProps } from 'react-calendar';
import { cn } from '@/shared/lib/cn';

interface DatePickerFieldProps {
  label: string;
  value: string;
  onChange: (nextIsoDate: string) => void;
  readOnly?: boolean;
  placeholder?: string;
  minDate?: string;
  maxDate?: string;
  allowedDates?: string[];
  isDateDisabled?: (isoDate: string, date: Date) => boolean;
}

const isoDatePattern = /^\d{4}-\d{2}-\d{2}$/;
const displayDateFormatter = new Intl.DateTimeFormat('ru-RU', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

const isIsoDate = (value: string): boolean => isoDatePattern.test(value);

const toIsoDate = (date: Date): string => {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');

  return `${year}-${month}-${day}`;
};

const toCalendarDate = (isoDate: string | undefined): Date | null => {
  if (!isoDate || !isIsoDate(isoDate)) {
    return null;
  }

  const parsedDate = new Date(`${isoDate}T00:00:00`);
  return Number.isNaN(parsedDate.getTime()) ? null : parsedDate;
};

const formatIsoDate = (isoDate: string): string => {
  const parsedDate = toCalendarDate(isoDate);
  return parsedDate ? displayDateFormatter.format(parsedDate) : '';
};

export const DatePickerField = ({
  label,
  value,
  onChange,
  readOnly = false,
  placeholder = 'Выберите дату',
  minDate,
  maxDate,
  allowedDates,
  isDateDisabled,
}: DatePickerFieldProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  const minDateValue = useMemo(() => toCalendarDate(minDate), [minDate]);
  const maxDateValue = useMemo(() => toCalendarDate(maxDate), [maxDate]);
  const selectedDate = useMemo(() => toCalendarDate(value), [value]);
  const displayValue = useMemo(() => formatIsoDate(value), [value]);
  const allowedDatesSet = useMemo(() => {
    const normalizedDates = (allowedDates ?? []).filter(isIsoDate);
    return normalizedDates.length > 0 ? new Set(normalizedDates) : null;
  }, [allowedDates]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handlePointerDown = (event: MouseEvent | TouchEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('touchstart', handlePointerDown);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('touchstart', handlePointerDown);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen]);

  const handleCalendarChange: NonNullable<CalendarProps['onChange']> = (nextValue) => {
    const nextDate = Array.isArray(nextValue) ? nextValue[0] : nextValue;

    if (!(nextDate instanceof Date) || Number.isNaN(nextDate.getTime())) {
      return;
    }

    onChange(toIsoDate(nextDate));
    setIsOpen(false);
  };

  const tileDisabled: NonNullable<CalendarProps['tileDisabled']> = ({ date, view }) => {
    if (view !== 'month') {
      return false;
    }

    const isoDate = toIsoDate(date);

    if (allowedDatesSet && !allowedDatesSet.has(isoDate)) {
      return true;
    }

    if (isDateDisabled?.(isoDate, date)) {
      return true;
    }

    return false;
  };

  return (
    <div ref={rootRef} className="relative flex flex-col gap-2">
      <span className="text-xs font-semibold uppercase tracking-wide text-ink-700">{label}</span>

      <button
        type="button"
        disabled={readOnly}
        onClick={() => setIsOpen((state) => !state)}
        className={cn(
          'flex h-12 w-full items-center justify-between rounded-xl border border-slate-300 bg-slate-100 px-3 text-left text-sm text-ink-800 outline-none transition-all hover:border-slate-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-50',
          readOnly && 'cursor-not-allowed opacity-70 hover:border-slate-300',
        )}
        aria-label={label}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
      >
        <span className={cn('truncate', displayValue ? 'text-ink-800' : 'text-slate-400')}>{displayValue || placeholder}</span>
        <CalendarDays className="h-4 w-4 shrink-0 text-slate-400" />
      </button>

      {isOpen ? (
        <div className="absolute left-0 right-0 top-full z-30 mt-2 rounded-xl border border-slate-300 bg-slate-50 p-2 shadow-panel">
          <Calendar
            locale="ru-RU"
            calendarType="iso8601"
            maxDetail="month"
            showNeighboringMonth={false}
            next2Label={null}
            prev2Label={null}
            minDate={minDateValue ?? undefined}
            maxDate={maxDateValue ?? undefined}
            value={selectedDate}
            onChange={handleCalendarChange}
            tileDisabled={tileDisabled}
            className="superwindow-calendar"
          />
        </div>
      ) : null}
    </div>
  );
};
