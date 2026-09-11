/**
 * Modalità della sezione "Documentazione Sanitaria" della perizia RC.
 *
 * Decisione founder 2026-09-11 (ADR-027): il default per i NUOVI casi è
 * 'rubriche' (passaggi-chiave copiati dal codice, zero LLM), perché è la
 * modalità misurata dal gate gold (73/63/52) e non può inventare. Il valore
 * viene reso ESPLICITO nei metadati all'avvio dell'elaborazione, così
 * generazione, rigenerazione, viewer ed export leggono lo stesso valore; i
 * casi avviati prima (metadati senza modalità) restano come sono.
 */

export type DocSanitariaMode = 'selettiva' | 'rubriche' | 'integrale';

export const DOC_SANITARIA_MODES: readonly DocSanitariaMode[] = ['selettiva', 'rubriche', 'integrale'];

export const DEFAULT_DOC_SANITARIA_MODE: DocSanitariaMode = 'rubriche';

export function isDocSanitariaMode(value: unknown): value is DocSanitariaMode {
  return typeof value === 'string' && (DOC_SANITARIA_MODES as readonly string[]).includes(value);
}

/**
 * Modalità da salvare nei metadati all'avvio: quella già scelta dal perito se
 * valida, altrimenti il default. Solo la pipeline completa ('full') ha la
 * sezione: per le altre restituisce null (nessuna scrittura). Pura.
 */
export function resolveDocSanitariaModeForStart(
  periziaMetadata: Record<string, unknown> | null | undefined,
  pipelineMode: string | null | undefined,
): DocSanitariaMode | null {
  if (pipelineMode !== 'full') return null;
  const stored = periziaMetadata?.docSanitariaMode;
  return isDocSanitariaMode(stored) ? stored : DEFAULT_DOC_SANITARIA_MODE;
}
