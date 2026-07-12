/**
 * Scrub PII condiviso per Sentry (server / client / edge).
 *
 * Prima questa logica era duplicata IDENTICA in sentry.{server,client,edge}.config.ts:
 * un drift in uno solo dei tre avrebbe fatto trapelare dati sanitari (GDPR Art. 9) a
 * Sentry. Unica fonte di verità qui.
 */

/** Rimuove codice fiscale, email e numeri di telefono da un testo. */
export function scrubClinicalData(text: string): string {
  return text
    .replace(/\b[A-Z]{6}\d{2}[A-EHLMPRST]\d{2}[A-Z]\d{3}[A-Z]\b/gi, '[CF_REDACTED]')
    .replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, '[EMAIL_REDACTED]')
    .replace(/(?:\+39\s?)?(?:0\d{1,4}[\s.-]?\d{4,8}|3\d{2}[\s.-]?\d{3}[\s.-]?\d{4})\b/g, '[PHONE_REDACTED]');
}

interface ScrubbableEvent {
  message?: string;
  exception?: { values?: Array<{ value?: string }> };
  breadcrumbs?: Array<{ message?: string }>;
}

/**
 * beforeSend hook condiviso: ripulisce message, exception e breadcrumbs in place.
 * Restituisce l'evento (comodo per `beforeSend: (e) => scrubSentryEvent(e)`).
 */
export function scrubSentryEvent<T extends ScrubbableEvent>(event: T): T {
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
}
