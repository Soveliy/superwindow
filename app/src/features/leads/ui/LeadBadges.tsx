import { cn } from '@/shared/lib/cn';

const serviceLabels: Record<string, string> = {
  measurement: 'Замер',
  measure: 'Замер',
  installation: 'Монтаж',
  install: 'Монтаж',
  delivery: 'Доставка',
};

const statusLabels: Record<string, string> = {
  available: 'Доступен',
  taken: 'Взят',
  assigned: 'Назначен',
  scheduled: 'Запланирован',
  in_work: 'В работе',
  in_progress: 'В работе',
  converted: 'Конвертирован',
  completed: 'Выполнен',
  done: 'Выполнен',
  expired: 'Истёк',
  cancelled: 'Отменён',
};

const statusClasses: Record<string, string> = {
  available: 'border-emerald-500/30 bg-emerald-500/15 text-emerald-700',
  taken: 'border-amber-500/30 bg-amber-500/15 text-amber-700',
  assigned: 'border-sky-500/30 bg-sky-500/15 text-sky-700',
  scheduled: 'border-sky-500/30 bg-sky-500/15 text-sky-700',
  in_work: 'border-indigo-500/30 bg-indigo-500/15 text-indigo-700',
  in_progress: 'border-indigo-500/30 bg-indigo-500/15 text-indigo-700',
  converted: 'border-violet-500/30 bg-violet-500/15 text-violet-700',
  completed: 'border-emerald-500/30 bg-emerald-500/15 text-emerald-700',
  done: 'border-emerald-500/30 bg-emerald-500/15 text-emerald-700',
  expired: 'border-slate-400/30 bg-slate-400/15 text-slate-600',
  cancelled: 'border-error/30 bg-error/10 text-error',
};

export const getServiceLabel = (value: string): string => serviceLabels[value] ?? value;
export const getLeadStatusLabel = (value: string): string => statusLabels[value] ?? value;

interface BadgeProps {
  value: string;
  kind: 'service' | 'status';
  className?: string;
  appearance?: 'default' | 'marketplace' | 'detail';
}

export const LeadBadge = ({ value, kind, className, appearance = 'default' }: BadgeProps) => (
  <span
    className={cn(
      'inline-flex min-h-6 items-center rounded-full border px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide',
      kind === 'service'
        ? 'border-transparent bg-brand-100 text-slate-600'
        : value === 'available' && appearance === 'marketplace'
          ? 'border-[#15803d] bg-[#15803d] text-white'
          : value === 'available' && appearance === 'detail'
            ? 'border-transparent bg-brand-200 text-ink-800 normal-case'
            : (statusClasses[value] ?? 'border-slate-300 bg-slate-100 text-slate-600'),
      className,
    )}
  >
    {kind === 'service' ? getServiceLabel(value) : getLeadStatusLabel(value)}
  </span>
);
