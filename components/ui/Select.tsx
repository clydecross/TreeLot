import { forwardRef, type SelectHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

type Size = 'sm' | 'md' | 'lg';

const SIZES: Record<Size, string> = {
  sm: 'h-7 text-[12px] px-2.5 pr-7 rounded-[var(--radius-sm)]',
  md: 'h-9 text-[13px] px-3 pr-8 rounded-[var(--radius-md)]',
  lg: 'h-11 text-[14px] px-3.5 pr-9 rounded-[var(--radius-md)]',
};

interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'size'> {
  selectSize?: Size;
  invalid?: boolean;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { selectSize = 'md', invalid, className, children, ...rest },
  ref
) {
  return (
    <div className="relative inline-block w-full">
      <select
        ref={ref}
        className={cn(
          'w-full appearance-none bg-bg-surface border outline-none text-fg-default',
          'transition-[border-color,box-shadow] duration-[140ms] ease-out focus-ring',
          SIZES[selectSize],
          invalid ? 'border-[var(--error-border)]' : 'border-border-default focus:border-border-brand',
          className,
        )}
        {...rest}
      >
        {children}
      </select>
      <svg
        aria-hidden
        viewBox="0 0 12 12"
        className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3 h-3 pointer-events-none text-fg-muted"
      >
        <path d="M3 4.5l3 3 3-3" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
});
