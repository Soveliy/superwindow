import type { InputHTMLAttributes, ReactNode } from 'react';
import { cn } from '@/shared/lib/cn';

interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
  rightSlot?: ReactNode;
}

export const TextField = ({ label, error, className, rightSlot, ...props }: TextFieldProps) => {
  return (
    <label className="flex flex-col gap-2">
      <span className="text-xs font-semibold uppercase tracking-wide text-ink-700">{label}</span>
      <span className="relative block">
        <input
          className={cn(
            'h-12 w-full rounded-xl border border-slate-300 bg-slate-100 px-3 text-sm text-ink-800 outline-none transition-all placeholder:text-slate-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-50',
            error && 'border-error focus:border-error focus:ring-error/20',
            rightSlot && 'pr-11',
            className,
          )}
          {...props}
        />
        {rightSlot ? <span className="absolute inset-y-0 right-3 flex items-center">{rightSlot}</span> : null}
      </span>
      {error ? <span className="text-xs text-error">{error}</span> : null}
    </label>
  );
};
