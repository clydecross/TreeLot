// Server / edge runtime instrumentation hook.
// Loads the appropriate Sentry config based on runtime. No-op when DSN unset.
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config');
  }
  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config');
  }
}

export async function onRequestError(
  err: unknown,
  request: { path: string; method: string; headers: { [key: string]: string | string[] } },
  context: { routePath: string; routeType: string },
) {
  // Forward server-side errors to Sentry. captureRequestError is a no-op when DSN unset.
  const dsn = process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN;
  if (!dsn) return;
  const Sentry = await import('@sentry/nextjs');
  // Sentry exposes captureRequestError in newer versions; fall back to captureException.
  const maybeCapture = (Sentry as unknown as {
    captureRequestError?: (
      err: unknown,
      request: unknown,
      context: unknown,
    ) => void;
  }).captureRequestError;
  if (typeof maybeCapture === 'function') {
    maybeCapture(err, request, context);
  } else {
    Sentry.captureException(err);
  }
}
