/**
 * Ambito temporale di un evento estratto (feedback medici 2026-08-19, Mail 2 +
 * collaudo 2026-09-04): un referto di visita oncologica di 3 pagine veniva
 * esploso in 12 eventi cronologici — la visita del giorno, 8 eventi della
 * "storia oncologica" (anamnesi) e un esame programmato — tutti resi come
 * accadimenti autonomi, con intestazione-blocco "dal 27.02 al 18.06".
 *
 * Regola di prodotto: UN referto = UNA voce datata con la data del referto;
 * ciò che il documento RIFERISCE del passato è un sotto-elenco, ciò che
 * PREVEDE è "programmato". Il campo non elimina mai un evento ("mai perdere
 * un fatto"): pilota la resa e, per i soli 'programmato', i calcoli.
 *
 * - corrente:      accade nel documento (visita, esame, intervento del giorno)
 * - retrospettivo: riferito nel documento come già avvenuto (anamnesi, storia
 *                  clinica, "esiti di…")
 * - programmato:   previsto/prenotato per il futuro rispetto al documento
 *
 * Default SEMPRE 'corrente' (comportamento storico, righe pre-migration 0034).
 */

export const TEMPORAL_SCOPES = ['corrente', 'retrospettivo', 'programmato'] as const;
export type TemporalScope = (typeof TEMPORAL_SCOPES)[number];

const SCOPE_SET: ReadonlySet<string> = new Set(TEMPORAL_SCOPES);

/** Riduce un valore qualsiasi (LLM, colonna DB, input UI) all'enum. Mai throw. */
export function normalizeTemporalScope(raw: unknown): TemporalScope {
  if (typeof raw !== 'string') return 'corrente';
  const v = raw.trim().toLowerCase();
  return SCOPE_SET.has(v) ? (v as TemporalScope) : 'corrente';
}

/** Ordine di prevalenza fra gemelli: corrente < programmato < retrospettivo. */
export function temporalScopeRank(scope: TemporalScope | string | null | undefined): number {
  switch (normalizeTemporalScope(scope)) {
    case 'corrente': return 0;
    case 'programmato': return 1;
    case 'retrospettivo': return 2;
  }
}

export const TEMPORAL_SCOPE_LABELS: Record<TemporalScope, string> = {
  corrente: 'Avvenuto nel documento',
  retrospettivo: 'Riferito (anamnesi / storia)',
  programmato: 'Programmato / previsto',
};
