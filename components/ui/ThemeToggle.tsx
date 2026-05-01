'use client';

import { useEffect, useState } from 'react';
import { THEME_STORAGE_KEY, type ThemePreference } from '@/lib/theme';
import { cn } from '@/lib/cn';

const OPTIONS: { value: ThemePreference; label: string; icon: React.ReactNode }[] = [
  {
    value: 'light',
    label: 'Light',
    icon: (
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
        <circle cx="8" cy="8" r="3.2" stroke="currentColor" strokeWidth="1.4" />
        <path d="M8 1.5v1.6M8 12.9v1.6M1.5 8h1.6M12.9 8h1.6M3.4 3.4l1.13 1.13M11.47 11.47l1.13 1.13M3.4 12.6l1.13-1.13M11.47 4.53l1.13-1.13"
          stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    value: 'system',
    label: 'Auto',
    icon: (
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
        <rect x="1.5" y="3" width="13" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.4" />
        <path d="M5.5 14.5h5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    value: 'dark',
    label: 'Dark',
    icon: (
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
        <path d="M13 9.4A6 6 0 0 1 6.6 3a5.5 5.5 0 1 0 6.4 6.4z"
          stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
];

function resolve(pref: ThemePreference): 'light' | 'dark' {
  if (pref === 'system') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return pref;
}

function apply(pref: ThemePreference) {
  const resolved = resolve(pref);
  document.documentElement.setAttribute('data-theme', resolved);
  document.documentElement.style.colorScheme = resolved;
}

type Tone = 'default' | 'chrome' | 'compact';

interface ThemeToggleProps {
  className?: string;
  tone?: Tone;
}

const TONES = {
  default: {
    track: 'bg-bg-inset border border-border-subtle',
    item:  'text-fg-muted hover:text-fg-default',
    active:'bg-bg-surface text-fg-default shadow-[var(--shadow-sm)]',
  },
  chrome: {
    track: 'bg-black/20 border border-white/5',
    item:  'text-chrome-fg-muted/80 hover:text-chrome-fg',
    active:'bg-chrome-active text-chrome-fg',
  },
  compact: {
    track: 'bg-transparent border border-border-default',
    item:  'text-fg-muted hover:text-fg-default',
    active:'bg-bg-elevated text-fg-default',
  },
} satisfies Record<Tone, { track: string; item: string; active: string }>;

export function ThemeToggle({ className, tone = 'default' }: ThemeToggleProps) {
  const [pref, setPref] = useState<ThemePreference>('system');
  const styles = TONES[tone];

  useEffect(() => {
    const saved = localStorage.getItem(THEME_STORAGE_KEY) as ThemePreference | null;
    setPref(saved && ['light', 'dark', 'system'].includes(saved) ? saved : 'system');
  }, []);

  useEffect(() => {
    if (pref !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => apply('system');
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [pref]);

  function update(next: ThemePreference) {
    setPref(next);
    localStorage.setItem(THEME_STORAGE_KEY, next);
    apply(next);
  }

  return (
    <div
      role="radiogroup"
      aria-label="Theme"
      className={cn(
        'inline-flex items-center gap-0.5 p-0.5 rounded-[var(--radius-md)]',
        styles.track,
        className,
      )}
    >
      {OPTIONS.map((opt) => {
        const active = pref === opt.value;
        return (
          <button
            key={opt.value}
            role="radio"
            aria-checked={active}
            title={opt.label}
            onClick={() => update(opt.value)}
            className={cn(
              'inline-flex items-center justify-center h-7 w-7 rounded-[var(--radius-sm)]',
              'transition-colors duration-[140ms] ease-out focus-ring',
              active ? styles.active : styles.item,
            )}
          >
            {opt.icon}
            <span className="sr-only">{opt.label}</span>
          </button>
        );
      })}
    </div>
  );
}
