/**
 * RETE A — Coerenza estratto ↔ fonte.
 *
 * Confronta i token che PESANO (lateralità, opposti clinici) tra il testo
 * strutturato di un evento (title + description) e il suo `source_text` OCR.
 * Se la fonte afferma in modo UNIVOCO l'OPPOSTO di ciò che dice l'evento — una
 * lateralità invertita (destra↔sinistra) o un opposto clinico (composta↔scomposta,
 * iper↔ipo) — l'evento va marcato "da verificare": è la classe di errore
 * (estrazione che contraddice la propria fonte) che il verificatore citazioni NON
 * vede, perché non guarda i campi strutturati.
 *
 * Deterministica: nessun LLM, nessun costo. Riusa la nozione di "opposto clinico"
 * già testata dello snapper (isClinicalOpposite) — stessa semantica, un solo posto.
 *
 * ALTA PRECISIONE per costruzione (non gonfiare il pannello "Da controllare"):
 * - lateralità: flag SOLO se l'evento afferma un lato e la fonte afferma SOLO
 *   l'opposto (se la fonte cita entrambi i lati, o nessuno, è ambiguo → niente flag);
 * - opposti clinici: solo su parole di contenuto (≥5 char), solo se la parola
 *   dell'evento è ASSENTE dalla fonte ma vi compare il suo opposto.
 * Non copre (per scelta, evitando rumore): negazioni (ambiguità di scope) e opposti
 * ad alta edit-distance non elencati (distale/prossimale) — sono estensioni future.
 */

import { isAntonymPrefixFlip, isClinicalAntonym, normalizeWord } from './quote-snapper';

/**
 * Privativi CLINICI curati — per il confronto NON allineato di Rete A (evento×fonte,
 * tutte le coppie) i prefissi privativi GENERATIVI dello snapper ('de','s','anti'…)
 * sono troppo larghi: farebbero scattare coppie casuali come "decorso"/"corso" o
 * "anticorpi"/"corpi" (falsi positivi trovati dal passaggio avversariale 2026-08-13).
 * Nello snapper quell'euristica è sicura perché confronta parole GIÀ allineate (LCS);
 * qui no. Quindi lista curata dei privativi clinici che pesano davvero. Estendibile
 * per misura (ogni falso negativo trovato → una coppia in più). */
const CLINICAL_PRIVATIVE_PAIRS: ReadonlyArray<readonly [string, string]> = [
  ['composta', 'scomposta'],
  ['stabile', 'instabile'],
  ['mobile', 'immobile'],
  ['tipico', 'atipico'],
  ['sintomatico', 'asintomatico'],
];

/** Opposto clinico per Rete A: famiglie di prefisso-antonimo (iper/ipo, ab/ad,
 * intra/extra, endo/eso — sicure anche non allineate) + antonimi + privativi curati.
 * NON usa il privativo generativo (troppo rumoroso fuori dall'allineamento). */
function isOppositeForNetA(a: string, b: string): boolean {
  if (isAntonymPrefixFlip(a, b) || isClinicalAntonym(a, b)) return true;
  return CLINICAL_PRIVATIVE_PAIRS.some(([x, y]) => (a === x && b === y) || (a === y && b === x));
}

export interface ConsistencyEvent {
  title?: string | null;
  description?: string | null;
  source_text?: string | null;
}

export interface ConsistencyResult {
  /** true = l'evento contraddice la propria fonte su un token che pesa. */
  flagged: boolean;
  /** Motivo leggibile dal perito (per la reliability note). */
  reason?: string;
}

type Side = 'dx' | 'sx' | 'bilat';

/** Lateralità CON il lato (LATERALITY_WORDS dello snapper è lato-agnostico). */
const LATERALITY_SIDE: Readonly<Record<string, Side>> = {
  dx: 'dx', ds: 'dx', destro: 'dx', destra: 'dx', destri: 'dx', destre: 'dx',
  sx: 'sx', sn: 'sx', sinistro: 'sx', sinistra: 'sx', sinistri: 'sx', sinistre: 'sx',
  bilaterale: 'bilat', bilaterali: 'bilat', bilateralmente: 'bilat',
};

function toWords(text: string): string[] {
  return text.split(/\s+/).map(normalizeWord).filter((w) => w.length > 0);
}

function sidesOf(words: string[]): Set<Side> {
  const s = new Set<Side>();
  for (const w of words) {
    const side = LATERALITY_SIDE[w];
    if (side) s.add(side);
  }
  return s;
}

/** Contraddizione di lateralità solo se UNIVOCA da entrambi i lati. */
function lateralityContradiction(st: Set<Side>, src: Set<Side>): string | null {
  const stDx = st.has('dx');
  const stSx = st.has('sx');
  const srcDx = src.has('dx');
  const srcSx = src.has('sx');
  // Evento "destra" (e non sinistra); fonte "sinistra" (e non destra).
  if (stDx && !stSx && srcSx && !srcDx) {
    return 'Lateralità discorde: l\'evento indica "destra" ma la fonte riporta "sinistra" — verificare sul documento';
  }
  if (stSx && !stDx && srcDx && !srcSx) {
    return 'Lateralità discorde: l\'evento indica "sinistra" ma la fonte riporta "destra" — verificare sul documento';
  }
  return null;
}

/**
 * Controlla se un evento contraddice la propria fonte su un token che pesa.
 * Se `source_text` è vuoto non si può verificare → nessun flag (mai inventare dubbi).
 */
export function checkEventSourceConsistency(event: ConsistencyEvent): ConsistencyResult {
  const source = String(event.source_text ?? '');
  if (source.trim().length === 0) return { flagged: false };

  const structuredWords = toWords(`${event.title ?? ''} ${event.description ?? ''}`);
  const sourceWords = toWords(source);
  if (structuredWords.length === 0) return { flagged: false };

  // 1. Lateralità invertita (l'errore clinico-legale più grave).
  const lat = lateralityContradiction(sidesOf(structuredWords), sidesOf(sourceWords));
  if (lat) return { flagged: true, reason: lat };

  // 2. Opposto clinico (composta↔scomposta, iper↔ipo, abduttore↔adduttore, ...):
  // parola di contenuto dell'evento ASSENTE dalla fonte ma con l'opposto presente.
  const sourceSet = new Set(sourceWords);
  for (const w of structuredWords) {
    if (w.length < 5 || sourceSet.has(w)) continue;
    for (const sw of sourceSet) {
      if (sw.length < 5) continue;
      if (isOppositeForNetA(w, sw)) {
        return {
          flagged: true,
          reason: `Possibile opposto clinico: l'evento usa "${w}" ma la fonte riporta "${sw}" — verificare sul documento`,
        };
      }
    }
  }

  return { flagged: false };
}
