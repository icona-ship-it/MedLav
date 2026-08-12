/**
 * Anonimizzazione degli INPUT dell'export DOCX (audit 2026-08-11, reperti E-1/H-2).
 *
 * Il DOCX è binario: non si può ripassare `anonymizeText` sul documento finale
 * come fa l'export HTML. Quindi qui anonimizziamo i testi PRIMA che entrino nel
 * generatore. Regola chiave: si toccano SOLO i campi TESTUALI (dove vive il PII —
 * nome, data di nascita, indirizzo), MAI i campi strutturati che il generatore
 * parsa (event_date via formatDate, date dei calcoli): anonimizzarli li
 * renderebbe illeggibili/rotti. I campi di periziaMetadata sono invece tutti resi
 * come testo, quindi l'intero oggetto è anonimizzabile in sicurezza.
 */

import { anonymizeText } from '@/services/anonymization/anonymizer';
import type { PeriziaMetadata } from '@/types';

/** Anonimizza una stringa (no-op su null/vuoto/non-stringa). */
function anonStr(value: unknown, pm: PeriziaMetadata | undefined): unknown {
  return typeof value === 'string' && value.length > 0
    ? anonymizeText({ text: value, periziaMetadata: pm }).anonymizedText
    : value;
}

function escapeRe(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const TITLE_TOKENS = new Set(['dott', 'dottssa', 'prof', 'profssa', 'sig', 'sigra', 'ssa', 'avv', 'ing', 'dr', 'nato', 'nata', 'nome', 'cognome']);

/** Token-nome NOTI dai metadati (periziando, parti, perito...): autoritativi. */
function knownNameTokens(ctx: PeriziaMetadata | undefined): string[] {
  if (!ctx) return [];
  const raw = ctx as Record<string, unknown>;
  const nameFields = [
    'patientFullName', 'parteRicorrente', 'parteResistente', 'ctuName',
    'collaboratoreName', 'ctpRicorrente', 'ctpResistente', 'judgeName', 'coCtuName',
  ];
  const tokens = new Set<string>();
  for (const f of nameFields) {
    const v = raw[f];
    if (typeof v !== 'string') continue;
    for (const t of v.split(/[\s.]+/)) {
      const clean = t.replace(/[^\p{L}]/gu, '');
      if (clean.length >= 3 && !TITLE_TOKENS.has(clean.toLowerCase())) tokens.add(clean);
    }
  }
  return [...tokens];
}

/** Redazione dei FILENAME: l'anonimizzatore-prosa salta i nomi minuscoli (per non
 * corrompere parole comuni/cliniche tipo "costa"), ma i filename usano spesso il
 * nome del periziando in minuscolo/underscore ("cartella_demprova_testina.pdf").
 * Qui, SOLO sul filename e SOLO sui token-nome NOTI dei metadati (autoritativi),
 * si redige case-insensitive con separatore qualunque. */
function redactFileName(fileName: unknown, ctx: PeriziaMetadata | undefined): unknown {
  if (typeof fileName !== 'string' || fileName.length === 0) return fileName;
  let out = anonymizeText({ text: fileName, periziaMetadata: ctx }).anonymizedText;
  for (const tok of knownNameTokens(ctx)) {
    out = out.replace(new RegExp(escapeRe(tok), 'gi'), '[NOME]');
  }
  return out;
}

/** Campi PROSA di un evento (possono contenere PII inline). I campi strutturati
 * (event_date, *_type, order_number, confidence...) NON si toccano. */
const EVENT_PROSE_FIELDS = ['title', 'description', 'diagnosis', 'source_text', 'expert_notes', 'reliability_notes'];

/** Campi che sono PURAMENTE un identificativo di persona/struttura: si redigono
 * per intero (un nome di medico "nudo", senza titolo, l'anonimizzatore-prosa non
 * lo cattura — H-2 lo elenca tra i vettori di leak). */
const EVENT_IDENTITY_FIELDS: Record<string, string> = { doctor: '[MEDICO]', facility: '[STRUTTURA]' };

/** Copie anonimizzate degli eventi: prosa via anonymizeText, campi-identità
 * redatti per intero, campi strutturati invariati. */
export function anonymizeEventsForExport<T>(
  events: T[] | null | undefined,
  pm: PeriziaMetadata | undefined,
): T[] {
  if (!events) return [];
  return events.map((e) => {
    if (!e || typeof e !== 'object') return e;
    const out: Record<string, unknown> = { ...(e as Record<string, unknown>) };
    for (const f of EVENT_PROSE_FIELDS) {
      if (f in out) out[f] = anonStr(out[f], pm);
    }
    for (const [f, placeholder] of Object.entries(EVENT_IDENTITY_FIELDS)) {
      if (typeof out[f] === 'string' && (out[f] as string).trim().length > 0) out[f] = placeholder;
    }
    return out as T;
  });
}

/** Copie anonimizzate dei documenti: fileName e testo OCR delle pagine; id,
 * tipo e conteggi restano invariati. */
export function anonymizeDocsForExport<T>(
  docs: T[] | null | undefined,
  pm: PeriziaMetadata | undefined,
): T[] {
  if (!docs) return [];
  return docs.map((d) => {
    if (!d || typeof d !== 'object') return d;
    const doc: Record<string, unknown> = { ...(d as Record<string, unknown>) };
    if ('fileName' in doc) doc.fileName = redactFileName(doc.fileName, pm);
    if (Array.isArray(doc.pages)) {
      doc.pages = (doc.pages as unknown[]).map((p) =>
        p && typeof p === 'object' && 'ocrText' in (p as Record<string, unknown>)
          ? { ...(p as Record<string, unknown>), ocrText: anonStr((p as Record<string, unknown>).ocrText, pm) }
          : p,
      );
    }
    return doc as T;
  });
}

/** Copia anonimizzata di periziaMetadata: ogni campo stringa (e array di stringhe)
 * viene redatto; i non-PII passano invariati. Nel DOCX ogni campo è reso come
 * testo, quindi è sicuro (nomi→[PERITO]/[PAZIENTE], date→[DATA], RG→[RIF_GIUD]),
 * coerente con il passaggio full-document dell'export HTML. */
export function anonymizePmForExport(
  pm: Record<string, unknown> | null | undefined,
  ctx: PeriziaMetadata | undefined,
): Record<string, unknown> | null {
  if (!pm) return null;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(pm)) {
    if (typeof v === 'string') out[k] = anonStr(v, ctx);
    else if (Array.isArray(v)) out[k] = v.map((item) => anonStr(item, ctx));
    else out[k] = v;
  }
  return out;
}
