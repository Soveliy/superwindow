import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/shared/lib/cn';

interface DetailSectionProps {
  title: string;
  icon: LucideIcon;
  children: ReactNode;
  className?: string;
  action?: ReactNode;
  variant?: 'lead' | 'work';
}

export const DetailSection = ({ title, icon: Icon, children, className, action, variant = 'lead' }: DetailSectionProps) => (
  <section className={cn('overflow-hidden border border-slate-300 bg-surface', variant === 'work' ? 'rounded-lg shadow-sm' : 'rounded p-4', className)}>
    <div className={cn('flex min-h-8 items-center justify-between gap-3 border-b border-slate-300', variant === 'work' ? 'bg-slate-100 px-4 py-2.5' : 'pb-2.5')}>
      <h2 className={cn('inline-flex min-w-0 items-center gap-2 font-bold leading-snug text-ink-800', variant === 'work' ? 'text-lg' : 'text-base sm:text-lg')}>
        <Icon className="h-5 w-5 shrink-0 text-ink-700" aria-hidden="true" />
        <span>{title}</span>
      </h2>
      {action}
    </div>
    <div className={variant === 'work' ? 'p-4' : 'pt-4'}>{children}</div>
  </section>
);

interface DefinitionItemProps {
  label: string;
  children: ReactNode;
  className?: string;
}

export const DefinitionItem = ({ label, children, className }: DefinitionItemProps) => (
  <div className={className}>
    <dt className="text-xs font-bold uppercase tracking-wide text-slate-600">{label}</dt>
    <dd className="mt-1 break-words text-sm leading-relaxed text-ink-700">{children}</dd>
  </div>
);
