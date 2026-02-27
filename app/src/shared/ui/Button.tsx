import type { ButtonHTMLAttributes } from 'react';
import { LoaderCircle } from 'lucide-react';
import { cn } from '@/shared/lib/cn';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  loading?: boolean;
  fullWidth?: boolean;
  variant?: 'primary' | 'secondary' | 'ghost';
}

export const Button = ({
  className,
  children,
  disabled,
  loading = false,
  fullWidth = true,
  variant = 'primary',
  ...props
}: ButtonProps) => {
  const variantClassName =
    variant === 'primary'
      ? 'border border-slate-200 bg-white text-slate-50'
      : variant === 'secondary'
        ? 'border border-slate-200 bg-white text-slate-50'
        : 'border border-slate-200 bg-white text-slate-50';

  return (
    <button
      className={cn(
        'inline-flex h-12 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold transition-colors active:bg-white active:text-black disabled:cursor-not-allowed disabled:opacity-60',
        variantClassName,
        fullWidth && 'w-full',
        className,
      )}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? <LoaderCircle className="h-4 w-4 animate-spin" /> : null}
      <span className='flex items-center justify-center gap-1'>{children}</span>
    </button>
  );
};
