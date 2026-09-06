/**
 * Parser deterministico delle RUBRICHE del medico nel testo OCR (2026-09-04,
 * verso la doc-sanitaria "passaggi-chiave per rubrica"): un documento clinico
 * viene segmentato nelle sue voci (anamnesi, esame obiettivo, diagnosi,
 * conclusioni, prognosi, terapia, indicazioni, diario, intervento, …) così che
 * la sezione della perizia possa COPIARE per intero ciò che il medico ha
 * scritto sotto le rubriche che il perito riporta, e omettere le altre
 * (triage, parametri, laboratorio, consensi). Nessun LLM. Puro, tollerante
 * all'OCR (markdown, tabelle HTML, "Diagnosi: …" inline, "Si consiglia …").
 */

export interface RubricPage {
  pageNumber: number;
  ocrText: string;
}

export interface RubricSegment {
  /** Chiave normalizzata ('diagnosi', 'esame_obiettivo', …), 'preambolo' o 'corpo'. */
  label: string;
  /** Etichetta come scritta nel documento (null per preambolo/corpo). */
  rawLabel: string | null;
  text: string;
  pageNumber: number;
  order: number;
}

/** Vocabolario: ordine = priorità (le voci più specifiche prima). */
const VOCABULARY: ReadonlyArray<{ key: string; re: RegExp; keepLabel?: boolean }> = [
  { key: 'dimissione', re: /^((diagnosi|terapia|indicazioni|condizioni|note)( [a-z]+)? (alla |di |della )?dimissione|dimissione|alla dimissione|lettera di dimissione|relazione di dimissione|esito|si dimette)$/ },
  { key: 'esame_obiettivo', re: /^(e\.? ?o\.?|esame obiettivo( generale| locale| clinico)?|obiettivita( clinica)?|esame clinico|eo|clinicamente|obiettivamente|all'?esame( obiettivo)?)$/ },
  { key: 'diagnosi', re: /^(diagnosi( di (ingresso|accettazione|entrata)| principale| clinica| finale)?|conclusioni diagnostiche|diagnosi e conclusioni)$/ },
  { key: 'conclusioni', re: /^(conclusion[ei]|giudizio( conclusivo| clinico| diagnostico)?|in conclusione|considerazioni conclusive|valutazione conclusiva|commento( conclusivo)?|impressione diagnostica)$/ },
  { key: 'prognosi', re: /^prognosi\b.*$/ },
  { key: 'anamnesi_remota', re: /^(anamnesi (patologica |fisiologica )?remota|a\.?p\.?r\.?|anamnesi remota)$/ },
  { key: 'anamnesi_prossima', re: /^(anamnesi (patologica |medica )?prossima|anamnesi medica|a\.?p\.?p\.?|motivo (del ricovero|della visita|dell'?accesso|del ricorso)|quesito( clinico| diagnostico)?|storia clinica|notizie cliniche|ricoverat[oa] dal)$/ },
  { key: 'anamnesi', re: /^anamnesi\b.*$/ },
  { key: 'intervento', re: /^(intervento( chirurgico| eseguito)?|descrizione (dell'?)?intervento|verbale operatorio|atto operatorio|tecnica operatoria|procedura( eseguita)?|trattamento adottato|(1|2|3|i|ii|iii)[°º]? tempo chirurgico)$/ },
  { key: 'diario', re: /^(diario( clinico| medico| infermieristico)?|decorso( clinico| post ?operatorio| della degenza)?)$/ },
  { key: 'consulenza', re: /^(consulenza( [a-z]+){0,3}|risposta( del(lo)? specialista| consulente)?|parere( specialistico)?)$/ },
  // "Esiti di RX/TC…" apre un referto; "Esiti di frattura del femore" è una DIAGNOSI
  // (contenuto), non un titolo: con /esiti di [a-z ]+/ spariva (giro 8).
  { key: 'referto', re: /^(referto|descrizione( clinica)?|reperti?|risultat[oi]|esam[ei]( eseguit[oi])?|tecnica( di esame)?|metodica|esami visionati|visionat[io]|esiti di (rx|rm|rmn|tc|tac|eco|ecografia|esami|indagini|accertamenti)( [a-z ]+)?)$/ },
  // Titoli di esame dentro una cartella ("RX gomito sn", "ECO ginocchio dx"): aprono un referto interno.
  { key: 'referto', re: /^(rx|rm|rmn|tc|tac|eco|ecografia|ecg|eeg|emg|pet|moc|doppler|ecocolordoppler)( [a-z'.-]+){0,4}$/, keepLabel: true },
  { key: 'terapia', re: /^(terapia( consigliata| domiciliare| in atto| prescritta| farmacologica| medica| effettuata| praticata)?( in corso)?|terapia e comportamento domiciliare|comportamento domiciliare|prescrizion[ei]|farmaci( ad uso abituale| abituali)?|trattamento)$/ },
  { key: 'indicazioni', re: /^(indicazioni|si consiglia|consigli|consiglio|raccomandazioni|controll[oi]|follow ?up|programma|piano terapeutico|note per il curante)$/ },
  { key: 'triage', re: /^triage\b.*$/ },
  { key: 'parametri', re: /^(parametri( vitali)?|pv|rilevazion[ei]( parametri)?)$/ },
  { key: 'laboratorio', re: /^(esami (ematochimici|di laboratorio|ematici|del sangue)|laboratorio|ematochimici|analisi)$/ },
  { key: 'allergie', re: /^allergi[ea]\b.*$/ },
  { key: 'consenso', re: /^(consenso\b.*|informazione( e consenso)?|informativa)$/ },
  { key: 'note', re: /^(note|annotazioni|osservazioni)$/ },
];

function foldLabel(raw: string): string {
  return raw
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[*_#]+/g, '')
    .replace(/\s+/g, ' ')
    .replace(/[\s:.-]+$/g, '')
    .trim();
}

function matchVocabulary(raw: string): { key: string; keepLabel: boolean } | null {
  const folded = foldLabel(raw);
  if (!folded) return null;
  for (const v of VOCABULARY) {
    if (v.re.test(folded)) return { key: v.key, keepLabel: v.keepLabel === true };
  }
  return null;
}

export function normalizeRubricLabel(raw: string): string | null {
  return matchVocabulary(raw)?.key ?? null;
}

/** Toglie markdown/HTML lasciando il testo; le celle di tabella diventano "a | b". */
export function cleanOcrLine(line: string): string {
  let s = line
    .replace(/\[table_html_(?:start|end)\]/gi, ' ')
    .replace(/<\/t[dh]>\s*<t[dh][^>]*>/gi, ' | ')
    .replace(/<\/?(?:table|thead|tbody|tr|t[dh]|br|p|div|span|b|i|u|strong|em)[^>]*>/gi, ' ')
    .replace(/<[^>]{1,60}>/g, ' ')
    .replace(/^\s*#{1,6}\s+/, '')
    .replace(/\*\*|__/g, '')
    .replace(/(^|\s)\*(?=\S)|(?<=\S)\*(?=\s|$)/g, '$1')
    .replace(/^.*[☐☑☒■□▪].*$/g, '')
    .replace(/!\[[^\]]*\]\([^)]*\)|\[(?:tbl|img|table)[-_][^\]]*\](?:\([^)]*\))?/gi, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&gt;/g, '>').replace(/&lt;/g, '<').replace(/&amp;/g, '&');
  // Riga di tabella markdown: "| a | b |" → "a | b"; separatori "|---|" → vuoto.
  if (/^\s*\|/.test(s)) {
    if (/^\s*\|?\s*:?-{2,}/.test(s)) return '';
    s = s.replace(/^\s*\|/, '').replace(/\|\s*$/, '');
  }
  return s.replace(/[ \t]+/g, ' ').trim();
}

const INLINE_LABEL_RE = /^([A-Za-zÀ-ÿ.'’ \-]{2,50}?)\s*:\s*(.*)$/;
const SI_CONSIGLIA_RE = /^si consiglia\b/i;

interface HeadingHit { key: string; rawLabel: string; inlineText: string; }

/** I titoli di esame ("RX polso dx: …") sono testo del medico: restano nel corpo. */
function withLabelIfKept(hit: { key: string; keepLabel: boolean }, rawLabel: string, inlineText: string): HeadingHit {
  const text = hit.keepLabel ? (inlineText ? `${rawLabel}: ${inlineText}` : `${rawLabel}:`) : inlineText;
  return { key: hit.key, rawLabel, inlineText: text };
}

function detectHeading(line: string): HeadingHit | null {
  const inline = INLINE_LABEL_RE.exec(line);
  if (inline) {
    const hit = matchVocabulary(inline[1]!);
    if (hit) return withLabelIfKept(hit, inline[1]!.trim(), inline[2]!.trim());
  }
  const whole = matchVocabulary(line);
  if (whole && line.length <= 60) {
    // "Prognosi confermata fino al 30/06/2025." / "Prognosi riservata." sono CONTENUTO
    // sotto la rubrica della prima parola, non un titolo: senza questo il testo spariva.
    const split = /^(\S+)\s+(.+)$/.exec(line);
    const firstWordKey = split ? matchVocabulary(split[1]!)?.key : undefined;
    if (split && firstWordKey === whole.key && (/\d/.test(split[2]!) || /[.;]$/.test(split[2]!))) {
      return withLabelIfKept(whole, split[1]!, split[2]!);
    }
    return withLabelIfKept(whole, line.replace(/[\s:]+$/, ''), '');
  }
  if (SI_CONSIGLIA_RE.test(line)) return { key: 'indicazioni', rawLabel: 'Si consiglia', inlineText: line };
  return null;
}

/** Finestra (righe) entro cui una virgoletta aperta sospende le rubriche: oltre,
 * una virgoletta orfana dell'OCR (5") non deve spegnere il parser. */
const OPEN_QUOTE_WINDOW_LINES = 4;

function hasOpenQuote(lines: ReadonlyArray<string>): boolean {
  const recent = lines.slice(-OPEN_QUOTE_WINDOW_LINES).join('\n');
  const count = (re: RegExp): number => (recent.match(re) ?? []).length;
  if (count(/"/g) % 2 === 1) return true;
  if (count(/“/g) !== count(/”/g)) return true;
  return count(/«/g) !== count(/»/g);
}

export function parseRubriche(pages: ReadonlyArray<RubricPage>): RubricSegment[] {
  const segments: RubricSegment[] = [];
  let current: { label: string; rawLabel: string | null; lines: string[]; pageNumber: number } | null = null;
  let sawHeading = false;

  const flush = (): void => {
    if (!current) return;
    // Titolo d'esame senza testo inline ("RX polso dx:") + prima riga di contenuto → una riga.
    const lines = current.lines.length > 1 && /:$/.test(current.lines[0] ?? '') && current.lines[1]
      ? [`${current.lines[0]} ${current.lines[1]}`, ...current.lines.slice(2)]
      : current.lines;
    const text = lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
    if (text.length > 0) {
      segments.push({ label: current.label, rawLabel: current.rawLabel, text, pageNumber: current.pageNumber, order: segments.length });
    }
    current = null;
  };

  for (const page of pages) {
    if (!page.ocrText || !page.ocrText.trim()) continue;
    for (const rawLine of page.ocrText.split('\n')) {
      const line = cleanOcrLine(rawLine);
      if (!line) { if (current) current.lines.push(''); continue; }
      // Dentro una citazione aperta ("… Si consiglia …" riportato da un altro
      // medico) nessuna riga apre una rubrica: le indicazioni citate resterebbero
      // attribuite al documento sbagliato (panel giro 7, caso C).
      const hit: HeadingHit | null = current && hasOpenQuote(current.lines) ? null : detectHeading(line);
      if (hit) {
        flush();
        sawHeading = true;
        current = { label: hit.key, rawLabel: hit.rawLabel, lines: hit.inlineText ? [hit.inlineText] : [], pageNumber: page.pageNumber };
        continue;
      }
      if (!current) current = { label: 'preambolo', rawLabel: null, lines: [], pageNumber: page.pageNumber };
      current.lines.push(line);
    }
  }
  flush();
  if (!sawHeading) {
    // Nessuna rubrica riconosciuta (referto breve, foto): un solo segmento "corpo".
    const text = segments.map((s) => s.text).join('\n').trim();
    return text ? [{ label: 'corpo', rawLabel: null, text, pageNumber: segments[0]?.pageNumber ?? 1, order: 0 }] : [];
  }
  return segments;
}
