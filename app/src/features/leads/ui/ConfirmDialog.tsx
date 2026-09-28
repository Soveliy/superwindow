import { useEffect, useRef } from 'react';
import { AlertCircle, LoaderCircle, X } from 'lucide-react';
import { useModalDialog } from '@/shared/ui/useModalDialog';

interface ConfirmDialogProps {
  title: string;
  description: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  isPending?: boolean;
  tone?: 'primary' | 'danger';
}

export const ConfirmDialog = ({
  title,
  description,
  confirmLabel,
  onConfirm,
  onCancel,
  isPending = false,
  tone = 'primary',
}: ConfirmDialogProps) => {
  const cancelButtonRef = useRef<HTMLButtonElement | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  useModalDialog(dialogRef, cancelButtonRef);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !isPending) {
        onCancel();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isPending, onCancel]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center overflow-y-auto bg-slate-900/60 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur-[2px] sm:items-center">
      <div
        ref={dialogRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="lead-confirm-title"
        aria-describedby="lead-confirm-description"
        tabIndex={-1}
        className="max-h-[calc(100dvh-1.5rem)] w-full max-w-md overflow-y-auto rounded-2xl border border-slate-200 bg-surface p-5 shadow-panel"
      >
        <div className="flex items-start justify-between gap-3">
          <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-100 text-ink-700">
            <AlertCircle className="h-5 w-5" aria-hidden="true" />
          </span>
          <button
            type="button"
            onClick={onCancel}
            disabled={isPending}
            className="inline-flex h-9 w-9 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 disabled:opacity-50"
            aria-label="Закрыть"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <h2 id="lead-confirm-title" className="mt-4 text-xl font-extrabold text-ink-800">
          {title}
        </h2>
        <p id="lead-confirm-description" className="mt-2 text-sm leading-relaxed text-slate-500">
          {description}
        </p>

        <div className="mt-6 grid grid-cols-2 gap-3">
          <button
            ref={cancelButtonRef}
            type="button"
            onClick={onCancel}
            disabled={isPending}
            className="inline-flex h-12 items-center justify-center rounded-xl border border-slate-300 bg-surface px-4 text-sm font-semibold text-ink-700 hover:bg-slate-100 disabled:opacity-50"
          >
            Отмена
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isPending}
            className={`inline-flex h-12 items-center justify-center gap-2 rounded-xl px-4 text-sm font-extrabold text-white disabled:opacity-60 ${
              tone === 'danger' ? 'bg-error' : 'bg-[#052c56] hover:bg-[#0a3b70]'
            }`}
          >
            {isPending ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};
