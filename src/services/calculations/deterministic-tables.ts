/**
 * Deterministic, pure renderers for the FACTUAL blocks of the report
 * (expense table, chronological index). The medico-legal principle: the perito
 * must never have to CORRECT a fact — facts are printed from the validated
 * data, never narrated by the LLM. These return Markdown pipe tables (rendered
 * natively by the HTML/DOCX export) and '' when there is nothing to show.
 *
 * Pure + client-safe: no I/O, no LLM. Reuses analyzeExpenses (amount/category
 * extraction) and sortEventsChrono (the single chronological comparator).
 */
import { formatDate } from '@/lib/format';
import { NON_CLINICAL_EVENT_TYPES } from '@/lib/constants';
import { sortEventsChrono } from '@/lib/event-order';
import { getDocumentTypeLabel, EXCLUDED_FROM_DOCUMENTAZIONE_SANITARIA } from '@/lib/document-type-labels';
import { analyzeExpenses } from '@/services/expenses/expense-analyzer';
import { calculateITTITP, formatITTITPTable } from './medico-legal-calc';

/** Minimal event shape needed to render the deterministic tables. Compatible
 * with the DB row (snake_case) and easily mapped from ConsolidatedEvent. */
export interface DeterministicTableEvent {
  event_date: string;
  event_type: string;
  title: string;
  description: string;
  facility?: string | null;
  doctor?: string | null;
  source_type?: string | null;
  order_number?: number | null;
  /** Source document id — used to order the verbatim documentation chronologically. */
  document_id?: string | null;
}

/** A single OCR page of a document (verbatim text). */
export interface DeterministicDocPage {
  pageNumber: number;
  ocrText: string;
}

/** A document with its verbatim OCR pages, for the deterministic documentation. */
export interface DeterministicDoc {
  documentId: string;
  fileName: string;
  documentType: string;
  pages: DeterministicDocPage[];
}

const SENTINEL_DATE = '1900-01-01';
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Display a date, or '—' for missing/sentinel/non-ISO (never leak 01/01/1900). */
function displayDate(d: string | null | undefined): string {
  if (!d || d === SENTINEL_DATE || !ISO_DATE_RE.test(d)) return '—';
  return formatDate(d);
}

/** Escape pipes so a cell can never break the Markdown table columns. */
function cell(value: string | null | undefined): string {
  const v = (value ?? '').replace(/\|/g, '\\|').replace(/\n+/g, ' ').trim();
  return v || '—';
}

/** Italian euro formatting, deterministic. */
function formatEuro(amount: number): string {
  return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(amount);
}

/** 'spesa_medica' → 'Spesa medica' (light prettify for the type column). */
function prettifyType(eventType: string): string {
  const s = (eventType ?? '').replace(/_/g, ' ').trim();
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : '—';
}

/**
 * Render the medical-expense table from the case events. Only `spesa_medica`
 * events are listed (the documented expenses); amounts are extracted by the
 * same logic as the expense-analysis module. Date '—' for undated/sentinel,
 * Importo '—' when no amount could be parsed (insert it at the source).
 * Returns '' when there are no expense events.
 */
export function formatExpenseTable(events: DeterministicTableEvent[]): string {
  const expenses = events.filter((e) => e.event_type === 'spesa_medica');
  if (expenses.length === 0) return '';

  const { items, totalAmount } = analyzeExpenses(
    expenses.map((e) => ({
      event_type: e.event_type,
      title: e.title ?? '',
      description: e.description ?? '',
      event_date: e.event_date ?? '',
      facility: e.facility ?? null,
      source_type: e.source_type ?? 'altro',
    })),
  );
  if (items.length === 0) return '';

  const rows = items.map((it) =>
    `| ${displayDate(it.date)} | ${cell(it.description)} | ${cell(it.facility)} | ${it.amount !== null ? formatEuro(it.amount) : '—'} |`,
  );
  const someMissing = items.some((it) => it.amount === null);
  const totalCell = totalAmount !== null ? `**${formatEuro(totalAmount)}**` : '—';
  const totalNote = someMissing ? ' *(alcuni importi non rilevati — inserirli alla fonte)*' : '';

  return [
    '| Data | Descrizione | Struttura | Importo |',
    '|---|---|---|---|',
    ...rows,
    `| **Totale** | | | ${totalCell}${totalNote} |`,
  ].join('\n');
}

