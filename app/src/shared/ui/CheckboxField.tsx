import type { InputHTMLAttributes } from 'react';
import { cn } from '@/shared/lib/cn';

interface CheckboxFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label: string;
}

export const CheckboxField = ({ className, label, ...props }: CheckboxFieldProps) => {
  return (
    <label className={cn('inline-flex items-center gap-2 text-sm text-ink-600', className)}>
      <input
        type="checkbox"
        className="h-4 w-4 rounded border-slate-300 text-brand-500 focus:ring-brand-300"
        {...props}
      />
      <span>{label}</span>
    </label>
  );
};
