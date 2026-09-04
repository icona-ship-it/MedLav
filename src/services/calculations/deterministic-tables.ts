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
import { formatDate, formatEuro } from '@/lib/format';
import { NON_CLINICAL_EVENT_TYPES } from '@/lib/constants';
import { sortEventsChrono } from '@/lib/event-order';
import { getDocumentTypeLabel, EXCLUDED_FROM_DOCUMENTAZIONE_SANITARIA } from '@/lib/document-type-labels';
import { analyzeExpenses, collectSsnCosts } from '@/services/expenses/expense-analyzer';
import { computeRelevanceTier } from '@/lib/event-relevance';
import { calculateITTITP, formatITTITPTable, formatRicoveroITTFactsBlock } from './medico-legal-calc';
import { expandStimaDannoMarkers, STIMA_DANNO_MARKER_PREFIX } from './stima-danno-block';
import { sanitizeVerbatimOcr } from './verbatim-sanitizer';

/** Minimal event shape needed to render the deterministic tables. Compatible
 * with the DB row (snake_case) and easily mapped from ConsolidatedEvent. */
export interface DeterministicTableEvent {
  event_date: string;
  /** Precisione data (giorno|mese|anno|sconosciuta). Serve ai FATTI deterministici
   * (ricovero/durata) per escludere le menzioni anno-only (anamnesi → 01.01.YYYY). */
  date_precision?: string | null;
  event_type: string;
  title: string;
  description: string;
  facility?: string | null;
  doctor?: string | null;
  source_type?: string | null;
  order_number?: number | null;
  /** Source document id — used to order/cite the verbatim documentation. */
  document_id?: string | null;
  /** Verbatim OCR span the event was extracted from (the selective quote). */
  source_text?: string | null;
  /** Documented diagnosis (drives the relevance tier). */
  diagnosis?: string | null;
  /** Pagine del documento da cui l'evento è stato estratto (per il filtro
   * per-pagina della doc-sanitaria). Accetta sia l'array parsato (export via
   * toDeterministicEvents) sia la stringa JSON grezza del DB (viewer client che
   * passa EventRow direttamente); parseSourcePages normalizza entrambi. */
  source_pages?: number[] | string | null;
  /** Ambito temporale (migration 0034): corrente | retrospettivo | programmato.
   * Assente/null = corrente (righe legacy). */
  temporal_scope?: string | null;
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


/**
 * Render the medical-expense table from the case events. Only `spesa_medica`
 * events are listed (the documented expenses); amounts are extracted by the
 * same logic as the expense-analysis module. Date '—' for undated/sentinel,
 * Importo '—' when no amount could be parsed (insert it at the source).
 * Returns '' when there are no expense events.
 */
/**
 * Fatti deterministici in coda all'Epicrisi: giorni di ricovero/ITT + la riga
 * col TOTALE delle spese documentate. La riga spese vive QUI e non nel testo
 * LLM (bug 221, 2026-07-16): il CoVe non può verificare una SOMMA che non è
 * scritta in nessun documento e la sostituiva con "[non documentato]"; un fatto
 * calcolato va emesso a valle della generazione, sempre in sync con gli eventi
 * e immune ai verificatori. Stesso valore della tabella Spese (analyzeExpenses).
 */
export function formatEpicrisiFactsBlock(events: DeterministicTableEvent[], incidentDate?: string | null): string {
  const ittBlock = formatRicoveroITTFactsBlock(events, incidentDate);
  const expenses = events.filter((e) => e.event_type === 'spesa_medica');
  let speseLine = '';
  if (expenses.length > 0) {
    const { totalAmount } = analyzeExpenses(
      expenses.map((e) => ({
        event_type: e.event_type,
        title: e.title ?? '',
        description: e.description ?? '',
        event_date: e.event_date ?? '',
        facility: e.facility ?? null,
        source_type: e.source_type ?? 'altro',
        source_text: e.source_text ?? null,
      })),
    );
    if (totalAmount !== null && totalAmount > 0) {
      speseLine = `Le spese mediche documentate ammontano a complessivi ${formatEuro(totalAmount)} (dettaglio nella sezione delle spese).`;
    }
  }
  return [ittBlock, speseLine].filter(Boolean).join('\n\n');
}

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
      // Fallback importo: l'ancora verbatim OCR spesso contiene la cifra anche
      // quando titolo/descrizione non la riportano (casi reali 2026-07-14).
      source_text: e.source_text ?? null,
    })),
  );
  if (items.length === 0) return '';

  // Colonna "N. Ricevuta/Fattura" (benchmark spese 2026-06-10 + gold CTU):
  // best-effort dal testo dell'evento, '—' quando non riconoscibile.
  const rows = items.map((it) =>
    `| ${displayDate(it.date)} | ${cell(it.description)} | ${cell(it.facility)} | ${cell(it.receiptRef ?? null)} | ${it.amount !== null ? formatEuro(it.amount) : '—'} |`,
  );
  const someMissing = items.some((it) => it.amount === null);
  const totalCell = totalAmount !== null ? `**${formatEuro(totalAmount)}**` : '—';
  const totalNote = someMissing ? ' *(alcuni importi non rilevati — inserirli alla fonte)*' : '';

  return [
    '| Data | Descrizione | Struttura | N. Ricevuta/Fattura | Importo |',
    '|---|---|---|---|---|',
    ...rows,
    `| **Totale** | | | | ${totalCell}${totalNote} |`,
  ].join('\n');
}

