import * as Sentry from '@sentry/nextjs'

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
  debug: false,
  // Session Replay disabled (rates 0) to avoid recording business-plan /
  // financial form inputs into the Sentry subprocessor (TIM-1354, risk R3).
  // Re-enabling requires a GDPR Art. 35 DPIA. Masking options below are
  // defense-in-depth so any future re-enable is masked by construction
  // rather than relying on SDK-default behavior.
  replaysOnErrorSampleRate: 0,
  replaysSessionSampleRate: 0,
  integrations: [
    Sentry.replayIntegration({
      maskAllText: true,
      maskAllInputs: true,
      blockAllMedia: true,
    }),
  ],
})

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart
