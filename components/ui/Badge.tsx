import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

type Variant = 'neutral' | 'brand' | 'success' | 'info' | 'warn' | 'error';
type Size    = 'sm' | 'md';

const VARIANTS: Record<Variant, string> = {
  neutral: 'bg-bg-inset text-fg-muted border border-border-subtle',
  brand:   'bg-brand-soft text-brand-softfg border border-transparent',
  success: 'bg-success-bg text-success-fg border border-[var(--success-border)]',
  info:    'bg-info-bg text-info-fg border border-[var(--info-border)]',
  warn:    'bg-warn-bg text-warn-fg border border-[var(--warn-border)]',
  error:   'bg-error-bg text-error-fg border border-[var(--error-border)]',
};

const SIZES: Record<Size, string> = {
  sm: 'h-5 px-1.5 text-[10px] rounded-md',
  md: 'h-6 px-2 text-[11px] rounded-md',
};

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: Variant;
  size?: Size;
  dot?: boolean;
}

export function Badge({ variant = 'neutral', size = 'sm', dot, className, children, ...rest }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 font-medium tracking-wide',
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...rest}
    >
      {dot && <span className="w-1.5 h-1.5 rounded-full bg-current opacity-80" />}
      {children}
    </span>
  );
}
