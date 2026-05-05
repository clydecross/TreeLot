'use client';

import { useEffect, useState } from 'react';
import { Toaster } from 'sonner';

// Map sonner's internal CSS variables onto our semantic tokens. Tokens already
// flip between :root and [data-theme="dark"] via globals.css, so light/dark
// works automatically for free.
const TOAST_THEME = {
  '--normal-bg':     'var(--bg-surface)',
  '--normal-text':   'var(--fg-default)',
  '--normal-border': 'var(--border-default)',
  '--success-bg':     'var(--success-bg)',
  '--success-text':   'var(--success-fg)',
  '--success-border': 'var(--success-border)',
  '--error-bg':       'var(--error-bg)',
  '--error-text':     'var(--error-fg)',
  '--error-border':   'var(--error-border)',
  '--info-bg':        'var(--info-bg)',
  '--info-text':      'var(--info-fg)',
  '--info-border':    'var(--info-border)',
  '--warning-bg':     'var(--warn-bg)',
  '--warning-text':   'var(--warn-fg)',
  '--warning-border': 'var(--warn-border)',
} as React.CSSProperties;

export function AppToaster() {
  const [position, setPosition] = useState<'bottom-right' | 'top-center'>('bottom-right');

  useEffect(() => {
    const mql = window.matchMedia('(max-width: 1023px)');
    const update = () => setPosition(mql.matches ? 'top-center' : 'bottom-right');
    update();
    mql.addEventListener('change', update);
    return () => mql.removeEventListener('change', update);
  }, []);

  return (
    <Toaster
      position={position}
      richColors
      closeButton
      style={TOAST_THEME}
      toastOptions={{
        classNames: {
          actionButton: '!bg-brand !text-brand-fg !rounded-md !font-medium',
          cancelButton: '!bg-bg-elevated !text-fg-default !rounded-md',
          // Sonner colours the close button to match the toast background
          // (so a green × on a green success toast). Force a contrasting
          // surface so it's always legible across all toast types.
          closeButton: '!bg-bg-surface !text-fg-default !border-border-strong hover:!bg-bg-elevated',
        },
      }}
    />
  );
}