/**
 * Render the chronological index of clinical events (date + type + author +
 * title) as a factual anchor. Non-clinical events (expenses, administrative
 * docs) are excluded; undated events sort to the bottom with '—'. Sorted by the
 * single shared comparator (sortEventsChrono). Returns '' when empty.
 */
export function formatChronologyIndex(events: DeterministicTableEvent[]): string {
  const clinical = events.filter((e) => !NON_CLINICAL_EVENT_TYPES.has(e.event_type));
  if (clinical.length === 0) return '';

  const rows = sortEventsChrono(clinical).map((e) =>
    `| ${displayDate(e.event_date)} | ${prettifyType(e.event_type)} | ${cell(e.facility ?? e.doctor)} | ${cell(e.title)} |`,
  );

  return [
    '| Data | Tipo | Autore/Struttura | Titolo |',
    '|---|---|---|---|',
    ...rows,
  ].join('\n');
}

/**
 * Render the "documentazione sanitaria" section VERBATIM from the OCR text —
 * NO LLM. Each document becomes a heading (type + file name + derived date)
 * followed by its OCR text, page by page, exactly as extracted. Documents are
 * ordered chronologically using the earliest dated event that references them
 * (undated documents go last, keeping their input order). Empty/illegible pages
 * are marked explicitly instead of being dropped silently.
 *
 * The doctor's text is reproduced as-is: pipes are NOT escaped (valid Markdown
 * tables in the OCR must survive), and no rephrasing is possible. Returns '' when
 * there are no documents (caller substitutes the empty fallback).
 */
export function formatDocumentazioneSanitaria(
  docs: DeterministicDoc[],
  events: DeterministicTableEvent[],
): string {
  // Only CLINICAL documents: atti/perizie/spese are reproduced in their own
  // sections (same partition as the LLM path's EXCLUDED_FROM_MEDICAL).
  docs = docs.filter((d) => !EXCLUDED_FROM_DOCUMENTAZIONE_SANITARIA.has(d.documentType));
  if (docs.length === 0) return '';

  // Earliest dated event per document → the document's chronological position.
  const docDate = new Map<string, string>();
  for (const e of events) {
    const id = e.document_id;
    const d = e.event_date;
    if (!id || !d || d === SENTINEL_DATE || !ISO_DATE_RE.test(d)) continue;
    const prev = docDate.get(id);
    if (!prev || d < prev) docDate.set(id, d);
  }

  // Stable chronological sort: dated docs by date, undated docs last in input order.
  const ordered = docs
    .map((doc, index) => ({ doc, index }))
    .sort((a, b) => {
      const da = docDate.get(a.doc.documentId);
      const db = docDate.get(b.doc.documentId);
      if (da && db) return da < db ? -1 : da > db ? 1 : a.index - b.index;
      if (da && !db) return -1;
      if (!da && db) return 1;
      return a.index - b.index;
    })
    .map((x) => x.doc);

  const parts: string[] = [];
  for (const doc of ordered) {
    const d = docDate.get(doc.documentId);
    const dateSuffix = d ? ` — ${formatDate(d)}` : '';
    parts.push(`### ${getDocumentTypeLabel(doc.documentType)}: ${doc.fileName}${dateSuffix}`);

    if (doc.pages.length === 0) {
      parts.push('*[Testo non disponibile per questo documento.]*');
    } else {
      for (const page of doc.pages) {
        const text = (page.ocrText ?? '').trim();
        parts.push(text ? text : `*[Pagina ${page.pageNumber} — testo non disponibile o illeggibile; verificare sul documento originale.]*`);
        parts.push('\n---\n');
      }
    }
    parts.push('');
  }

  return parts.join('\n').trim();
}

// ---------------------------------------------------------------------------
// Deterministic-block expansion (at-read-time)
// ---------------------------------------------------------------------------

/** Sentinel markers embedded in the saved report markdown. Expanded from the
 * CURRENT events at read time (UI + export) so the factual blocks never drift.
 * HTML comments → fail-safe: if a surface forgets to expand, they render as
 * nothing rather than breaking the layout. */
export const DETERMINISTIC_MARKERS = {
  ITT_ITP: '<!--MEDLAV:ITT_ITP-->',
  SPESE: '<!--MEDLAV:SPESE-->',
  CRONO: '<!--MEDLAV:CRONO-->',
  DOC_SANITARIA: '<!--MEDLAV:DOC_SANITARIA-->',
} as const;