/**
 * Tabella SEPARATA dei costi a carico del Servizio Sanitario (SSN/SSR) — le
 * notifiche-costo escluse dalle spese risarcibili del danneggiato. Distinta
 * perché sono costi pubblici, NON out-of-pocket del periziando, ma il perito
 * vuole vederli ordinati. Restituisce '' se non ce ne sono. Deterministica.
 */
export function formatSsnCostTable(events: DeterministicTableEvent[]): string {
  const expenses = events.filter((e) => e.event_type === 'spesa_medica');
  if (expenses.length === 0) return '';

  const { items, total } = collectSsnCosts(
    expenses.map((e) => ({
      event_type: e.event_type,
      title: e.title ?? '',
      description: e.description ?? '',
      event_date: e.event_date ?? '',
      facility: e.facility ?? null,
      source_type: e.source_type ?? 'altro',
      source_text: e.source_text ?? null,
    })),
  );
  if (items.length === 0) return '';

  const rows = items.map((it) =>
    `| ${displayDate(it.date)} | ${cell(it.description)} | ${cell(it.facility)} | ${it.amount !== null ? formatEuro(it.amount) : '—'} |`,
  );
  const someMissing = items.some((it) => it.amount === null);
  const totalCell = total !== null ? `**${formatEuro(total)}**` : '—';
  const totalNote = someMissing ? ' *(alcuni importi non rilevati)*' : '';

  return [
    '_Costi sostenuti dal Servizio Sanitario (SSN/SSR), non a carico del danneggiato — riportati per completezza:_',
    '',
    '| Data | Descrizione | Struttura | Importo (a carico SSN) |',
    '|---|---|---|---|',
    ...rows,
    `| **Totale a carico SSN** | | | ${totalCell}${totalNote} |`,
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

  // Niente colonna Tipo: dicitura interna dell'app che il perito elimina
  // sempre dalla cronologia (benchmark gold passaniti 2026-06-10).
  // Ambito temporale (0034): una menzione anamnestica o un esame programmato
  // non può leggersi come atto autonomo dentro una perizia depositabile.
  const scopeSuffix = (e: DeterministicTableEvent): string =>
    e.temporal_scope === 'retrospettivo' ? ' (riferito in anamnesi)'
      : e.temporal_scope === 'programmato' ? ' (programmato nel documento)'
        : '';
  const rows = sortEventsChrono(clinical).map((e) =>
    `| ${displayDate(e.event_date)} | ${cell(e.facility ?? e.doctor)} | ${cell(`${e.title}${scopeSuffix(e)}`)} |`,
  );

  return [
    '| Data | Autore/Struttura | Titolo |',
    '|---|---|---|',
    ...rows,
  ].join('\n');
}

/**
 * Demote H1/H2 headings inside the verbatim OCR to H4, so an OCR line like
 * "## REFERTO" can never collide with the report's own "## " SECTION delimiter.
 * The visible text is preserved — only the Markdown heading LEVEL changes.
 */
function demoteOcrHeadings(text: string): string {
  return text.replace(/^(#{1,2})(\s)/gm, '####$2');
}

/**
 * Render the "documentazione sanitaria" section — NO LLM, COMPLETE (mai perdere un
 * fatto): (a) un ELENCO ANALITICO degli atti esaminati (navigazione), poi (b) la
 * RIPRODUZIONE INTEGRALE e VERBATIM dell'OCR di ogni documento clinico, pagina per
 * pagina, in ordine cronologico. Le pagine illeggibili sono marcate, mai droppate.
 *
 * NB: la riproduzione è COMPLETA per costruzione (la selettività "cosa è
 * importante vs rumore" richiede giudizio = LLM, fuori da questo renderer puro).
 * Returns '' when there are no clinical documents (caller uses the empty fallback).
 */
/**
 * Selettività doc-sanitaria "solo eventi importanti" (Lavini 2026-07-05,
 * meccanismo scelto 2026-07-07 su dati reali: source_pages è 100% popolato
 * sui casi reali, 0 eventi importanti senza pagina).
 *
 * FILTRO PER-PAGINA: nei documenti GRANDI (> soglia pagine) si riproduce
 * verbatim SOLO le pagine che contengono un reperto importante (T1/T2:
 * diagnosi, interventi, ricoveri, complicanze, visite, referti, terapie,
 * imaging). Si saltano le pagine con soli eventi di routine T3 (lab seriali,
 * prescrizioni). Mantiene TESTO VERBATIM REALE (no LLM, no troncamento) e la
 * tracciabilità piena (il documento resta INTERO nell'elenco analitico +
 * nota di quante pagine su quante). Documenti PICCOLI riprodotti interi.
 *
 * SICUREZZE (atto depositabile — "mai perdere un fatto importante"):
 * - "importante" è INCLUSIVO (T1 O T2): un dubbio tiene la pagina.
 * - Fallback conservativo: se un documento grande ha reperti importanti ma
 *   NESSUNO risolve a una sua pagina (source_pages inaffidabile per quel doc),
 *   il documento si riproduce INTERO.
 * - Le pagine con reperti importanti sono SEMPRE tenute integre.
 * Config: flag unico, Lavini può disattivarlo/tarare la soglia.
 */
export const DOC_SANITARIA_PAGE_FILTER = true;
/** Documenti con più pagine di questa vengono filtrati; sotto, riprodotti interi. */
export const DOC_SANITARIA_LARGE_DOC_PAGES = 8;

/** Pagine (per documento) che contengono almeno un evento T1/T2 (importante).
 * Inclusivo per sicurezza: computeRelevanceTier ritorna T1 su diagnosi/
 * intervento/ricovero/complicanza (e diagnosi presente), T2 su visita/referto/
 * terapia/imaging strumentale. Le pagine con soli lab/prescrizioni (T3) restano fuori. */
function buildImportantPagesByDoc(events: DeterministicTableEvent[]): Map<string, Set<number>> {
  const byDoc = new Map<string, Set<number>>();
  for (const e of events) {
    if (!e.document_id) continue;
    const pages = parseSourcePages(e.source_pages);
    if (!pages) continue;
    const tier = computeRelevanceTier({
      eventType: e.event_type,
      diagnosis: e.diagnosis,
      sourceType: e.source_type,
    });
    if (tier === 'T3') continue; // pagina di sola routine: non la tiene questo evento
    let set = byDoc.get(e.document_id);
    if (!set) { set = new Set<number>(); byDoc.set(e.document_id, set); }
    for (const p of pages) set.add(p);
  }
  return byDoc;
}

export interface DocSanitariaOptions {
  /** Nome file nell'elenco analitico (riferimento tecnico della perizia).
   * false per la cronistoria: i nomi file possono contenere il nome del
   * paziente e nel deliverable non servono (giro avversariale 2026-09-04). */
  includeFileNames?: boolean;
  /** Filtro per-pagina sui documenti grandi. false = trascrizione integrale. */
  pageFilter?: boolean;
}

/** Pagine effettivamente rese per un documento (stessa regola del renderer):
 * filtro per-pagina SOLO su documenti grandi con pagine-importanti risolte;
 * se il filtro azzererebbe tutto, intero. Puro, riusato dalla copertura. */
export function selectDocSanitariaPages(
  doc: DeterministicDoc,
  importantPages: Set<number> | undefined,
  pageFilter: boolean = DOC_SANITARIA_PAGE_FILTER,
): { pages: DeterministicDocPage[]; partial: boolean } {
  const isLarge = doc.pages.length > DOC_SANITARIA_LARGE_DOC_PAGES;
  const applyFilter = pageFilter && isLarge && importantPages !== undefined && importantPages.size > 0;
  const pagesToRender = applyFilter ? doc.pages.filter((p) => importantPages!.has(p.pageNumber)) : doc.pages;
  const finalPages = pagesToRender.length > 0 ? pagesToRender : doc.pages;
  return { pages: finalPages, partial: applyFilter && finalPages.length < doc.pages.length };
}

/** Copertura della trascrizione per documento clinico: pagine rese / totali.
 * È ciò che l'appendice di verifica dichiara — calcolato con la STESSA regola
 * del renderer, mai affermato (giro avversariale 2026-09-04). */
export function computeTranscriptionCoverage(
  docs: DeterministicDoc[],
  events: DeterministicTableEvent[],
  opts: DocSanitariaOptions = {},
): Map<string, { rendered: number; total: number; withText: number }> {
  const pageFilter = opts.pageFilter ?? DOC_SANITARIA_PAGE_FILTER;
  const importantPagesByDoc = pageFilter ? buildImportantPagesByDoc(events) : new Map<string, Set<number>>();
  const out = new Map<string, { rendered: number; total: number; withText: number }>();
  for (const doc of docs) {
    if (EXCLUDED_FROM_DOCUMENTAZIONE_SANITARIA.has(doc.documentType)) continue;
    const { pages } = selectDocSanitariaPages(doc, importantPagesByDoc.get(doc.documentId), pageFilter);
    // withText: pagine rese CON testo leggibile. Una pagina resa come
    // "[testo non disponibile]" non è trascritta: l'appendice non deve dire
    // "integralmente" (giro avversariale 2026-09-04).
    const withText = pages.filter((p) => (p.ocrText ?? '').trim().length > 0).length;
    out.set(doc.documentId, { rendered: pages.length, total: doc.pages.length, withText });
  }
  return out;
}

export function formatDocumentazioneSanitaria(
  docs: DeterministicDoc[],
  events: DeterministicTableEvent[],
  opts: DocSanitariaOptions = {},
): string {
  const includeFileNames = opts.includeFileNames ?? true;
  const pageFilter = opts.pageFilter ?? DOC_SANITARIA_PAGE_FILTER;
  // Only CLINICAL documents (atti/perizie/spese live in their own sections).
  const clinicalDocs = docs.filter((d) => !EXCLUDED_FROM_DOCUMENTAZIONE_SANITARIA.has(d.documentType));
  if (clinicalDocs.length === 0) return '';

  // Earliest dated CURRENT event per document → the document's chronological
  // position (0034: l'anamnesi di un referto del 22.05 non lo data al 27.02).
  // Fallback: qualsiasi evento datato, per righe legacy o documenti di sole
  // menzioni — mai un documento senza posizione se una data ce l'ha.
  // Fallback a gradini: corrente → retrospettivo → programmato (mai una data
  // PREVISTA usata come data di un documento che ha fatti riferiti).
  const docDate = new Map<string, string>();
  const docDateRetro = new Map<string, string>();
  const docDateScheduled = new Map<string, string>();
  for (const e of events) {
    const id = e.document_id;
    const d = e.event_date;
    if (!id || !d || d === SENTINEL_DATE || !ISO_DATE_RE.test(d)) continue;
    const target = e.temporal_scope === 'retrospettivo' ? docDateRetro
      : e.temporal_scope === 'programmato' ? docDateScheduled
        : docDate;
    const prev = target.get(id);
    if (!prev || d < prev) target.set(id, d);
  }
  for (const tier of [docDateRetro, docDateScheduled]) {
    for (const [id, d] of tier) {
      if (!docDate.has(id)) docDate.set(id, d);
    }
  }

  // Struttura/autore per documento (benchmark gold 2026-06-10: l'header del
  // blocco è "Tipo, Struttura/Autore in data DD.MM.YYYY:" — mai il filename,
  // che non compare in una perizia depositabile). Primo evento con il dato.
  // Attribuzione dai soli eventi 'corrente' (0034): l'evento più antico è
  // quasi sempre la menzione anamnestica, con la struttura di un ALTRO ente.
  // Fallback su tutti gli eventi (righe legacy, documenti di sole menzioni).
  const docAttribution = new Map<string, string>();
  const isDatingScope = (e: DeterministicTableEvent): boolean =>
    e.temporal_scope !== 'retrospettivo' && e.temporal_scope !== 'programmato';
  for (const pass of [events.filter(isDatingScope), events]) {
    for (const e of pass) {
      const id = e.document_id;
      if (!id || docAttribution.has(id)) continue;
      const attribution = e.facility?.trim() || e.doctor?.trim();
      if (attribution) docAttribution.set(id, attribution);
    }
  }

  // Chronological order: dated docs first (by date), undated last in input order.
  const orderedDocs = clinicalDocs
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

  // (a) ELENCO ANALITICO degli atti — navigazione, tracciabilità completa.
  const parts: string[] = ['**Documenti sanitari esaminati:**', ''];
  for (const doc of orderedDocs) {
    const d = docDate.get(doc.documentId);
    const pageInfo = doc.pages.length ? ` (${doc.pages.length} ${doc.pages.length === 1 ? 'pagina' : 'pagine'})` : '';
    const dateInfo = d ? `, ${formatDate(d)}` : '';
    const fileRef = includeFileNames ? ` — *${doc.fileName}*` : '';
    parts.push(`- ${getDocumentTypeLabel(doc.documentType)}${fileRef}${pageInfo}${dateInfo}`);
  }

  // Pagine importanti per documento (T1/T2) — per il filtro per-pagina.
  const importantPagesByDoc = pageFilter
    ? buildImportantPagesByDoc(events)
    : new Map<string, Set<number>>();

  // (b) RIPRODUZIONE INTEGRALE VERBATIM — per documento, pagina per pagina.
  // Header di blocco in formato perizia (benchmark gold 2026-06-10):
  // "**Tipo, Struttura/Autore in data DD.MM.YYYY:**" — il filename resta SOLO
  // nell'elenco analitico iniziale come riferimento tecnico.
  for (const doc of orderedDocs) {
    const d = docDate.get(doc.documentId);
    const attribution = docAttribution.get(doc.documentId);
    const header = `**${getDocumentTypeLabel(doc.documentType)}${attribution ? `, ${attribution}` : ''}${d ? ` in data ${formatDate(d)}` : ''}:**`;
    parts.push('', header);
    if (doc.pages.length === 0) {
      parts.push('*[Testo non disponibile per questo documento.]*');
    } else {
      // Filtro per-pagina: SOLO su documenti grandi, e solo se il documento ha
      // pagine-importanti risolte (altrimenti fallback conservativo = intero).
      const { pages: finalPages, partial } = selectDocSanitariaPages(doc, importantPagesByDoc.get(doc.documentId), pageFilter);
      if (partial) {
        parts.push(`*[Riprodotte le ${finalPages.length} pagine con i reperti principali su ${doc.pages.length}; documento integrale agli atti.]*`);
      }
      for (const page of finalPages) {
        // QA 2026-06-11: the raw OCR carries artifacts (broken image refs,
        // marker-wrapped HTML tables, null leaks) that must never reach a
        // depositable perizia — sanitized content-preserving, never summarized.
        const text = sanitizeVerbatimOcr((page.ocrText ?? '').trim());
        parts.push(text ? demoteOcrHeadings(text) : `*[Pagina ${page.pageNumber} — testo non disponibile o illeggibile; verificare sul documento originale.]*`);
        // Plain blank line between pages — the old '---' rendered as a rule
        // line between EVERY page (431 per report), pure visual noise.
        parts.push('');
      }
    }
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
  /** Epicrisi RC: giorni di ricovero (inclusivi) + durata complessiva malattia,
   * ASSERITI deterministicamente (non più rifiutati/sbagliati dall'LLM). */
  ITT_RICOVERO_FACTS: '<!--MEDLAV:ITT_RICOVERO_FACTS-->',
} as const;

const EMPTY_FALLBACK: Record<keyof typeof DETERMINISTIC_MARKERS, string> = {
  ITT_ITP: '_Periodi di invalidità temporanea non calcolabili dai dati disponibili._',
  SPESE: '_Non risultano spese mediche a carico del danneggiato documentate negli atti._',
  CRONO: '_Nessun evento clinico in cronologia._',
  DOC_SANITARIA: '_Nessun documento sanitario disponibile._',
  // Nessun fatto calcolabile → niente blocco (l'LLM ha già scritto la sintesi sopra).
  ITT_RICOVERO_FACTS: '',
};

/**
 * Note used when DOC_SANITARIA is expanded WITHOUT docs (the public shared link
 * deliberately omits the raw clinical OCR for GDPR). Replaces the otherwise
 * invisible marker so the section intro isn't left orphaned, without exposing the
 * documents or implying — misleadingly — that none exist.
 */
export const DOC_SANITARIA_OMITTED =
  '_La documentazione sanitaria integrale è consultabile nella perizia completa._';

/** True if the synthesis contains at least one deterministic marker.
 * Includes the parameterized STIMA_DANNO sentinel (prefix match — the case
 * type is embedded in the marker, see stima-danno-block.ts). */
export function hasDeterministicMarkers(synthesis: string): boolean {
  return Object.values(DETERMINISTIC_MARKERS).some((m) => synthesis.includes(m))
    || synthesis.includes(STIMA_DANNO_MARKER_PREFIX);
}

/** Map loosely-typed DB rows (export pipeline) to the renderer event shape. */
export function toDeterministicEvents(
  rows: ReadonlyArray<Record<string, unknown>>,
): DeterministicTableEvent[] {
  return rows.map((e) => ({
    event_date: (e.event_date as string) ?? '',
    date_precision: (e.date_precision as string | null) ?? null,
    event_type: (e.event_type as string) ?? '',
    title: (e.title as string) ?? '',
    description: (e.description as string) ?? '',
    facility: (e.facility as string | null) ?? null,
    doctor: (e.doctor as string | null) ?? null,
    source_type: (e.source_type as string | null) ?? null,
    order_number: (e.order_number as number | null) ?? null,
    document_id: (e.document_id as string | null) ?? null,
    source_text: (e.source_text as string | null) ?? null,
    diagnosis: (e.diagnosis as string | null) ?? null,
    source_pages: parseSourcePages(e.source_pages),
    temporal_scope: (e.temporal_scope as string | null) ?? null,
  }));
}

/** source_pages arriva dal DB come stringa JSON ("[1,2,3]") o già come array.
 * Ritorna numeri interi ≥1, o null se assente/illeggibile. */
function parseSourcePages(raw: unknown): number[] | null {
  if (Array.isArray(raw)) {
    const nums = raw.filter((n): n is number => typeof n === 'number' && Number.isInteger(n) && n >= 1);
    return nums.length > 0 ? nums : null;
  }
  if (typeof raw === 'string' && raw.trim().length > 0 && raw !== 'null') {
    try {
      const parsed = JSON.parse(raw);
      return parseSourcePages(parsed);
    } catch {
      return null;
    }
  }
  return null;
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
 * `docs` is optional: when omitted (the public shared link, which deliberately
 * withholds the raw clinical OCR) the DOC_SANITARIA marker is replaced with a
 * neutral "consultabile nella perizia completa" note — so the section intro is
 * not orphaned above an invisible comment, and without exposing the documents or
 * misleadingly implying that none exist.
 */
export function expandDeterministicBlocks(
  synthesis: string,
  events: DeterministicTableEvent[],
  docs?: DeterministicDoc[],
  opts?: {
    /** Data sinistro (periziaMetadata.dataSinistro, IT o ISO): esclude le
     * preesistenze dai blocchi calcolati (ITT/ITP, durata malattia, stima danno). */
    incidentDate?: string | null;
  },
): string {
  if (!synthesis || !hasDeterministicMarkers(synthesis)) return synthesis;

  // Spese: tabella danneggiato + (se presenti) tabella SEPARATA costi a carico SSN.
  // Caso SSN-only (zero spese del danneggiato ma costi SSN presenti): fallback
  // dedicato — "Non risultano spese... seguito da una tabella di spese" era stonato.
  const speseTable = formatExpenseTable(events);
  const speseSsn = formatSsnCostTable(events);
  const speseDanneggiato = speseTable
    || (speseSsn
      ? '_Non risultano spese a carico del danneggiato; si riportano di seguito, per completezza, i costi sostenuti dal Servizio Sanitario._'
      : EMPTY_FALLBACK.SPESE);
  const speseBlock = speseSsn ? `${speseDanneggiato}\n\n${speseSsn}` : speseDanneggiato;

  const replacements: Array<[string, string]> = [
    [DETERMINISTIC_MARKERS.ITT_ITP, formatITTITPTable(calculateITTITP(events, opts?.incidentDate)) || EMPTY_FALLBACK.ITT_ITP],
    [DETERMINISTIC_MARKERS.SPESE, speseBlock],
    [DETERMINISTIC_MARKERS.CRONO, formatChronologyIndex(events) || EMPTY_FALLBACK.CRONO],
    [DETERMINISTIC_MARKERS.ITT_RICOVERO_FACTS, formatEpicrisiFactsBlock(events, opts?.incidentDate) || EMPTY_FALLBACK.ITT_RICOVERO_FACTS],
  ];
  replacements.push([
    DETERMINISTIC_MARKERS.DOC_SANITARIA,
    docs !== undefined
      ? formatDocumentazioneSanitaria(docs, events) || EMPTY_FALLBACK.DOC_SANITARIA
      : DOC_SANITARIA_OMITTED,
  ]);

  let out = synthesis;
  for (const [marker, rendered] of replacements) {
    if (out.includes(marker)) out = out.split(marker).join(rendered);
  }
  // STIMA_DANNO is parameterized (case type embedded in the marker): expanded by
  // its own module from the same CURRENT events, on every read surface.
  return expandStimaDannoMarkers(out, events, opts?.incidentDate);
}
