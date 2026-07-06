import * as Sentry from '@sentry/nextjs'

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  // Error capture doesn't depend on this - performance tracing isn't part of what
  // this story asked for, and a no-budget volunteer app shouldn't burn Sentry's
  // (much smaller) trace quota on 100% sampling for no benefit.
  tracesSampleRate: 0,
})
