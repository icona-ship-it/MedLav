/**
 * SelettivitàPolicy — distillazione v2 della "Documentazione Medica Prodotta"
 * (perizia RC stragiudiziale).
 *
 * I 3 gold di Lavini OMETTONO intere categorie di contenuto che l'app invece
 * riproduceva (confronto w5rin5vrq, 2026-06-29): log di terapia
 * giorno-per-giorno, diario infermieristico, cartella anestesiologica, scale
 * di valutazione, trasfusioni. Queste categorie NON hanno un documentType o
 * eventType dedicato (vivono dentro cartella_clinica) → si riconoscono con
 * euristiche di CONTENUTO deterministiche e CONSERVATIVE.
 *
 * La POLICY è config: cambiare l'azione di una categoria (es. dopo le risposte
 * di Lavini al questionario) = 1 riga qui, zero chirurgia. Default =
 * comportamento OSSERVATO nei gold (founding doc: "se mancano le risposte,
 * default = gold, provvisorio").
 *
 * SALVAGUARDIA SUPREMA ("mai perdere un fatto"): un evento T1 load-bearing
 * (diagnosi documentata o fonti DISCORDANTI) NON è mai omesso, qualunque sia
 * la sua categoria — identica ai filtri lab/noise di event-relevance.
 *
 * NB: consensi informati, documenti amministrativi (v1) e lab di routine
 * restano gestiti da isExcludableNoiseEvent / isExcludableLabEvent
 * (event-relevance.ts): lì il marcatore è il TIPO, qui il CONTENUTO.
 */

import { computeRelevanceTier, type RelevanceTier } from '@/lib/event-relevance';

export type DistillAction = 'ometti' | 'condensa' | 'verbatim';

export type DistillCategory =
  | 'log_terapia'
  | 'diario_infermieristico'
  | 'cartella_anestesiologica'
  | 'scala_valutazione'
  | 'trasfusione';

/** Config della distillazione — 1 riga per categoria (decisioni Lavini). */
export const SELETTIVITA_POLICY: Readonly<Record<DistillCategory, DistillAction>> = {
  log_terapia: 'ometti',
  diario_infermieristico: 'ometti',
  cartella_anestesiologica: 'ometti',
  scala_valutazione: 'ometti',
  trasfusione: 'ometti',
};

interface DistillEventLike {
  eventType?: string;
  sourceType?: string | null;
  title?: string | null;
  description?: string | null;
  sourceText?: string | null;
  diagnosis?: string | null;
  discrepancyNote?: string | null;
  relevanceTier?: RelevanceTier | null;
}

/**
 * Euristiche per categoria: keyword INEQUIVOCABILI, mai termini clinici
 * generici (un falso positivo = fatto perso, il costo asimmetrico è tutto lì).
 */
const CATEGORY_PATTERNS: ReadonlyArray<{ category: DistillCategory; pattern: RegExp }> = [
  {
    category: 'log_terapia',
    pattern: /foglio unico di terapia|\bfut\b|scheda (di )?terapia|somministrazion\w* (di |della )?(terapia|farmac)|terapia somministrata|registro (di )?somministrazion/i,
  },
  {
    category: 'diario_infermieristico',
    pattern: /diario infermieristic|consegn\w* infermieristich|scheda infermieristic|diario assistenzial/i,
  },
  {
    category: 'cartella_anestesiologica',
    pattern: /anestesiologic|check[- ]?list (di )?sala operatoria|checklist operatoria|scheda (di )?anestesia|\basa\s+(i{1,3}v?|[1-4])\b/i,
  },
  {
    category: 'scala_valutazione',
    pattern: /\b(barthel|braden|svama|conley|morse|tinetti|mews|news2?)\b|scala di valutazione|rischio (di )?cadut|rischio lesioni da (pressione|decubito)/i,
  },
  {
    category: 'trasfusione',
    pattern: /trasfusion|emocomponent|emazie concentrate|sacca di (sangue|emazie)|prove crociate|compatibilit\w* trasfusional/i,
  },
];

/**
 * Classifica un evento in una categoria di distillazione (o null se è
 * contenuto clinico ordinario). Deterministica, pura, client-safe.
 */
export function classifyDistillCategory(event: DistillEventLike): DistillCategory | null {
  const haystack = `${event.title ?? ''} ${event.description ?? ''} ${event.sourceText ?? ''}`;
  for (const { category, pattern } of CATEGORY_PATTERNS) {
    if (pattern.test(haystack)) return category;
  }
  return null;
}

function isLoadBearing(event: DistillEventLike): boolean {
  const tier =
    event.relevanceTier ??
    computeRelevanceTier({
      eventType: event.eventType ?? '',
      diagnosis: event.diagnosis,
      sourceType: event.sourceType,
      discrepancyNote: event.discrepancyNote,
    });
  return tier === 'T1';
}

/**
 * True se l'evento va OMESSO dalla doc-sanitaria per policy (categoria mappata
 * a 'ometti') E non è load-bearing. "Mai perdere un fatto" prevale sempre.
 */
export function isExcludableByPolicy(event: DistillEventLike): boolean {
  const category = classifyDistillCategory(event);
  if (!category || SELETTIVITA_POLICY[category] !== 'ometti') return false;
  return !isLoadBearing(event);
}

export interface DistillStats {
  total: number;
  omitted: number;
  byCategory: Record<string, number>;
}

/**
 * Partiziona gli eventi della doc-sanitaria: `kept` (da riprodurre) e
 * statistiche degli omessi per categoria (trasparenza: i conteggi vanno nei
 * log di pipeline e sono ricalcolabili in ogni momento dagli eventi in DB —
 * nessun dato clinico nei log, solo numeri).
 */
export function distillDocSanitariaEvents<T extends DistillEventLike>(
  events: T[],
): { kept: T[]; stats: DistillStats } {
  const kept: T[] = [];
  const byCategory: Record<string, number> = {};
  for (const event of events) {
    if (isExcludableByPolicy(event)) {
      const category = classifyDistillCategory(event) ?? 'altro';
      byCategory[category] = (byCategory[category] ?? 0) + 1;
    } else {
      kept.push(event);
    }
  }
  return {
    kept,
    stats: { total: events.length, omitted: events.length - kept.length, byCategory },
  };
}
