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
 * beforeSend hook condiviso. GDPR Art. 9: minimizza al massimo ciò che arriva a
 * Sentry (che è EU, ma resta un responsabile del trattamento).
 *  - scrub di CF/email/telefono in message, exception, breadcrumbs, extra;
 *  - NON invia corpi/cookie/header della richiesta (possono contenere testo clinico);
 *  - contesto utente ridotto al solo id (mai email/nome/IP).
 * Nota: nessuna regex può garantire lo scrub di nomi/diagnosi in testo libero — la
 * difesa primaria resta la regola "mai dati clinici negli errori/log" + logger.ts.
 *
 * Interfaccia minimale volutamente: così `ErrorEvent` di Sentry soddisfa il vincolo
 * generico; request/user/extra (i cui tipi Sentry sono più stretti) sono trattati
 * via `scrubEventEnvelope` con un cast interno sicuro.
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
  scrubEventEnvelope(event as unknown as Record<string, unknown>);
  return event;
}

/** Minimizza request/user/extra dell'evento Sentry (mutazione in place). */
function scrubEventEnvelope(ev: Record<string, unknown>): void {
  // Non inviare payload della richiesta: body/cookie/header possono contenere
  // testo clinico o dati sensibili. La query string, se stringa, viene scrubbata.
  const req = ev.request as { data?: unknown; cookies?: unknown; headers?: unknown; query_string?: unknown } | undefined;
  if (req) {
    req.data = undefined;
    req.cookies = undefined;
    req.headers = undefined;
    if (typeof req.query_string === 'string') req.query_string = scrubClinicalData(req.query_string);
  }
  // Contesto utente: tieni SOLO l'id, rimuovi email/username/ip_address/ecc.
  const user = ev.user as Record<string, unknown> | undefined;
  if (user) {
    const id = user.id;
    for (const key of Object.keys(user)) delete user[key];
    if (id !== undefined) user.id = id;
  }
  // extra: scrub dei valori stringa (i non-stringa restano, di rado clinici).
  const extra = ev.extra as Record<string, unknown> | undefined;
  if (extra) {
    for (const [key, value] of Object.entries(extra)) {
      if (typeof value === 'string') extra[key] = scrubClinicalData(value);
    }
  }
}
