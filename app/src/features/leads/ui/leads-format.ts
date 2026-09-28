import type { Money, MoneyRange, ScheduledVisit } from '@/features/leads/model/leads.types';

const currencyFormatter = new Intl.NumberFormat('ru-RU', {
  style: 'currency',
  currency: 'RUB',
  maximumFractionDigits: 0,
});

const numberFormatter = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 });

const dateFormatter = new Intl.DateTimeFormat('ru-RU', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
});

const dateTimeFormatter = new Intl.DateTimeFormat('ru-RU', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

const compactDateFormatter = new Intl.DateTimeFormat('ru-RU', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

const parseDate = (value: string): Date | null => {
  const parsed = new Date(value.includes('T') ? value : `${value}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

export const formatMoney = (value?: Money): string =>
  value ? currencyFormatter.format(value.amount) : 'Не указано';

export const formatMoneyRange = (value?: MoneyRange): string => {
  if (!value) {
    return 'Не указан';
  }

  return `${numberFormatter.format(value.min)} – ${currencyFormatter.format(value.max)}`;
};

export const formatLeadExpiry = (value?: string): string => {
  const expiresAt = value ? parseDate(value) : null;
  if (!expiresAt) return 'Срок не указан';
  const minutes = Math.ceil((expiresAt.getTime() - Date.now()) / 60_000);
  if (minutes <= 0) return 'Срок истёк';
  if (minutes >= 24 * 60) return `Истекает через ${Math.ceil(minutes / (24 * 60))}д`;
  if (minutes >= 60) return `Истекает через ${Math.ceil(minutes / 60)}ч`;
  return `Истекает через ${minutes}м`;
};

export const formatLeadDate = (value?: string, withTime = false): string => {
  if (!value) {
    return 'Не указана';
  }

  const parsed = parseDate(value);
  if (!parsed) {
    return value;
  }

  return withTime ? dateTimeFormatter.format(parsed) : dateFormatter.format(parsed);
};

export const formatCompactDate = (value?: string): string => {
  if (!value) {
    return '—';
  }

  const parsed = parseDate(value);
  return parsed ? compactDateFormatter.format(parsed) : value;
};

export const formatVisit = (visit?: ScheduledVisit): string => {
  if (!visit) {
    return 'Не запланировано';
  }

  const date = formatCompactDate(visit.date);
  if (visit.timeFrom && visit.timeTo) {
    return `${date}, ${visit.timeFrom}–${visit.timeTo}`;
  }

  return visit.timeFrom ? `${date}, ${visit.timeFrom}` : date;
};

export const formatFileSize = (bytes?: number): string => {
  if (!bytes || bytes < 1) {
    return '';
  }

  if (bytes < 1024 * 1024) {
    return `${Math.ceil(bytes / 1024)} КБ`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} МБ`;
};

export const getScheduleDeadlineLabel = (value?: string): string => {
  if (!value) {
    return 'Заполните дату в течение 24 часов после взятия лида.';
  }

  const deadline = parseDate(value);
  if (!deadline) {
    return 'Заполните дату в течение 24 часов после взятия лида.';
  }

  const remainingMilliseconds = deadline.getTime() - Date.now();
  if (remainingMilliseconds <= 0) {
    return 'Срок заполнения даты истёк. Лид может вернуться в витрину.';
  }

  const remainingMinutes = Math.ceil(remainingMilliseconds / 60_000);
  const hours = Math.floor(remainingMinutes / 60);
  const minutes = remainingMinutes % 60;

  if (hours === 0) {
    return `Осталось ${minutes} мин.`;
  }

  return `Осталось ${hours} ч ${minutes} мин. Заполните дату до ${dateTimeFormatter.format(deadline)}.`;
};

export const toIsoDateInput = (value?: string): string => {
  if (!value) {
    return '';
  }

  const parsed = parseDate(value);
  if (!parsed) {
    return '';
  }

  const year = parsed.getFullYear();
  const month = `${parsed.getMonth() + 1}`.padStart(2, '0');
  const day = `${parsed.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const todayIsoDate = (): string => toIsoDateInput(new Date().toISOString());
