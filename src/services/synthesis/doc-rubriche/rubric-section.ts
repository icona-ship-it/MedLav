/**
 * Sezione "La Documentazione Medica Prodotta" in modalità 'rubriche', dai dati
 * come li vede l'espansione deterministica (documenti con pagine OCR + eventi
 * in forma DB): mappa verso il renderer per rubriche. Nessun LLM. Puro.
 */

import { describeDocumentBlock, buildBlockHeader } from './block-header';
import { renderRubricDocSanitaria, type RubricDocument, type RubricRenderResult } from './rubric-renderer';
import { DEFAULT_RUBRIC_POLICY, type RubricPolicy } from './rubric-policy';
import { DOCUMENT_TYPE_BLOCK_LABELS } from '../synthesis-prompts';
import { sanitizeVerbatimOcr } from '@/services/calculations/verbatim-sanitizer';
import { scrubContactDetails } from '../contact-scrub';

export interface RubricSectionDoc {
  documentId: string;
  documentType: string;
  pages: ReadonlyArray<{ pageNumber: number; ocrText: string }>;
}

export interface RubricSectionEvent {
  event_date: string;
  date_precision?: string | null;
  facility?: string | null;
  doctor?: string | null;
  document_id?: string | null;
  temporal_scope?: string | null;
}

