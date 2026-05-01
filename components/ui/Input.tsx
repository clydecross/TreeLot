import { forwardRef, type InputHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

type Size = 'sm' | 'md' | 'lg';

const SIZES: Record<Size, string> = {
  sm: 'h-7 text-[12px] px-2.5 rounded-[var(--radius-sm)]',
  md: 'h-9 text-[13px] px-3 rounded-[var(--radius-md)]',
  lg: 'h-11 text-[14px] px-3.5 rounded-[var(--radius-md)]',
};

interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  inputSize?: Size;
  leading?: React.ReactNode;
  trailing?: React.ReactNode;
  invalid?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { inputSize = 'md', leading, trailing, invalid, className, ...rest },
  ref
) {
  if (leading || trailing) {
    return (
      <div
        className={cn(
          'flex items-center w-full bg-bg-surface border transition-[border-color,box-shadow] duration-[140ms] ease-out',
          SIZES[inputSize],
          invalid ? 'border-[var(--error-border)]' : 'border-border-default',
          'focus-within:border-border-brand focus-within:shadow-[var(--shadow-focus)]',
          className,
        )}
      >
        {leading && <span className="flex items-center text-fg-muted mr-2 shrink-0">{leading}</span>}
        <input
          ref={ref}
          className="flex-1 bg-transparent outline-none placeholder:text-fg-subtle text-fg-default"
          {...rest}
        />
        {trailing && <span className="flex items-center text-fg-muted ml-2 shrink-0">{trailing}</span>}
      </div>
    );
  }

  return (
    <input
      ref={ref}
      className={cn(
        'w-full bg-bg-surface border outline-none placeholder:text-fg-subtle text-fg-default',
        'transition-[border-color,box-shadow] duration-[140ms] ease-out focus-ring',
        SIZES[inputSize],
        invalid ? 'border-[var(--error-border)]' : 'border-border-default focus:border-border-brand',
        className,
      )}
      {...rest}
    />
  );
});
