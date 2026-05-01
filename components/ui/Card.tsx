import { forwardRef, type HTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

type Variant  = 'surface' | 'elevated' | 'inset' | 'outline';
type Padding  = 'none' | 'sm' | 'md' | 'lg';
type Radius   = 'md' | 'lg' | 'xl';

const VARIANTS: Record<Variant, string> = {
  surface:  'bg-bg-surface border border-border-default shadow-[var(--shadow-sm)]',
  elevated: 'bg-bg-surface border border-border-subtle shadow-[var(--shadow-md)]',
  inset:    'bg-bg-inset border border-border-subtle',
  outline:  'bg-transparent border border-border-default',
};

const PADDING: Record<Padding, string> = {
  none: '',
  sm:   'p-3',
  md:   'p-4',
  lg:   'p-5',
};

const RADIUS: Record<Radius, string> = {
  md: 'rounded-[var(--radius-md)]',
  lg: 'rounded-[var(--radius-lg)]',
  xl: 'rounded-[var(--radius-xl)]',
};

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: Variant;
  padding?: Padding;
  radius?:  Radius;
  selected?: boolean;
}

export const Card = forwardRef<HTMLDivElement, CardProps>(function Card(
  { variant = 'surface', padding = 'md', radius = 'lg', selected, className, ...rest },
  ref
) {
  return (
    <div
      ref={ref}
      className={cn(
        VARIANTS[variant],
        PADDING[padding],
        RADIUS[radius],
        selected && 'border-l-2 border-l-brand bg-brand-soft',
        className,
      )}
      {...rest}
    />
  );
});
