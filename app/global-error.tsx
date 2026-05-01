'use client';

import { useEffect } from 'react';
import * as Sentry from '@sentry/nextjs';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <body className="min-h-screen flex items-center justify-center bg-bg-app p-4">
        <Card variant="elevated" padding="lg" className="max-w-md w-full text-center">
          <h1 className="text-lg font-semibold text-fg-default mb-2">
            Something went wrong
          </h1>
          <p className="text-sm text-fg-muted mb-4">
            An unexpected error occurred. Our team has been notified.
          </p>
          {error.digest && (
            <p className="text-xs text-fg-subtle mb-4 font-mono">
              Error ID: {error.digest}
            </p>
          )}
          <Button onClick={() => reset()}>Try again</Button>
        </Card>
      </body>
    </html>
  );
}
