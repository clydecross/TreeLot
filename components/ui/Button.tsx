import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'soft';
type Size    = 'sm' | 'md' | 'lg';

const VARIANTS: Record<Variant, string> = {
  primary:
    'bg-brand text-brand-fg border border-brand hover:bg-brand-hov hover:border-brand-hov',
  secondary:
    'bg-bg-surface text-fg-default border border-border-default hover:bg-bg-elevated',
  ghost:
    'bg-transparent text-fg-default border border-transparent hover:bg-bg-elevated',
  danger:
    'bg-error-bg text-error-fg border border-[var(--error-border)] hover:brightness-110',
  soft:
    'bg-brand-soft text-brand-softfg border border-transparent hover:brightness-105',
};

const SIZES: Record<Size, string> = {
  sm: 'h-7 px-2.5 text-[12px] rounded-[var(--radius-sm)] gap-1.5',
  md: 'h-9 px-3.5 text-[13px] rounded-[var(--radius-md)] gap-2',
  lg: 'h-11 px-5 text-[14px] rounded-[var(--radius-md)] gap-2',
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  leading?: React.ReactNode;
  trailing?: React.ReactNode;
  fullWidth?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', loading, leading, trailing, fullWidth, className, children, disabled, ...rest },
  ref
) {
  const isDisabled = disabled || loading;
  return (
    <button
      ref={ref}
      disabled={isDisabled}
      className={cn(
        'inline-flex items-center justify-center font-medium select-none focus-ring',
        'transition-[background-color,border-color,color,box-shadow] duration-[140ms] ease-out',
        VARIANTS[variant],
        SIZES[size],
        fullWidth && 'w-full',
        isDisabled && 'opacity-50 cursor-not-allowed pointer-events-none',
        className,
      )}
      {...rest}
    >
      {loading ? (
        <span
          aria-hidden
          className="inline-block w-3.5 h-3.5 rounded-full border-2 border-current border-r-transparent animate-spin"
        />
      ) : leading}
      {children}
      {!loading && trailing}
    </button>
  );
});