const EMPTY_FALLBACK: Record<keyof typeof DETERMINISTIC_MARKERS, string> = {
  ITT_ITP: '_Periodi di invalidità temporanea non calcolabili dai dati disponibili._',
  SPESE: '_Nessuna spesa medica documentata._',
  CRONO: '_Nessun evento clinico in cronologia._',
  DOC_SANITARIA: '_Nessun documento sanitario disponibile._',
};

/** True if the synthesis contains at least one deterministic marker. */
export function hasDeterministicMarkers(synthesis: string): boolean {
  return Object.values(DETERMINISTIC_MARKERS).some((m) => synthesis.includes(m));
}

/** Map loosely-typed DB rows (export pipeline) to the renderer event shape. */
export function toDeterministicEvents(
  rows: ReadonlyArray<Record<string, unknown>>,
): DeterministicTableEvent[] {
  return rows.map((e) => ({
    event_date: (e.event_date as string) ?? '',
    event_type: (e.event_type as string) ?? '',
    title: (e.title as string) ?? '',
    description: (e.description as string) ?? '',
    facility: (e.facility as string | null) ?? null,
    doctor: (e.doctor as string | null) ?? null,
    source_type: (e.source_type as string | null) ?? null,
    order_number: (e.order_number as number | null) ?? null,
    document_id: (e.document_id as string | null) ?? null,
  }));
}

/**
 * Build DeterministicDoc[] from a document-metadata list + a FLAT page list
 * (client surfaces: the case page loads documents + documentPages separately).
 * Groups pages by document_id and sorts them by page number.
 */
export function buildDeterministicDocs(
  documents: ReadonlyArray<{ id: string; file_name: string; document_type: string | null }>,
  pages: ReadonlyArray<{ document_id: string; page_number: number; ocr_text: string | null }>,
): DeterministicDoc[] {
  const byDoc = new Map<string, DeterministicDocPage[]>();
  for (const p of pages) {
    const arr = byDoc.get(p.document_id) ?? [];
    arr.push({ pageNumber: p.page_number, ocrText: p.ocr_text ?? '' });
    byDoc.set(p.document_id, arr);
  }
  return documents.map((d) => ({
    documentId: d.id,
    fileName: d.file_name,
    documentType: d.document_type ?? 'altro',
    pages: (byDoc.get(d.id) ?? []).slice().sort((a, b) => a.pageNumber - b.pageNumber),
  }));
}

/** Map document+pages rows (export/pipeline) to the verbatim renderer shape. */
export function toDeterministicDocs(
  rows: ReadonlyArray<{ id: string; fileName: string; documentType: string; pages: ReadonlyArray<{ pageNumber: number; ocrText: string }> }>,
): DeterministicDoc[] {
  return rows.map((d) => ({
    documentId: d.id,
    fileName: d.fileName,
    documentType: d.documentType,
    pages: d.pages.map((p) => ({ pageNumber: p.pageNumber, ocrText: p.ocrText })),
  }));
}

/**
 * Replace the deterministic sentinel markers in a report's markdown with content
 * rendered from the CURRENT events/documents. Pure, no LLM. Idempotent and a
 * no-op on legacy reports (no markers).
 *
 * `docs` is optional: when omitted (a surface that hasn't wired the OCR yet) the
 * DOC_SANITARIA marker is LEFT IN PLACE as an invisible HTML comment — never
 * replaced with a misleading "no documents" message.
 */
export function expandDeterministicBlocks(
  synthesis: string,
  events: DeterministicTableEvent[],
  docs?: DeterministicDoc[],
): string {
  if (!synthesis || !hasDeterministicMarkers(synthesis)) return synthesis;

  const replacements: Array<[string, string]> = [
    [DETERMINISTIC_MARKERS.ITT_ITP, formatITTITPTable(calculateITTITP(events)) || EMPTY_FALLBACK.ITT_ITP],
    [DETERMINISTIC_MARKERS.SPESE, formatExpenseTable(events) || EMPTY_FALLBACK.SPESE],
    [DETERMINISTIC_MARKERS.CRONO, formatChronologyIndex(events) || EMPTY_FALLBACK.CRONO],
  ];
  if (docs !== undefined) {
    replacements.push([
      DETERMINISTIC_MARKERS.DOC_SANITARIA,
      formatDocumentazioneSanitaria(docs, events) || EMPTY_FALLBACK.DOC_SANITARIA,
    ]);
  }

  let out = synthesis;
  for (const [marker, rendered] of replacements) {
    if (out.includes(marker)) out = out.split(marker).join(rendered);
  }
  return out;
}
