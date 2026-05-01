// Browser instrumentation entry point. Imports Sentry client config so it
// runs before React hydration. Re-exports Sentry's router-transition hook so
// the SDK can instrument client-side navigations. All Sentry calls no-op
// when NEXT_PUBLIC_SENTRY_DSN is unset.
import * as Sentry from '@sentry/nextjs';
import './sentry.client.config';

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
