import { cn } from '@/shared/lib/cn';

interface ToggleProps {
  checked: boolean;
  className?: string;
}

export const Toggle = ({ checked, className }: ToggleProps) => {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'relative inline-flex h-6 w-11 shrink-0 items-center border border-slate-300',
        checked ? 'bg-white' : 'bg-slate-200',
        className,
      )}
    >
      <span
        className={cn(
          'inline-block h-5 w-5 bg-surface transition-transform',
          checked ? 'translate-x-5 border border-brand-500' : 'translate-x-1 border border-slate-400',
        )}
      />
    </span>
  );
};
