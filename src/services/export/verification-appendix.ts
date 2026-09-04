/**
 * Appendice di verifica (valutazione 2026-09-04): rende VISIBILE al medico
 * ciò che le reti fanno in silenzio. Ogni riga è calcolata dai dati del caso,
 * mai dichiarata: cosa è stato ricevuto, trascritto (integralmente o in
 * parte) o escluso e perché, quante pagine erano leggibili, quanti eventi
 * restano da controllare. Puro, senza dati clinici nel testo: solo tipi
 * documento, conteggi e motivi. I nomi file NON compaiono (possono contenere
 * il nome del paziente).
 */

import { getDocumentTypeLabel, EXCLUDED_FROM_DOCUMENTAZIONE_SANITARIA, EXCLUDED_FROM_DOCUMENTAZIONE_SANITARIA_REASONS } from '@/lib/document-type-labels';
import { NON_CLINICAL_EVENT_TYPES } from '@/lib/constants';

export interface AppendixDocument {
  id: string;
  fileName: string;
  documentType: string;
  pages: ReadonlyArray<{ pageNumber: number; ocrText: string }>;
  /** File unito come pagina di un altro documento (migration 0033). */
  mergedIntoDocumentId?: string | null;
}

export interface AppendixEvent {
  document_id?: string | null;
  event_date: string;
  event_type: string;
  requires_verification?: boolean | null;
  temporal_scope?: string | null;
  is_relevant_for_chronology?: boolean | null;
}

export interface TranscriptionCoverage {
  /** Pagine riprodotte nella trascrizione. */
  rendered: number;
  /** Pagine totali del documento. */
  total: number;
  /** Pagine riprodotte CON testo leggibile (le altre escono come "testo non disponibile"). */
  withText: number;
}

export interface VerificationAppendixParams {
  /** cronistoria = documenti + pagine + eventi; spese = documenti + pagine + voci di spesa. */
  mode: 'cronistoria' | 'spese';
  documents: ReadonlyArray<AppendixDocument>;
  events: ReadonlyArray<AppendixEvent>;
  /** Copertura della trascrizione per documento (dal renderer): solo modalità cronistoria. */
  transcription?: ReadonlyMap<string, TranscriptionCoverage>;
  /** Voci di spesa: solo modalità spese. */
  expenses?: { items: number; excludedFromTotal: number };
}

const SENTINEL_DATE = '1900-01-01';

function hasReadableText(doc: AppendixDocument): boolean {
  return doc.pages.some((p) => (p.ocrText ?? '').trim().length > 0);
}

function isSublistScope(e: AppendixEvent): boolean {
  return e.temporal_scope === 'retrospettivo' || e.temporal_scope === 'programmato';
}

/** Motivo per cui un documento NON è nella trascrizione (null = trascritto). */
function nonTranscribedReason(doc: AppendixDocument, coverage: TranscriptionCoverage | undefined): string | null {
  if (coverage && coverage.rendered > 0 && coverage.withText > 0) return null;
  if (EXCLUDED_FROM_DOCUMENTAZIONE_SANITARIA.has(doc.documentType)) {
    return EXCLUDED_FROM_DOCUMENTAZIONE_SANITARIA_REASONS[doc.documentType] ?? 'non è documentazione sanitaria';
  }
  if (doc.pages.length === 0) return 'nessuna pagina letta (lettura OCR non riuscita o non ancora eseguita): riavviare l\'analisi o ricaricare il file';
  if (!hasReadableText(doc)) return 'pagine lette ma senza testo leggibile: verificare sul documento originale';
  return 'non riprodotto nella trascrizione';
}

/** Perché un documento è parziale: pagine non rese (filtro reperti principali)
 * e/o pagine rese senza testo leggibile. */
function partialCoverageDetail(c: TranscriptionCoverage): string {
  const parts: string[] = [];
  if (c.rendered < c.total) {
    parts.push(`${c.rendered} pagine su ${c.total} riprodotte (solo le pagine con i reperti principali; documento integrale agli atti)`);
  }
  if (c.withText < c.rendered) {
    parts.push(`${c.withText} pagine leggibili su ${c.total}: le altre sono senza testo leggibile, verificare sul documento originale`);
  }
  return parts.join('; ');
}