const LETTERHEAD_RE = /^(?:[A-ZÀ-Ü][A-ZÀ-Ü.'’\-]*\s+){0,4}(OSPEDALE|AZIENDA|A\.?U\.?L\.?S\.?S\.?|ULSS|ASL|ASST|AOU|IRCCS|CENTRO|STUDIO|POLIAMBULATORIO|POLICLINICO|RADIOLOGIA|DIAGNOSTICA|ISTITUTO|CLINICA|CASA DI CURA|LABORATORIO|FONDAZIONE|PRESIDIO)\b[^\n|]{0,60}$/;
const EXAM_TITLE_RE = /^(RX|RM|RMN|TC|TAC|ECO|ECOGRAFIA|ECOCOLORDOPPLER|PET|MOC|DOPPLER)\b[^\n:|]{2,50}/im;

/** Indirizzo (via/piazza + numero o CAP): non è una struttura. */
const ADDRESS_RE = /(\b(via|viale|piazza|piazzale|corso|largo|strada|vicolo|contrada)\b[^\n]*\d|\b\d{5}\b)/i;
/** Ente/struttura riconoscibile (parola-chiave organizzativa). */
const ORGANIZATION_WORD_RE = /(ospedal|aziend|asl|ulss|ats|aou|irccs|centro|studio|poliambulator|policlinic|radiolog|diagnostic|istituto|clinic|casa di cura|laborator|fondazione|presidio|u\.?\s?o\.?|unit[àa]|dipartiment|reparto|ambulator|servizio|inps|inail|comune|regione|s\.?r\.?l|s\.?p\.?a|s\.?n\.?c|medic|fisioterap|riabilit|ortoped|new life|srl|spa|&)/i;

/** La struttura dell'intestazione non è un indirizzo né un nome di persona
 * (panel giro 8, caso C: "Via …, 17 - 37129 …" e "NOME COGNOME" al posto
 * della struttura). Indirizzo → omessa; nome di persona → "Dott. Nome Cognome". */
export function sanitizeFacility(facility: string | null): string | null {
  if (!facility) return null;
  const f = facility.replace(/\s+/g, ' ').trim();
  if (!f) return null;
  if (ADDRESS_RE.test(f)) return null;
  const words = f.split(' ');
  const personLike = words.length >= 2 && words.length <= 3 && !/\d|,|\(/.test(f) && !ORGANIZATION_WORD_RE.test(f) &&
    words.every((w) => /^[\p{Lu}][\p{L}'’.-]*$/u.test(w));
  if (!personLike) return f;
  const name = words.map((w) => (w === w.toUpperCase() ? w.charAt(0) + w.slice(1).toLowerCase() : w)).join(' ');
  return /^(dott|dr|prof)/i.test(name) ? name : `Dott. ${name}`;
}

/** Struttura dalla carta intestata (prime righe) quando gli eventi non la portano. */
export function facilityFromLetterhead(head: string): string | null {
  for (const raw of head.split('\n').slice(0, 12)) {
    const line = raw.replace(/[*#_|]/g, ' ').replace(/\s+/g, ' ').trim();
    if (line.length < 6 || line.length > 80) continue;
    if (LETTERHEAD_RE.test(line.toUpperCase()) && line === line.toUpperCase() && !/\d{5,}/.test(line)) {
      return line.replace(/\b([A-ZÀ-Ü])([A-ZÀ-Ü'’.-]*)/g, (_m, a: string, b: string) => a + b.toLowerCase()).replace(/\b(Di|Della|Del|Dei|E)\b/g, (m) => m.toLowerCase());
    }
  }
  return null;
}

/** Titolo dell'esame ("RX polso destro") come qualificatore dell'intestazione. */
export function examTitleFromText(head: string): string | null {
  const m = EXAM_TITLE_RE.exec(head);
  if (!m) return null;
  const t = m[0].replace(/\s+/g, ' ').trim().replace(/[.,;:\-]+$/, '');
  return t.length <= 50 ? t : null;
}

const RICOVERO_RANGE_RE = /dal\s+(\d{1,2})[./](\d{1,2})[./](\d{4})\s+al\s+(\d{1,2})[./](\d{1,2})[./](\d{4})/i;
const DIMESSO_RE = /dimess[oa]\s+(?:il|in data)\s+(\d{1,2})[./](\d{1,2})[./](\d{4})/i;

/** La lettera di dimissione sta alla data di DIMISSIONE (spec Lavini), letta dal testo. */
const it = (iso: string): string => `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}`;

/** "ricoverato/a dal X al Y" → {start, end} ISO, se presente. */
export function admissionRangeFromText(text: string): { start: string; end: string } | null {
  const range = RICOVERO_RANGE_RE.exec(text);
  if (!range) return null;
  const iso = (d: string, m: string, y: string): string => `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  const start = iso(range[1]!, range[2]!, range[3]!); const end = iso(range[4]!, range[5]!, range[6]!);
  return end >= start ? { start, end } : null;
}

export function dischargeDateFromText(text: string): string | null {
  const range = RICOVERO_RANGE_RE.exec(text);
  const iso = (d: string, m: string, y: string): string => `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  if (range) return iso(range[4]!, range[5]!, range[6]!);
  const dim = DIMESSO_RE.exec(text);
  return dim ? iso(dim[1]!, dim[2]!, dim[3]!) : null;
}

export function formatDocumentazioneSanitariaRubriche(
  docs: ReadonlyArray<RubricSectionDoc>,
  events: ReadonlyArray<RubricSectionEvent>,
  policy: RubricPolicy = DEFAULT_RUBRIC_POLICY,
): RubricRenderResult {
  const byDoc = new Map<string, RubricSectionEvent[]>();
  for (const e of events) {
    if (!e.document_id) continue;
    byDoc.set(e.document_id, [...(byDoc.get(e.document_id) ?? []), e]);
  }
  const rdocs: RubricDocument[] = docs.map((d) => {
    const docEvents = byDoc.get(d.documentId) ?? [];
    const evs = docEvents.map((e) => ({
      eventDate: e.event_date, datePrecision: e.date_precision ?? null, facility: e.facility ?? null, temporalScope: e.temporal_scope ?? null,
    }));
    const dating = describeDocumentBlock(evs);
    const head = d.pages.slice(0, 2).map((p) => p.ocrText ?? '').join('\n');
    const baseLabel = (d.documentType && d.documentType !== 'altro' ? DOCUMENT_TYPE_BLOCK_LABELS[d.documentType] : undefined) ?? 'Documento sanitario';
    // Qualificatore (spec: "Tipo – qualificatore"): titolo dell'esame strumentale.
    const exam = d.documentType === 'esame_strumentale' ? examTitleFromText(head) : null;
    const label = exam ? `${baseLabel} – ${exam}` : baseLabel;
    // Struttura: dagli eventi correnti; altrimenti dalla carta intestata; altrimenti il medico.
    const doctor = docEvents.find((e) => e.doctor && e.temporal_scope !== 'retrospettivo' && e.temporal_scope !== 'programmato')?.doctor ?? null;
    const facility = sanitizeFacility(dating.facility ?? facilityFromLetterhead(head)) ?? (doctor ? sanitizeFacility(doctor) : null);
    const range = d.documentType === 'lettera_dimissione' || d.documentType === 'cartella_clinica' ? admissionRangeFromText(head) : null;
    const discharge = d.documentType === 'lettera_dimissione' ? (range?.end ?? dischargeDateFromText(head)) : null;
    // "Ricoverato dal X al Y" nel testo batte la datazione dagli eventi (un evento
    // con data sbagliata non sposta più l'intestazione di un ricovero).
    const dateLabel = range ? `dal ${it(range.start)} al ${it(range.end)}` : dating.dateLabel;
    return {
      documentId: d.documentId,
      documentType: d.documentType,
      header: buildBlockHeader(label, facility, dateLabel),
      sortDate: discharge ?? range?.start ?? dating.sortIso,
      // Stessa pulizia dell'integrale (tabelle → testo, marker e immagini via).
      pages: d.pages.map((p) => ({ pageNumber: p.pageNumber, ocrText: sanitizeVerbatimOcr(p.ocrText ?? '') })),
    };
  });
  const out = renderRubricDocSanitaria(rdocs, policy);
  // Recapiti di terzi copiati dalla cartella: mai nel depositabile (GDPR).
  return { ...out, markdown: scrubContactDetails(out.markdown) };
}
