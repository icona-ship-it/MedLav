/**
 * Renderer deterministico della doc-sanitaria "passaggi-chiave per rubrica":
 * un documento clinico = un blocco; intestazione dai metadati; corpo = le
 * rubriche che la policy prevede, copiate PER INTERO dal testo OCR (nessun
 * LLM, nessuna parafrasi, refusi compresi); dedup dei passaggi identici già
 * riprodotti da un documento precedente (PS ↔ cartella ↔ lettera di
 * dimissione); certificati in una riga; taglio su confine di frase con "[...]"
 * oltre il tetto. Invariante: ogni documento clinico con testo produce un
 * blocco (mai perdere un documento), anche quando le sue rubriche non sono
 * riconosciute (fallback al corpo, se la policy lo consente, altrimenti una
 * riga di rimando). Puro.
 */

import { parseRubriche, type RubricPage, type RubricSegment } from './rubric-parser';
import { policyForType, RUBRIC_EXCLUDED_DOC_TYPES, PS_MAX_PAGES, PS_MARKERS_RE, type RubricPolicy, type RubricTypePolicy } from './rubric-policy';

export interface RubricDocument {
  documentId: string;
  documentType: string | null;
  /** Intestazione già composta ("**Tipo, struttura, in data …:**") dal chiamante (datazione dagli eventi correnti). */
  header: string;
  /** Data ISO di ordinamento (dal chiamante). */
  sortDate: string;
  pages: ReadonlyArray<RubricPage>;
}

export interface RubricRenderResult {
  markdown: string;
  blocks: number;
  /** Documenti esclusi per tipo (spese/atti) o per policy 'ometti'. */
  omitted: number;
  /** Passaggi saltati perché identici a uno già riprodotto. */
  dedupSkipped: number;
  /** Documenti resi col fallback (nessuna rubrica prevista trovata). */
  fallbackDocs: number;
}

const RUBRIC_TITLES: Readonly<Record<string, string>> = {
  anamnesi: 'Anamnesi', anamnesi_remota: 'Anamnesi remota', anamnesi_prossima: 'Anamnesi prossima',
  esame_obiettivo: 'Esame obiettivo', diagnosi: 'Diagnosi', conclusioni: 'Conclusioni', prognosi: 'Prognosi',
  terapia: 'Terapia', indicazioni: 'Indicazioni', intervento: 'Intervento', diario: 'Decorso', dimissione: 'Dimissione',
  referto: 'Referto', consulenza: 'Consulenza', corpo: '', preambolo: '',
};

/** Righe amministrative che l'OCR mette dentro le rubriche cliniche (anagrafica, recapiti,
 * codici, firme, disclaimer, ticket): mai nel depositabile. Solo righe INTERE. */