export function buildVerificationAppendix(params: VerificationAppendixParams): string {
  const { mode, events } = params;
  const files = params.documents;
  // File uniti già assorbiti (0 pagine proprie) = non sono documenti a sé.
  const absorbed = files.filter((d) => !!d.mergedIntoDocumentId && d.pages.length === 0);
  // File uniti con pagine proprie = unione non ancora rielaborata: lo diciamo.
  const pendingMerge = files.filter((d) => !!d.mergedIntoDocumentId && d.pages.length > 0);
  const documents = files.filter((d) => !absorbed.includes(d));

  const pagesTotal = documents.reduce((s, d) => s + d.pages.length, 0);
  const pagesEmpty = documents.reduce(
    (s, d) => s + d.pages.filter((p) => (p.ocrText ?? '').trim().length === 0).length, 0);

  const lines: string[] = [];
  lines.push('**Documenti**');
  const mergedNote = absorbed.length > 0 ? ` (${files.length} file: ${absorbed.length} uniti come pagine di un documento multi-pagina)` : '';
  lines.push(`- Documenti ricevuti: ${documents.length}${mergedNote}`);
  if (pendingMerge.length > 0) {
    lines.push(`- File uniti ma non ancora rielaborati: ${pendingMerge.length} (riavviare l'analisi perché l'unione abbia effetto; nel frattempo sono riprodotti come documenti separati)`);
  }

  if (mode === 'cronistoria') {
    const coverage = params.transcription ?? new Map<string, TranscriptionCoverage>();
    // "Integralmente" = tutte le pagine rese E tutte leggibili. Una pagina resa
    // senza testo non è trascritta: il documento è parziale e lo diciamo.
    const isFull = (c: TranscriptionCoverage): boolean => c.withText > 0 && c.rendered >= c.total && c.withText >= c.rendered;
    const isPartial = (c: TranscriptionCoverage): boolean => c.withText > 0 && !isFull(c);
    const full = documents.filter((d) => { const c = coverage.get(d.id); return !!c && isFull(c); });
    const partial = documents.filter((d) => { const c = coverage.get(d.id); return !!c && isPartial(c); });
    const notTranscribed = documents
      .map((d) => ({ d, reason: nonTranscribedReason(d, coverage.get(d.id)) }))
      .filter((x): x is { d: AppendixDocument; reason: string } => x.reason !== null);
    lines.push(`- Trascritti integralmente: ${full.length}`);
    if (partial.length > 0) {
      lines.push(`- Trascritti parzialmente: ${partial.length}`);
      for (const d of partial) {
        const c = coverage.get(d.id)!;
        lines.push(`  - ${getDocumentTypeLabel(d.documentType)}: ${partialCoverageDetail(c)}`);
      }
    }
    lines.push(`- Non trascritti: ${notTranscribed.length}`);
    for (const { d, reason } of notTranscribed) {
      lines.push(`  - ${getDocumentTypeLabel(d.documentType)}: ${reason}`);
    }
  } else {
    const receipts = documents.filter((d) => d.documentType === 'spese_mediche').length;
    lines.push(`- Giustificativi di spesa: ${receipts}`);
    lines.push(`- Altri documenti (referti, cartelle, atti): ${documents.length - receipts}`);
  }

  lines.push('');
  lines.push('**Pagine**');
  lines.push(`- Pagine lette: ${pagesTotal}`);
  lines.push(`- Pagine senza testo leggibile: ${pagesEmpty}`);
  lines.push('');

  if (mode === 'cronistoria') {
    const clinical = events.filter((e) => !NON_CLINICAL_EVENT_TYPES.has(e.event_type));
    const relevant = clinical.filter((e) => e.is_relevant_for_chronology !== false);
    // Un evento 'corrente' senza data non ha posto in cronologia: va detto.
    const undated = relevant.filter((e) => e.event_date === SENTINEL_DATE && !isSublistScope(e));
    const inChronology = relevant.filter((e) => !undated.includes(e));
    const retrospective = inChronology.filter((e) => e.temporal_scope === 'retrospettivo').length;
    const scheduled = inChronology.filter((e) => e.temporal_scope === 'programmato').length;
    const toVerify = relevant.filter((e) => e.requires_verification === true).length;
    const excludedByExpert = clinical.filter((e) => e.is_relevant_for_chronology === false).length;

    const coverage = params.transcription ?? new Map<string, TranscriptionCoverage>();
    const transcribedIds = new Set(documents.filter((d) => (coverage.get(d.id)?.rendered ?? 0) > 0).map((d) => d.id));
    const eventsByDoc = new Map<string, number>();
    for (const e of clinical) {
      if (!e.document_id) continue;
      eventsByDoc.set(e.document_id, (eventsByDoc.get(e.document_id) ?? 0) + 1);
    }
    const transcribedWithoutEvents = documents.filter((d) => transcribedIds.has(d.id) && !eventsByDoc.has(d.id));
    const eventsFromNonTranscribed = clinical.filter((e) => !!e.document_id && !transcribedIds.has(e.document_id)).length;

    lines.push('**Eventi**');
    lines.push(`- Eventi clinici in cronistoria: ${inChronology.length}`);
    lines.push(`  - di cui riferiti in anamnesi: ${retrospective}`);
    lines.push(`  - di cui programmati: ${scheduled}`);
    if (undated.length > 0) {
      lines.push(`- Eventi senza data, non collocati in cronistoria: ${undated.length} (verificare)`);
    }
    lines.push(`- Eventi da verificare: ${toVerify}`);
    lines.push(`- Eventi esclusi dal perito: ${excludedByExpert}`);
    lines.push(`- Documenti trascritti senza eventi estratti: ${transcribedWithoutEvents.length}${transcribedWithoutEvents.length > 0 ? ' (possibile omissione: confrontare con la trascrizione)' : ''}`);
    if (eventsFromNonTranscribed > 0) {
      lines.push(`- Eventi provenienti da documenti non trascritti: ${eventsFromNonTranscribed} (verificare sull'originale)`);
    }
  } else {
    const items = params.expenses?.items ?? 0;
    const excluded = params.expenses?.excludedFromTotal ?? 0;
    lines.push('**Spese**');
    lines.push(`- Voci di spesa estratte: ${items}`);
    lines.push(`- Voci visibili ma non sommate al totale (acconti già assorbiti): ${excluded}`);
  }

  lines.push('');
  lines.push('*I conteggi sono calcolati automaticamente dai dati del caso. La verifica finale dei contenuti resta del medico legale.*');
  return lines.join('\n');
}
