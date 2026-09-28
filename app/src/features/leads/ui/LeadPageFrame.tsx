import type { ReactNode } from 'react';
import { ArrowLeft, Building2 } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { BottomNav } from '@/app/layout/BottomNav';
import { cn } from '@/shared/lib/cn';
import '@/features/leads/ui/leads-theme.css';

interface LeadPageFrameProps {
  title: string;
  children: ReactNode;
  backTo?: string;
  action?: ReactNode;
  className?: string;
  contentClassName?: string;
  footer?: ReactNode;
  showBottomNav?: boolean;
}

export const LeadPageFrame = ({
  title,
  children,
  backTo,
  action,
  className,
  contentClassName,
  footer,
  showBottomNav = false,
}: LeadPageFrameProps) => {
  const navigate = useNavigate();

  return (
    <div className={cn('leads-page min-h-screen min-h-dvh bg-slate-50 sm:bg-page sm:px-3 sm:py-3', className)}>
      <main
        className={cn(
          'mx-auto min-h-dvh w-full max-w-[620px] bg-slate-50 sm:min-h-[calc(100vh-1.5rem)] sm:rounded-xl sm:shadow-panel',
          (footer || showBottomNav) && 'pb-[calc(6rem+env(safe-area-inset-bottom))]',
        )}
      >
        <header className="sticky top-0 z-20 grid min-h-16 grid-cols-[44px_1fr_44px] items-center border-b border-slate-300 bg-slate-50/95 px-3 backdrop-blur-sm">
          {backTo ? (
            <Link
              to={backTo}
              className="inline-flex h-10 w-10 items-center justify-center rounded-xl text-ink-700 transition-colors hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
              aria-label={showBottomNav ? 'К заказам' : 'Назад'}
            >
              {showBottomNav ? <Building2 className="h-5 w-5" aria-hidden="true" /> : <ArrowLeft className="h-5 w-5" aria-hidden="true" />}
            </Link>
          ) : (
            <button
              type="button"
              onClick={() => navigate(-1)}
              className="inline-flex h-10 w-10 items-center justify-center rounded-xl text-ink-700 transition-colors hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
              aria-label="Назад"
            >
              <ArrowLeft className="h-5 w-5" aria-hidden="true" />
            </button>
          )}

          <h1 className="truncate px-2 text-center text-xl font-extrabold tracking-tight text-ink-800 sm:text-2xl">
            {title}
          </h1>
          <div className="flex items-center justify-end">{action}</div>
        </header>

        <div className={cn('px-4 pb-7 pt-4 sm:px-5', contentClassName)}>{children}</div>

        {footer ? (
          <footer className="fixed inset-x-0 bottom-0 z-30 mx-auto max-w-[620px] border-t border-slate-300 bg-surface/95 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4 shadow-panel backdrop-blur-sm">
            {footer}
          </footer>
        ) : null}
      </main>
      {showBottomNav ? <BottomNav /> : null}
    </div>
  );
};
