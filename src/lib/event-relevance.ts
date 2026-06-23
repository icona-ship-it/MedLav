/**
 * Deterministic clinical-relevance tier for an event (pure, no LLM, client-safe).
 *
 * - T1 (critico al nesso/danno): diagnosi, interventi, ricoveri, complicanze,
 *   qualsiasi evento con diagnosi documentata, ed eventi con fonti DISCORDANTI
 *   (affermazioni cliniche contestate = load-bearing in sede peritale).
 * - T2 (rilevante): visite, referti, terapie, consensi, imaging strumentale.
 * - T3 (contesto/routine): esami di laboratorio, prescrizioni, follow-up,
 *   certificati, documenti amministrativi, spese.
 *
 * Pilota la documentazione VERBATIM selettiva e il filtro del report (gli eventi
 * importanti, NON il rumore). Il perito può sempre fare override.
 */
export type RelevanceTier = 'T1' | 'T2' | 'T3';

/** True per un evento di esame ematochimico / di laboratorio.
 * ATTENZIONE alla forma REALE prodotta dalla pipeline: l'estrazione normalizza
 * "laboratorio"/"ematochimico" a eventType `'esame'` e sourceType `'esame_ematochimico'`
 * (extract-events.ts: EVENT_TYPE_ALIASES vs SOURCE_TYPE_ALIASES). Il marcatore reale è
 * quindi `sourceType` — controllarlo PRIMA (eventType resta come fallback difensivo, ma la
 * pipeline non emette mai eventType 'esame_ematochimico'). */
export function isLabTestEvent(event: { eventType?: string; sourceType?: string | null }): boolean {
  return event.sourceType === 'esame_ematochimico' || event.eventType === 'esame_ematochimico';
}

const TIER1_TYPES: ReadonlySet<string> = new Set(['diagnosi', 'intervento', 'ricovero', 'complicanza']);
const TIER2_TYPES: ReadonlySet<string> = new Set(['visita', 'referto', 'terapia', 'consenso']);

export function computeRelevanceTier(event: {
  eventType: string;
  diagnosis?: string | null;
  sourceType?: string | null;
  discrepancyNote?: string | null;
}): RelevanceTier {
  // Contested clinical statements (discordant sources) are always load-bearing.
  if (event.discrepancyNote && event.discrepancyNote.includes('DISCORDANTE')) return 'T1';
  if (TIER1_TYPES.has(event.eventType) || (event.diagnosis && event.diagnosis.trim().length > 0)) return 'T1';
  if (TIER2_TYPES.has(event.eventType) || event.sourceType === 'esame_strumentale') return 'T2';
  return 'T3';
}

/**
 * True per un lab da ESCLUDERE dalla riproduzione verbatim della doc-sanitaria RC: un
 * ematochimico di ROUTINE (T2/T3 — il "rumore" che Lavini vuole togliere). Un lab T1
 * LOAD-BEARING (con diagnosi documentata o fonte DISCORDANTE — es. un D-dimero che
 * sostiene una TVP) NON è escludibile: è un FATTO e va tenuto ("mai perdere un fatto").
 * Risolve la tensione tra la direttiva Lavini e l'invariante supremo del progetto.
 */
export function isExcludableLabEvent(event: {
  eventType?: string;
  sourceType?: string | null;
  diagnosis?: string | null;
  discrepancyNote?: string | null;
  relevanceTier?: RelevanceTier | null;
}): boolean {
  if (!isLabTestEvent(event)) return false;
  const tier =
    event.relevanceTier ??
    computeRelevanceTier({
      eventType: event.eventType ?? '',
      diagnosis: event.diagnosis,
      sourceType: event.sourceType,
      discrepancyNote: event.discrepancyNote,
    });
  return tier !== 'T1';
}
