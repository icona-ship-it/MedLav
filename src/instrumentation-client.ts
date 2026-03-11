// This file configures the initialization of Sentry on the client.
// The added config here will be used whenever a users loads a page in their browser.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: "https://45a8ef8597a48a6b6382378b399af609@o4510987550326784.ingest.de.sentry.io/4510987552227408",

  // Sample 10% of traces in production to reduce costs
  tracesSampleRate: 0.1,

  // GDPR Art. 9: never send PII (patient names, clinical data)
  sendDefaultPii: false,
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
