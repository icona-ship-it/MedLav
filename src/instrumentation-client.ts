// This file configures the initialization of Sentry on the client.
// The added config here will be used whenever a users loads a page in their browser.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from "@sentry/nextjs";

/** Scrub PII patterns from error messages before sending to Sentry. */
function scrubClinicalData(text: string): string {
  return text
    .replace(/\b[A-Z]{6}\d{2}[A-EHLMPRST]\d{2}[A-Z]\d{3}[A-Z]\b/gi, '[CF_REDACTED]')
    .replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, '[EMAIL_REDACTED]')
    .replace(/(?:\+39\s?)?(?:0\d{1,4}[\s.-]?\d{4,8}|3\d{2}[\s.-]?\d{3}[\s.-]?\d{4})\b/g, '[PHONE_REDACTED]');
}

Sentry.init({
  dsn: "https://45a8ef8597a48a6b6382378b399af609@o4510987550326784.ingest.de.sentry.io/4510987552227408",

  // Sample 10% of traces in production to reduce costs
  tracesSampleRate: 0.1,

  // GDPR Art. 9: never send PII (patient names, clinical data)
  sendDefaultPii: false,

  beforeSend(event) {
    if (event.message) event.message = scrubClinicalData(event.message);
    if (event.exception?.values) {
      for (const ex of event.exception.values) {
        if (ex.value) ex.value = scrubClinicalData(ex.value);
      }
    }
    if (event.breadcrumbs) {
      for (const bc of event.breadcrumbs) {
        if (bc.message) bc.message = scrubClinicalData(bc.message);
      }
    }
    return event;
  },
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