const ADMIN_NOISE_RE = /(codice fiscale|\bc\.?f\.?:|tessera sanitaria|nosografic|n\.?\s*accettazione|accession|\btsrm\b|firmato digitalmente|firma (digitale|del medico)|copia (del documento|conforme)|pagina \d+ di \d+|\btel\.?\b|\bfax\b|e-?mail|@[a-z0-9-]+\.|p\.?\s*iva|partita iva|ticket|\bcassa\b|importo|€|euro\b|cod\.?\s*(prest|esenz)|esenzione|data di nascita|nat[oa] (il|a)\b|residen[tz]|domicili|via [a-z' ]+,? ?\d|direttore|coordinatore|segreteria|orari?o (di )?(apertura|visite)|stampat[oa] il|documento (generato|prodotto) (il|da)|barcode|identificativo|\bid\b\s*\d|informativa|privacy|consenso al trattamento|classe di dose|dose (efficace|erogata))/i;

function isAdminNoiseLine(line: string): boolean {
  const t = line.trim();
  if (!t) return false;
  return ADMIN_NOISE_RE.test(t) && !/(diagnosi|frattura|lesion|dolor|esame obiettivo|prognosi|terapia|conclusion|referto)/i.test(t);
}

function stripAdminNoise(text: string): string {
  return text.split('\n').filter((l) => !isAdminNoiseLine(l)).join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

/** Tetto di blocco per RIGHE intere (mai a metà di una «...»): oltre, resta "[...]" fuori dalle virgolette. */
function capBlockLines(lines: ReadonlyArray<string>, maxWords: number): string[] {
  if (maxWords <= 0) return [...lines];
  const out: string[] = []; let used = 0;
  for (const l of lines) {
    const w = countWords(l);
    if (out.length > 0 && used + w > maxWords) { out.push('[...]'); break; }
    out.push(l); used += w;
  }
  return out;
}

function normalizeForDedup(text: string): string {
  return text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

function countWords(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

/** Taglia al tetto di parole su confine di frase, segnalando l'omissione con "[...]". */
export function capAtSentence(text: string, maxWords: number): string {
  if (maxWords <= 0 || countWords(text) <= maxWords) return text;
  const words = text.split(/(\s+)/);
  let count = 0; let cut = 0;
  for (let i = 0; i < words.length; i++) {
    if (words[i]!.trim()) count++;
    if (count >= maxWords) { cut = i + 1; break; }
  }
  const head = words.slice(0, cut).join('');
  const lastStop = Math.max(head.lastIndexOf('. '), head.lastIndexOf('.\n'), head.lastIndexOf(';'));
  const kept = lastStop > head.length * 0.5 ? head.slice(0, lastStop + 1) : head;
  return `${kept.trim()} [...]`;
}

function selectSegments(segments: ReadonlyArray<RubricSegment>, policy: RubricTypePolicy): { chosen: RubricSegment[]; fallback: boolean } {
  if (policy.mode === 'integrale') {
    const all = segments.filter((s) => s.label !== 'preambolo' || segments.length === 1);
    return { chosen: all.length > 0 ? all : [...segments], fallback: false };
  }
  const wanted = new Set(policy.copia);
  // Ordine del DOCUMENTO (come lo legge il medico). UNA voce per rubrica: in una
  // cartella l'anamnesi e l'EO ricompaiono a ogni rivalutazione; il gold riporta
  // quelli d'ingresso. Si tiene la prima occorrenza con almeno 5 parole.
  const firstPerLabel = new Map<string, RubricSegment>();
  for (const s of segments) {
    if (!wanted.has(s.label)) continue;
    const prev = firstPerLabel.get(s.label);
    if (!prev || (countWords(prev.text) < 5 && countWords(s.text) >= 5)) firstPerLabel.set(s.label, s);
  }
  const chosen = [...firstPerLabel.values()].sort((a, b) => a.order - b.order);
  if (chosen.length > 0) return { chosen, fallback: false };
  if (policy.fallbackCorpo) {
    const corpo = segments.filter((s) => s.label === 'corpo' || s.label === 'preambolo' || s.label === 'referto');
    return { chosen: corpo.length > 0 ? corpo : [...segments], fallback: true };
  }
  return { chosen: [], fallback: true };
}

function renderSegment(seg: RubricSegment, seen: Set<string>, stats: { dedup: number }, maxWords: number): string | null {
  const key = normalizeForDedup(seg.text);
  if (key.length >= 40 && seen.has(key)) { stats.dedup++; return null; }
  if (key.length >= 40) seen.add(key);
  const title = RUBRIC_TITLES[seg.label] ?? (seg.rawLabel ?? '');
  const cleaned = stripAdminNoise(seg.text);
  if (!cleaned) return null;
  const body = capAtSentence(cleaned.replace(/\n{2,}/g, '\n').trim(), maxWords);
  return title ? `${title}: «${body}»` : `«${body}»`;
}

/** Un verbale di Pronto Soccorso: poche pagine e i marcatori tipici nel testo. */
function looksLikePsVerbale(doc: RubricDocument): boolean {
  if (doc.pages.length > PS_MAX_PAGES) return false;
  const head = doc.pages.slice(0, 2).map((p) => p.ocrText).join('\n');
  return PS_MARKERS_RE.test(head);
}

/** Policy EFFETTIVA del documento (spec Lavini 2026-09-04): un fascicolo di ricovero
 * è un contenitore (rimando alla lettera di dimissione se agli atti, altrimenti i soli
 * passaggi-chiave); un verbale di PS breve classificato 'cartella' o 'altro' è un PS. */
function effectivePolicy(doc: RubricDocument, policy: RubricPolicy, hasLetteraDimissione: boolean): { tp: RubricTypePolicy; rimando: string | null } {
  const tp = policyForType(policy, doc.documentType);
  const psPolicy = policy.tipi.cartella_clinica ?? tp;
  if (doc.documentType === 'altro' && looksLikePsVerbale(doc)) return { tp: { ...psPolicy, mode: 'passaggi' }, rimando: null };
  if (tp.mode !== 'contenitore') return { tp, rimando: null };
  if (looksLikePsVerbale(doc)) return { tp: { ...tp, mode: 'passaggi' }, rimando: null };
  if (hasLetteraDimissione) {
    return { tp, rimando: `Fascicolo di ricovero agli atti (${doc.pages.length} pagine): si riporta la lettera di dimissione.` };
  }
  return { tp: { ...tp, mode: 'passaggi', copia: ['anamnesi_prossima', 'intervento', 'diagnosi', 'dimissione', 'prognosi'] }, rimando: null };
}

export function renderRubricDocSanitaria(documents: ReadonlyArray<RubricDocument>, policy: RubricPolicy): RubricRenderResult {
  const seen = new Set<string>();
  const stats = { dedup: 0 };
  let omitted = 0; let fallbackDocs = 0;
  const blocks: string[] = [];
  const certificates: RubricDocument[] = [];
  const ordered = [...documents].sort((a, b) => a.sortDate.localeCompare(b.sortDate));
  const hasLetteraDimissione = documents.some((d) => d.documentType === 'lettera_dimissione' && d.pages.some((p) => p.ocrText.trim().length > 0));

  for (const doc of ordered) {
    if (RUBRIC_EXCLUDED_DOC_TYPES.has(doc.documentType ?? '')) { omitted++; continue; }
    const { tp, rimando } = effectivePolicy(doc, policy, hasLetteraDimissione);
    if (tp.mode === 'ometti') { omitted++; continue; }
    if (tp.mode === 'una_riga') { certificates.push(doc); continue; }
    if (rimando) {
      // Fascicolo contenitore: resta il rimando + i referti d'esame eseguiti in
      // degenza (RX/TC/ECO dentro la cartella), che il gold riporta a parte.
      // Spec Lavini: si scartano RX torace / ECG / screening pre-operatori (routine di degenza).
      const embedded = parseRubriche(doc.pages)
        .filter((s) => s.label === 'referto' && s.rawLabel && /^(rx|rm|rmn|tc|tac|eco|ecografia|pet|moc|doppler|ecocolordoppler)\b/i.test(s.rawLabel))
        .filter((s) => !/torace|toracic|pre-?operator|screening|elettrocardio/i.test(`${s.rawLabel} ${s.text.slice(0, 80)}`))
        .map((s) => renderSegment(s, seen, stats, Math.ceil(tp.maxParole / 2)))
        .filter((l): l is string => l !== null);
      blocks.push(`${doc.header}\n${rimando}${embedded.length > 0 ? `\nReferti eseguiti in degenza:\n${capBlockLines(embedded, tp.maxParole).join('\n')}` : ''}`);
      continue;
    }
    const segments = parseRubriche(doc.pages);
    if (segments.length === 0) { blocks.push(`${doc.header}\nDocumento senza testo leggibile: consultare l'originale agli atti.`); fallbackDocs++; continue; }
    const { chosen, fallback } = selectSegments(segments, tp);
    if (fallback) fallbackDocs++;
    // Tetto per rubrica (metà del tetto di blocco: la diagnosi non è mai tagliata
    // da un'anamnesi lunga) e tetto di blocco (la lunghezza tipica del gold).
    const perRubric = tp.maxParole > 0 ? Math.ceil(tp.maxParole / 2) : 0;
    const lines = chosen.map((s) => renderSegment(s, seen, stats, perRubric)).filter((l): l is string => l !== null);
    if (lines.length === 0) {
      blocks.push(`${doc.header}\n${chosen.length > 0 ? 'Contenuto già riprodotto nel documento precedente.' : 'Documento agli atti; nessuna rubrica clinica riprodotta.'}`);
      continue;
    }
    blocks.push(`${doc.header}\n${capBlockLines(lines, tp.maxParole).join('\n')}`);
  }

  if (certificates.length > 0) {
    const dates = certificates.map((c) => c.sortDate).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort();
    const it = (iso: string): string => `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}`;
    const range = dates.length > 1 ? `dal ${it(dates[0]!)} al ${it(dates[dates.length - 1]!)}` : dates.length === 1 ? `in data ${it(dates[0]!)}` : 's.d.';
    blocks.push(`**Certificati medici (${certificates.length}), ${range}:**\nCertificati e attestati in atti, con i periodi di prognosi come da documenti.`);
  }

  return { markdown: blocks.join('\n\n'), blocks: blocks.length, omitted, dedupSkipped: stats.dedup, fallbackDocs };
}
