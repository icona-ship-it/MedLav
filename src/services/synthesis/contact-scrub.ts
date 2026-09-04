/**
 * Recapiti nella trascrizione (gate gold 2026-09-04, caso B r.322): la
 * trascrizione integrale della cartella riportava il telefono di un familiare
 * dentro una citazione — dato personale di un TERZO nel testo depositabile
 * (GDPR), mai clinicamente rilevante. Telefoni ed email vengono sostituiti da
 * "[recapito omesso]" nella sola documentazione sanitaria; le «...» restano
 * integre attorno. Puro e idempotente. I numeri clinici (dosaggi, PA, date,
 * orari, valori di laboratorio, codici brevi) non combaciano con i pattern.
 */

const PLACEHOLDER = '[recapito omesso]';

/** Fisso: prefisso 0 + 1-4 cifre, separatore opzionale, 5-8 cifre (es. 045.8123456, 02 12345678).
 *  Mobile: 3 + 2 cifre, separatore opzionale, 6-7 cifre (es. 347 1234567), con +39 opzionale. */
const PHONE_RE = /(?<![\d.,/:-])(?:\+39[\s.]?)?(?:0\d{1,4}[\s./-]?\d{5,8}|3\d{2}[\s./-]?\d{6,7})(?![\d.,/:-])/g;
const EMAIL_RE = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;

export function scrubContactDetails(text: string): string {
  if (!text) return text;
  return text.replace(EMAIL_RE, PLACEHOLDER).replace(PHONE_RE, PLACEHOLDER);
}
