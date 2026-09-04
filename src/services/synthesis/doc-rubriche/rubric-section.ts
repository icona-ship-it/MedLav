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
  document_id?: string | null;
  temporal_scope?: string | null;
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
    const evs = (byDoc.get(d.documentId) ?? []).map((e) => ({
      eventDate: e.event_date, datePrecision: e.date_precision ?? null, facility: e.facility ?? null, temporalScope: e.temporal_scope ?? null,
    }));
    const dating = describeDocumentBlock(evs);
    const label = (d.documentType && d.documentType !== 'altro' ? DOCUMENT_TYPE_BLOCK_LABELS[d.documentType] : undefined) ?? 'Documento sanitario';
    const head = d.pages.slice(0, 2).map((p) => p.ocrText ?? '').join('\n');
    const range = d.documentType === 'lettera_dimissione' || d.documentType === 'cartella_clinica' ? admissionRangeFromText(head) : null;
    const discharge = d.documentType === 'lettera_dimissione' ? (range?.end ?? dischargeDateFromText(head)) : null;
    // "Ricoverato dal X al Y" nel testo batte la datazione dagli eventi (un evento
    // con data sbagliata non sposta più l'intestazione di un ricovero).
    const dateLabel = range ? `dal ${it(range.start)} al ${it(range.end)}` : dating.dateLabel;
    return {
      documentId: d.documentId,
      documentType: d.documentType,
      header: buildBlockHeader(label, dating.facility, dateLabel),
      sortDate: discharge ?? range?.start ?? dating.sortIso,
      // Stessa pulizia dell'integrale (tabelle → testo, marker e immagini via).
      pages: d.pages.map((p) => ({ pageNumber: p.pageNumber, ocrText: sanitizeVerbatimOcr(p.ocrText ?? '') })),
    };
  });
  const out = renderRubricDocSanitaria(rdocs, policy);
  // Recapiti di terzi copiati dalla cartella: mai nel depositabile (GDPR).
  return { ...out, markdown: scrubContactDetails(out.markdown) };
}
