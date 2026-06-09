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
