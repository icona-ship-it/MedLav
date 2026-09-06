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
  /** Documenti in larga parte illeggibili all'OCR (manoscritti): riga di rimando, nessuna citazione. */
  illegibleDocs: number;
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

const FORM_NOISE_RE = /(rifiuto (delle )?prestazioni|\bfirma\b|\bdgr[v]?\b|codice (uscita|esito|triage)|dichiara di (essere stato|aver)|informat[oa] (sui|dei|circa)|medico richiedente|richiedente:|data richiesta|ora richiesta|prestazione richiesta|scheda n|pag\.? \d|protocollo|\bprot\.?\s*n|sorveglianza sanitaria|ammesso ricorso|trasmissione al (lavoratore|datore)|datore di lavoro|copia elettronica|sottoscritto con firma|^in fede\b|accertamento richiesto da|referto firmato|^data referto\b|^(io|lo|la) sottoscritt[oa]\b|^medico chirurgo\b|^psicolog[ao]\b|^spec(\.|ialista) in\b|\b[bo]\.?m\.?\s*[a-z]{2}\s*\d{3,}|\bpresso\s*:|\bdettagli\s*:|^consul\.|^orari?o\b|\(sabato\)|lun-ven|prenotazion[ei]|^dip\.|^resp\.|equipe medica|informazione relativa all'esposizione|esposizione (della procedura )?radiologica|euratom|decreto legislativo 31 luglio 2020|articolo 161|rappresentazione è conforme|conforme all'originale|validato da|linee guida$|^gentile (signor|sig\.)|^(barthel|indice di barthel|scala (di )?(braden|conley|morse|tinetti)|mmse|mini[- ]mental)\b|\bdata (ing|dim)\.|(^|\s)_(\s|$)|:\s*_)/i;
/** Istruzioni di compilazione di una scala (Barthel, Braden…): righe numerate che
 * parlano di punteggio/indipendenza/prestazione del paziente, non di questo paziente. */
const SCALE_GUIDELINE_RE = /^\d{1,2}\s*[-.)]\s.*(\bpz\.|punteggio|indipenden|supervisione|prestazione del|incoscienza|in tutte le voci|dovrebbe(ro)? (essere|ricevere))/i;
/** Titolo d'esame ("RX FEMORE SN:", "TAC ANCA SN SMDC:"): testo del medico, mai rumore. */
const EXAM_TITLE_RE = /^(rx|rm|rmn|tc|tac|eco|ecografia|ecg|eeg|emg|pet|moc|doppler|ecocolordoppler)\b/i;
/** Etichetta corta orfana ("Mammografia, Densitometria:", "In particolare:"): ≤4 parole, niente cifre, due punti finali. */
const SHORT_ORPHAN_LABEL_RE = /^[^\d:]{1,40}:$/;
/** Riga senza lettere (artefatti OCR "^{}[]"), etichetta di modulo orfana ("Il Medico:",
 * "Equipe Medica:") o luogo-data ("Cittàdemo, 30 marzo 2026"). I titoli d'esame
 * ("RX FEMORE SN:") sono testo del medico e restano. */
