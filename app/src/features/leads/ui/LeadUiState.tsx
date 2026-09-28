import type { ReactNode } from 'react';
import { AlertTriangle, Inbox, LoaderCircle, RefreshCw } from 'lucide-react';
import { cn } from '@/shared/lib/cn';

interface LoadingStateProps {
  label?: string;
  compact?: boolean;
}

export const LoadingState = ({ label = 'Загружаем данные…', compact = false }: LoadingStateProps) => (
  <div
    className={cn(
      'flex items-center justify-center gap-3 text-sm font-semibold text-slate-500',
      compact ? 'py-6' : 'min-h-56 py-12',
    )}
    role="status"
    aria-live="polite"
  >
    <LoaderCircle className="h-5 w-5 animate-spin" aria-hidden="true" />
    <span>{label}</span>
  </div>
);

interface ErrorStateProps {
  title?: string;
  message: string;
  onRetry?: () => void;
  compact?: boolean;
}

export const ErrorState = ({
  title = 'Не удалось загрузить данные',
  message,
  onRetry,
  compact = false,
}: ErrorStateProps) => (
  <div
    className={cn(
      'rounded-2xl border border-error/30 bg-error/10 px-5 text-center',
      compact ? 'py-5' : 'my-5 py-9',
    )}
    role="alert"
  >
    <AlertTriangle className="mx-auto h-7 w-7 text-error" aria-hidden="true" />
    <h2 className="mt-3 text-base font-extrabold text-ink-800">{title}</h2>
    <p className="mx-auto mt-1 max-w-sm text-sm text-slate-500">{message}</p>
    {onRetry ? (
      <button
        type="button"
        onClick={onRetry}
        className="mt-4 inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-surface px-4 text-sm font-semibold text-ink-700 transition-colors hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
      >
        <RefreshCw className="h-4 w-4" aria-hidden="true" />
        Повторить
      </button>
    ) : null}
  </div>
);

interface EmptyStateProps {
  title: string;
  message: string;
  action?: ReactNode;
}

export const EmptyState = ({ title, message, action }: EmptyStateProps) => (
  <div className="my-5 rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-5 py-10 text-center">
    <span className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400">
      <Inbox className="h-6 w-6" aria-hidden="true" />
    </span>
    <h2 className="mt-4 text-lg font-extrabold text-ink-800">{title}</h2>
    <p className="mx-auto mt-1 max-w-sm text-sm text-slate-500">{message}</p>
    {action ? <div className="mt-5">{action}</div> : null}
  </div>
);

interface InlineNoticeProps {
  children: ReactNode;
  tone?: 'info' | 'warning' | 'success' | 'error';
  className?: string;
}

const noticeToneClasses: Record<NonNullable<InlineNoticeProps['tone']>, string> = {
  info: 'border-brand-300/50 bg-brand-50 text-ink-700',
  warning: 'border-amber-400/40 bg-amber-400/10 text-ink-700',
  success: 'border-emerald-500/40 bg-emerald-500/10 text-ink-700',
  error: 'border-error/40 bg-error/10 text-error',
};

export const InlineNotice = ({ children, tone = 'info', className }: InlineNoticeProps) => (
  <div
    className={cn('rounded-xl border px-3 py-2.5 text-sm leading-relaxed', noticeToneClasses[tone], className)}
    role={tone === 'error' ? 'alert' : 'status'}
  >
    {children}
  </div>
);