const ORPHAN_LINE_RE = /^(?:[^\p{L}]*|(?:il |la |del |dell[ao] |per il |per la )?(?:lavoratore|medico|paziente|assistito|datore|firma|timbro|equipe medica|responsabile|refertante|richiedente|reparto|data|ora|luogo|note|esito)\s*:|[\p{L}' ]{2,30},\s*\d{1,2}\s+\p{L}+\s+\d{4})$/iu;
/** Firma o elenco di sanitari ("Dr. Mario Demprova", "Il Medico Radiologo Dott.ssa …"): non è referto. */
const SIGNATURE_LINE_RE = /^(?:il medico (?:radiologo|refertante|specialista|chirurgo|di reparto)\b.*|(?:dr|dott|prof)\.?(?:\.?ssa)?\s+[\p{L}' .-]{2,40})$/iu;
/** Header di macchina (ECG/monitor) e identificativi: velocità carta, codici
 * ordine/conto/visita, "Confermato da", tecnico, sesso, data di nascita "(NN anni)". */
const MACHINE_HEADER_RE = /(\bmm\/s\b|\bmm\/mv\b|\b(cid|eid|edt|ordine|conto|ubic|camera)\s*:|\bconfermato da\b|\btecnico\s*:|\d{1,2}[-/.](?:[a-z]{3}|\d{1,2})[-/.]\d{2,4}\s*\(\d{1,3} anni\)|^(maschio|femmina|sesso\s*:\s*[mf])(\s+\S+){0,2}$)/i;
/** Codice fiscale italiano: mai nel depositabile (né in riga né inline). */
const CODICE_FISCALE_RE = /\b[A-Z]{6}\d{2}[A-Z]\d{2}[A-Z]\d{3}[A-Z]\b/g;
/** Etichetta di modulo/macchina con al più un codice ("Camera:", "Ubic:64", "Med.:"). */
const MACHINE_LABEL_LINE_RE = /^(camera|ubic|ubicazione|med|tecnico|letto|stanza|cod|ord|rif|prot|n|nr|num)\.?\s*:\s*\S{0,10}$/i;
const LONG_CODE_RE = /\d{8,}/;
const IDENTITY_RE = /(codice fiscale|\bc\.?f\.?:|tessera sanitaria|data (di )?nascita|nat[oa] (il|a)\b|residente (in|a)\b|residenza\s*:|domiciliat[oa] (in|a)\b|domicilio\s*:|\b(nome|cognome|ragione sociale|denominazione|paziente|et[àa])\s*:)/i;
/** "VERONA il 14/11/2024": luogo e data di stampa, non referto. */
const CITY_DATE_LINE_RE = /^\p{Lu}[\p{L} ]{2,30},? il \d{1,2}[/.]\d{1,2}[/.]\d{2,4}$/u;
const CLINICAL_LINE_RE = /(diagnosi|frattura|lesion|dolor|esame obiettivo|prognosi|terapia|conclusion|referto|guaribil)/i;

/** Riga di tabella a UNA cella: "etichetta | valore breve" (Nr. radiologico, data
 * nascita, provenienza, esito) è un campo di modulo; "Anamnesi | Caduta accidentale
 * in bicicletta con trauma del polso" è contenuto e resta. */
function isFormFieldRow(t: string): boolean {
  if (!/ \| |\|\s*$/.test(t)) return false;
  if (CLINICAL_LINE_RE.test(t)) return false; // "Guaribile in giorni | clinici 30" è la prognosi
  const [label = '', value = ''] = t.split('|').map((c) => c.trim());
  const valueWords = value.split(/\s+/).filter(Boolean).length;
  // Campo di modulo: valore breve ("Data Esame | 16/07/2023", "… | Codice di uscita")
  // o etichetta amministrativa nota ("Provenienza: | MDA PRONTO SOCCORSO …").
  return valueWords <= 3 || FORM_LABEL_RE.test(label);
}
const FORM_LABEL_RE = /^(provenienza|data|ora|nr|n\.?|num|codice|cod\.?|esito|posizione|regime|reparto|medico|richiedente|priorit|classe|dose|tipo|stato|ticket|esenzione|uo|u\.o\.|struttura|sede|ambulatorio|prestazione|modalit)/i;

function isAdminNoiseLine(line: string): boolean {
  const t = line.trim();
  if (!t) return false;
  // Righe di tabella/maschera (≥2 separatori) e codici lunghi: rumore di modulo;
  // a UNA cella ("Nr. Radiologico: | 2023/45615") solo se senza contenuto clinico.
  if ((t.match(/ \| /g) ?? []).length >= 2) return true;
  if (isFormFieldRow(t)) return true;
  if (LONG_CODE_RE.test(t) && !/(diagnosi|frattura|lesion|prognosi)/i.test(t)) return true;
  if (FORM_NOISE_RE.test(t) || SCALE_GUIDELINE_RE.test(t)) return true;
  if ((ORPHAN_LINE_RE.test(t) || SIGNATURE_LINE_RE.test(t) || CITY_DATE_LINE_RE.test(t)) && !CLINICAL_LINE_RE.test(t)) return true;
  if (SHORT_ORPHAN_LABEL_RE.test(t) && t.split(/\s+/).length <= 4 && !EXAM_TITLE_RE.test(t) && !CLINICAL_LINE_RE.test(t)) return true;
  // Anagrafica (nascita, residenza, CF) fuori anche se la riga prosegue con testo
  // clinico ("nata a X il Y, ha effettuato 10 sedute di psicoterapia"): l'identità
  // non entra nel depositabile; la diagnosi esplicita vince.
  if (IDENTITY_RE.test(t) && !/diagnosi/i.test(t)) return true;
  if (CLINICAL_LINE_RE.test(t)) return false;
  if (MACHINE_HEADER_RE.test(t) || new RegExp(CODICE_FISCALE_RE.source).test(t)) return true;
  if (MACHINE_LABEL_LINE_RE.test(t)) return true;
  return ADMIN_NOISE_RE.test(t);
}

/** Su una riga clinica tenuta, via il codice lungo (e l'eventuale nome del richiedente che lo segue) e il codice fiscale. */
function scrubInlineCodes(line: string): string {
  return line
    .replace(/\s*\b\d{8,}\b(?:\s+[A-ZÀ-Ü][\wà-ù'’-]+){0,3}(?:\s+richiedente)?/g, '')
    .replace(CODICE_FISCALE_RE, '[omissis]')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function stripAdminNoise(text: string): string {
  return text.split('\n').filter((l) => !isAdminNoiseLine(l)).map(scrubInlineCodes).join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

/** Carta intestata nel preambolo di un referto (struttura, reparto, titolo d'esame):
 * via quando il preambolo entra nell'integrale perché il referto vero è sottile. */
const LETTERHEAD_RE = /^(azienda|ospedale|presidio|casa di cura|policlinico|istituto|fondazione|u\.?\s?o\.?\s?c?\.?\b|s\.?\s?c\.?\b|unit[àa] operativa|dipartimento|struttura (complessa|semplice|sanitaria|ospedaliera|privata)|reparto|ambulatorio|servizio di|laboratorio|esame\s*:|prestazione\s*:)/i;
/** Nome di ente/struttura in qualunque posizione (riga di carta intestata). */
const ORGANIZATION_RE = /(ospedal|aziend|presidio|clinic|policlinic|dipartiment|radiolog|laborator|ambulator|\basl\b|\bulss\b|\bats\b|\baou|\birccs\b|\bu\.?\s?o\.?\s?c?\b|\bs\.?\s?c\.?\b)/i;

/** Riga con un solo nome di persona (periziando, direttore): 2-3 parole Capitalizzate
 * o MAIUSCOLE, niente cifre né punteggiatura finale, nessun ente. */
const BARE_NAME_LINE_RE = /^(?:[\p{Lu}][\p{L}'’-]+|[\p{Lu}][\p{Lu}'’-]+)(?:\s+(?:[\p{Lu}][\p{L}'’-]+|[\p{Lu}][\p{Lu}'’-]+)){1,2}$/u;

function stripLetterhead(text: string): string {
  return text.split('\n').filter((l) => {
    const t = l.trim();
    if (!t || CLINICAL_LINE_RE.test(t)) return true;
    if (LETTERHEAD_RE.test(t)) return false;
    if (BARE_NAME_LINE_RE.test(t) && !ORGANIZATION_RE.test(t)) return false;
    // Riga tutta maiuscola con nome di ente: intestazione, non referto.
    return !(t === t.toUpperCase() && /[A-ZÀ-Ü]/.test(t) && ORGANIZATION_RE.test(t));
  }).join('\n');
}

/** Documento in larga parte illeggibile (manoscritto): almeno 4 marker
 * [ILLEGGIBILE] e in numero pari ad almeno il 40% delle righe non vuote (un
 * referto dattiloscritto con qualche parola incerta resta citato per intero). */
const ILLEGIBLE_MIN_MARKERS = 4;
const ILLEGIBLE_MIN_SHARE = 0.4;

function illegibleStats(pages: ReadonlyArray<RubricPage>): { markers: number; lines: number } {
  let markers = 0; let lines = 0;
  for (const p of pages) {
    for (const raw of (p.ocrText ?? '').split('\n')) {
      const t = raw.trim();
      if (!t) continue;
      lines++;
      markers += (t.match(/\[ILLEGGIBILE\]/gi) ?? []).length;
    }
  }
  return { markers, lines };
}

function isMostlyIllegible(pages: ReadonlyArray<RubricPage>): { markers: number; lines: number } | null {
  const s = illegibleStats(pages);
  return s.markers >= ILLEGIBLE_MIN_MARKERS && s.markers >= ILLEGIBLE_MIN_SHARE * s.lines ? s : null;
}

/** Impegnativa / ricetta SSN (≤2 pagine, marcatori del modulo): una riga col
 * quesito diagnostico, mai la modulistica tra virgolette (panel giro 8, caso C). */
const RICETTA_RE = /(tipo ricetta|n\.?\s*confezioni|quesito diagnostico\s*:|codice autenticazione|iniziali dell'assistito|\bricetta (medica|elettronica|dematerializzata)\b|esenzione\s*:|cod(ice|\.)\s*fiscale (dell')?assistito|priorit[àa]\s*:\s*[bdpu]\b)/gi;
const QUESITO_RE = /quesito diagnostico\s*:\s*([^\n]{3,120})/i;
const ICD_LINE_RE = /^\s*(\d{3}(?:\.\d{1,2})?\s+\p{L}[^\n]{3,100})$/mu;

function impegnativaLine(doc: RubricDocument): string | null {
  if (doc.pages.length > 2) return null;
  const text = doc.pages.map((p) => p.ocrText).join('\n');
  // Almeno DUE marcatori del modulo: una lettera che dice "si rilascia impegnativa"
  // non è un'impegnativa.
  if ((text.match(RICETTA_RE) ?? []).length < 2) return null;
  const quesito = QUESITO_RE.exec(text)?.[1] ?? ICD_LINE_RE.exec(text)?.[1] ?? null;
  const q = quesito ? scrubInlineCodes(quesito).trim() : '';
  return q ? `Impegnativa/prescrizione SSN agli atti; quesito diagnostico: «${q}»` : 'Impegnativa/prescrizione SSN agli atti (modulistica, nessun referto).';
}

/** Attestato di malattia telematico (INPS): si aggrega in una riga coi suoi
 * simili. Gli altri certificati (idoneità, visita di controllo, psicologa) sono
 * documenti a sé, con il loro blocco. */
const SICK_LEAVE_ATTESTATION_RE = /(attestat[oi] di malattia|certificat[oi] (medic[oi] )?(telematic[oi] )?di malattia|certificato telematico|dati (della )?prognosi|inizio malattia|\bpuc\b)/i;

function isSickLeaveAttestation(doc: RubricDocument): boolean {
  return SICK_LEAVE_ATTESTATION_RE.test(doc.pages.map((p) => p.ocrText).join('\n'));
}

/** Sotto questo residuo la rubrica che non entra nel tetto di blocco non viene
 * accorciata ma segnalata con "[...]". */
const MIN_TAIL_WORDS = 25;

/** Accorcia una rubrica già resa ("Titolo: «corpo»") al tetto, su confine di frase, dentro le virgolette. */
function trimRenderedLine(line: string, maxWords: number): string {
  const m = /^([\s\S]*?«)([\s\S]*)»$/.exec(line);
  if (!m) return capAtSentence(line, maxWords);
  return `${m[1]}${capAtSentence(m[2]!, maxWords)}»`;
}

/** Tetto di blocco per RIGHE intere (mai a metà di una «...»): la rubrica che non
 * entra viene accorciata al residuo (se ≥ 25 parole: l'esame obiettivo con l'NRS
 * non deve sparire dietro un'anamnesi lunga — panel giro 7), altrimenti resta
 * "[...]" fuori dalle virgolette. */
function capBlockLines(lines: ReadonlyArray<string | RenderedLine>, maxWords: number): string[] {
  const entries: RenderedLine[] = lines.map((l) => (typeof l === 'string' ? { text: l, core: false } : l));
  if (maxWords <= 0) return entries.map((e) => e.text);
  // Le rubriche-cuore (diagnosi, conclusioni, prognosi, indicazioni) sono sempre
  // rese: il tetto si applica al resto, col loro peso già sottratto (min 1/3).
  const coreWords = entries.filter((e) => e.core).reduce((n, e) => n + countWords(e.text), 0);
  const budget = Math.max(maxWords - coreWords, Math.ceil(maxWords / 3));
  const out: string[] = []; let used = 0; let cut = false;
  for (const e of entries) {
    if (e.core) { out.push(e.text); continue; }
    if (cut) continue;
    const w = countWords(e.text);
    if (out.length > 0 && used + w > budget) {
      const remaining = budget - used;
      out.push(remaining >= MIN_TAIL_WORDS ? trimRenderedLine(e.text, remaining) : '[...]');
      cut = true;
      continue;
    }
    out.push(e.text); used += w;
  }
  return out;
}

function normalizeForDedup(text: string): string {
  return text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

/** Chiave di dedup sull'INCIPIT (40 parole) del testo ripulito: lo stesso referto
 * letto in due documenti (fascicolo ↔ referto proprio) differisce solo nel piè
 * di pagina, e la chiave sul testo intero non lo riconosceva (C: RX 14.11 x2). */
const DEDUP_PREFIX_WORDS = 40;
/** Sotto questa lunghezza un referto è troppo generico per una chiave sull'incipit. */
const DEDUP_MIN_WORDS = 15;
function dedupPrefixKey(cleaned: string): string | null {
  const words = normalizeForDedup(cleaned).split(' ').filter(Boolean);
  return words.length >= DEDUP_MIN_WORDS ? words.slice(0, DEDUP_PREFIX_WORDS).join(' ') : null;
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

/** Sotto questo numero di parole (rubriche riconosciute, ripulite) un referto
 * integrale è "sottile" e il preambolo entra. */
const INTEGRALE_THIN_WORDS = 5;

function selectSegments(segments: ReadonlyArray<RubricSegment>, policy: RubricTypePolicy): { chosen: RubricSegment[]; fallback: boolean } {
  if (policy.mode === 'integrale') {
    // Il preambolo (carta intestata) resta fuori — salvo quando il resto è sottile:
    // in un tracciato ECG il referto ("Tachicardia sinusale…") precede l'unica
    // rubrica riconosciuta ("Indicazioni: trauma") e senza preambolo si perdeva
    // (panel giro 7, caso C). In quel caso entra ripulito dalla carta intestata.
    const others = segments.filter((s) => s.label !== 'preambolo');
    const othersWords = others.reduce((n, s) => n + countWords(stripAdminNoise(s.text)), 0);
    if (others.length > 0 && othersWords >= INTEGRALE_THIN_WORDS) return { chosen: others, fallback: false };
    const withPreambolo = segments.map((s) => (s.label === 'preambolo' ? { ...s, text: stripLetterhead(s.text) } : s));
    return { chosen: withPreambolo, fallback: false };
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
  if (chosen.length > 0) {
    // Lettera specialistica in prosa: l'unica rubrica riconosciuta è "Si consiglia";
    // anamnesi e obiettività stanno nel preambolo, che diventa il corpo del referto.
    const preambolo = segments.find((s) => s.label === 'preambolo');
    if (preambolo && chosen.every((s) => TRAILING_RUBRICS.has(s.label)) && countWords(stripAdminNoise(preambolo.text)) >= 20) {
      return { chosen: [{ ...preambolo, label: 'corpo', text: stripLetterhead(preambolo.text) }, ...chosen], fallback: false };
    }
    return { chosen, fallback: false };
  }
  if (policy.fallbackCorpo) {
    const corpo = segments.filter((s) => s.label === 'corpo' || s.label === 'preambolo' || s.label === 'referto');
    return { chosen: corpo.length > 0 ? corpo : [...segments], fallback: true };
  }
  return { chosen: [], fallback: true };
}

/** Corpo senza contenuto: solo titolo d'esame ("RX FEMORE SN:"), residui di
 * tabella (I/II/III, classi di dose), nessuna lettera. Mai una «…» vuota. */
function isEmptyBody(body: string): boolean {
  // Via le righe-residuo (numeri romani delle classi di dose, righe senza lettere).
  const lines = body.split('\n').map((l) => l.trim())
    .filter((l) => l && !/^[IVX]{1,4}$/.test(l) && /\p{L}/u.test(l.replace(/\[ILLEGGIBILE\]/gi, '')));
  if (lines.length === 0) return true;
  // "RX TORACE:" / "RX TORACE: I" (titolo + classe di dose): niente da citare.
  return lines.length === 1 && /^[^\n]{1,50}:\s*(?:[IVX]{1,4})?$/.test(lines[0]!);
}

function renderSegment(seg: RubricSegment, seen: Set<string>, stats: { dedup: number }, maxWords: number, withTitle = true): string | null {
  const key = normalizeForDedup(seg.text);
  if (key.length >= 40 && seen.has(key)) { stats.dedup++; return null; }
  const title = withTitle ? (RUBRIC_TITLES[seg.label] ?? (seg.rawLabel ?? '')) : '';
  const cleaned = stripAdminNoise(seg.text);
  if (!cleaned || isEmptyBody(cleaned)) return null;
  const prefix = dedupPrefixKey(cleaned);
  if (prefix && seen.has(prefix)) { stats.dedup++; return null; }
  if (key.length >= 40) seen.add(key);
  if (prefix) seen.add(prefix);
  const body = capAtSentence(cleaned.replace(/\n{2,}/g, '\n').trim(), maxWords);
  return title ? `${title}: «${body}»` : `«${body}»`;
}

/** Rubriche-cuore della perizia: non spariscono mai dietro il tetto di blocco. */
const CORE_RUBRICS: ReadonlySet<string> = new Set(['diagnosi', 'conclusioni', 'prognosi', 'indicazioni', 'dimissione', 'intervento']);
/** Le anamnesi (e il diario) hanno un tetto più stretto: sono la parte che
 * più spesso ingoia il blocco a scapito di obiettività e conclusioni. */
const NARRATIVE_RUBRICS: ReadonlySet<string> = new Set(['anamnesi', 'anamnesi_prossima', 'anamnesi_remota', 'diario']);
/** Rubriche "di coda": se sono le sole riconosciute, il corpo in prosa che le
 * precede (lettera specialistica senza intestazioni) è il referto. */
const TRAILING_RUBRICS: ReadonlySet<string> = new Set(['indicazioni', 'terapia', 'prognosi', 'note', 'consenso']);

interface RenderedLine { text: string; core: boolean; }

/** Un verbale di Pronto Soccorso: poche pagine e i marcatori tipici nel testo. */
function looksLikePsVerbale(doc: RubricDocument): boolean {
  if (doc.pages.length > PS_MAX_PAGES) return false;
  const head = doc.pages.slice(0, 2).map((p) => p.ocrText).join('\n');
  return PS_MARKERS_RE.test(head);
}

/** Policy EFFETTIVA del documento (spec Lavini 2026-09-04): un fascicolo di ricovero
 * è un contenitore (rimando alla lettera di dimissione se agli atti, altrimenti i soli
 * passaggi-chiave); un verbale di PS breve classificato 'cartella' o 'altro' è un PS. */
/** Fascicolo di ricovero classificato 'altro': molte pagine e i marcatori della cartella. */
const CARTELLA_MARKERS_RE = /(cartella clinica|diario clinico|foglio unico di terapia|consenso informato|verbale operatorio|regime di degenza|scheda di dimissione|lettera di dimissione)/gi;

function looksLikeFascicolo(doc: RubricDocument): boolean {
  if (doc.pages.length <= PS_MAX_PAGES) return false;
  const text = doc.pages.map((p) => p.ocrText).join('\n');
  return (text.match(CARTELLA_MARKERS_RE) ?? []).length >= 3;
}

function effectivePolicy(doc: RubricDocument, policy: RubricPolicy, hasLetteraDimissione: boolean): { tp: RubricTypePolicy; rimando: string | null } {
  const isFascicolo = doc.documentType === 'altro' && looksLikeFascicolo(doc);
  const tp = policyForType(policy, isFascicolo ? 'cartella_clinica' : doc.documentType);
  const psPolicy = policy.tipi.cartella_clinica ?? tp;
  if (doc.documentType === 'altro' && !isFascicolo && looksLikePsVerbale(doc)) return { tp: { ...psPolicy, mode: 'passaggi' }, rimando: null };
  if (tp.mode !== 'contenitore') return { tp, rimando: null };
  if (looksLikePsVerbale(doc)) return { tp: { ...tp, mode: 'passaggi' }, rimando: null };
  if (hasLetteraDimissione) {
    return { tp, rimando: `Fascicolo di ricovero agli atti (${doc.pages.length} pagine): si riporta la lettera di dimissione.` };
  }
  return { tp: { ...tp, mode: 'passaggi', copia: ['anamnesi_prossima', 'intervento', 'diagnosi', 'dimissione', 'prognosi'] }, rimando: null };
}

const SAME_DAY_RANK: Readonly<Record<string, number>> = { esame_strumentale: 0, referto_specialistico: 0, altro: 1, cartella_clinica: 2, certificato: 3, lettera_dimissione: 4 };
function sameDayRank(doc: RubricDocument): number { return SAME_DAY_RANK[doc.documentType ?? ''] ?? 1; }

export function renderRubricDocSanitaria(documents: ReadonlyArray<RubricDocument>, policy: RubricPolicy): RubricRenderResult {
  const seen = new Set<string>();
  const standaloneRefertoPrefixes = new Set<string>();
  const stats = { dedup: 0 };
  let omitted = 0; let fallbackDocs = 0; let illegibleDocs = 0;
  const blocks: string[] = [];
  const certificates: RubricDocument[] = [];
  // Ordine cronologico; a parità di data prima i referti (esame/visita col loro
  // titolo), poi i documenti generici, poi i fascicoli (rimando + referti in
  // degenza, che così risultano «già riprodotti» dai referti propri), poi
  // certificati e lettera; infine l'id: l'output non deve dipendere dall'ordine
  // di lettura dal DB.
  const ordered = [...documents].sort((a, b) =>
    a.sortDate.localeCompare(b.sortDate) || sameDayRank(a) - sameDayRank(b) || a.documentId.localeCompare(b.documentId));
  // I referti d'esame con documento PROPRIO vincono sulle copie dentro un fascicolo,
  // qualunque sia l'ordine delle date: le loro chiavi sono "viste" da subito.
  for (const d of documents) {
    if (d.documentType !== 'esame_strumentale') continue;
    for (const seg of parseRubriche(d.pages)) {
      const prefix = dedupPrefixKey(stripAdminNoise(seg.text));
      if (prefix) standaloneRefertoPrefixes.add(prefix);
    }
  }
  const hasLetteraDimissione = documents.some((d) => d.documentType === 'lettera_dimissione' && d.pages.some((p) => p.ocrText.trim().length > 0));

  for (const doc of ordered) {
    if (RUBRIC_EXCLUDED_DOC_TYPES.has(doc.documentType ?? '')) { omitted++; continue; }
    const effective = effectivePolicy(doc, policy, hasLetteraDimissione);
    const rimando = effective.rimando;
    let tp = effective.tp;
    if (tp.mode === 'ometti') { omitted++; continue; }
    if (tp.mode === 'una_riga') {
      if (isSickLeaveAttestation(doc)) { certificates.push(doc); continue; }
      // Certificato "vero" (idoneità, visita di controllo, relazione psicologica):
      // un documento a sé, coi suoi passaggi-chiave (o il corpo, se senza rubriche).
      tp = { ...tp, mode: 'passaggi', copia: [...tp.copia, 'conclusioni', 'esame_obiettivo', 'corpo', 'preambolo'], fallbackCorpo: true };
    }
    if (rimando) {
      // Fascicolo contenitore: resta il rimando + i referti d'esame eseguiti in
      // degenza (RX/TC/ECO dentro la cartella), che il gold riporta a parte.
      // Spec Lavini: si scartano RX torace / ECG / screening pre-operatori (routine di degenza).
      const embedded = parseRubriche(doc.pages)
        .filter((s) => s.label === 'referto' && s.rawLabel && /^(rx|rm|rmn|tc|tac|eco|ecografia|pet|moc|doppler|ecocolordoppler)\b/i.test(s.rawLabel))
        .filter((s) => !/torace|toracic|pre-?operator|screening|elettrocardio/i.test(`${s.rawLabel} ${s.text.slice(0, 80)}`))
        .filter((s) => { const k = dedupPrefixKey(stripAdminNoise(s.text)); return !(k && standaloneRefertoPrefixes.has(k)); })
        .map((s) => renderSegment(s, seen, stats, Math.ceil(tp.maxParole / 2)))
        .filter((l): l is string => l !== null);
      blocks.push(`${doc.header}\n${rimando}${embedded.length > 0 ? `\nReferti eseguiti in degenza:\n${capBlockLines(embedded, tp.maxParole).join('\n')}` : ''}`);
      continue;
    }
    // Impegnativa/ricetta SSN: modulistica, non referto. Una riga col quesito.
    const ricetta = impegnativaLine(doc);
    if (ricetta) { blocks.push(`${doc.header}\n${ricetta}`); continue; }
    // Manoscritto in larga parte illeggibile: copiare il garble tra «…» non è
    // fedeltà, è rumore depositato. Resta il documento (intestazione) e il rimando.
    const illegible = isMostlyIllegible(doc.pages);
    if (illegible) {
      blocks.push(`${doc.header}\nDocumento in larga parte non leggibile dall'OCR (${illegible.markers} passaggi illeggibili su ${illegible.lines} righe, verosimilmente manoscritto): consultare l'originale agli atti.`);
      illegibleDocs++;
      continue;
    }
    const segments = parseRubriche(doc.pages);
    if (segments.length === 0) { blocks.push(`${doc.header}\nDocumento senza testo leggibile: consultare l'originale agli atti.`); fallbackDocs++; continue; }
    const { chosen, fallback } = selectSegments(segments, tp);
    if (fallback) fallbackDocs++;
    // Tetto per rubrica (metà del tetto di blocco: la diagnosi non è mai tagliata
    // da un'anamnesi lunga) e tetto di blocco (la lunghezza tipica del gold).
    const perRubric = tp.maxParole > 0 ? Math.ceil(tp.maxParole / 2) : 0;
    const narrativeCap = tp.maxParole > 0 ? Math.ceil(tp.maxParole / 4) : 0;
    // In integrale (esami strumentali) conta solo il tetto di blocco: le "Notizie
    // cliniche" di un referto RM contengono il referto stesso, non un'anamnesi.
    const capFor = (label: string): number =>
      tp.mode === 'integrale' || label === 'corpo' || label === 'preambolo' ? tp.maxParole : NARRATIVE_RUBRICS.has(label) ? narrativeCap : perRubric;
    // Referto integrale (esami strumentali): il testo del medico com'è, senza etichette di rubrica.
    // Il corpo intero di un documento senza rubriche ha il tetto di blocco, non quello di rubrica.
    const lines: RenderedLine[] = [];
    for (const s of chosen) {
      const text = renderSegment(s, seen, stats, capFor(s.label), tp.mode !== 'integrale');
      if (text !== null) lines.push({ text, core: CORE_RUBRICS.has(s.label) });
    }
    if (lines.length === 0) {
      blocks.push(`${doc.header}\n${chosen.length > 0 ? 'Contenuto identico a un documento già riprodotto sopra.' : 'Documento agli atti; nessuna rubrica clinica riprodotta.'}`);
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

  return { markdown: blocks.join('\n\n'), blocks: blocks.length, omitted, dedupSkipped: stats.dedup, fallbackDocs, illegibleDocs };
}
