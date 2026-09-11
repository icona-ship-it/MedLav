/**
 * Messaggio per il medico quando l'analisi fallisce, composto LATO SERVER dove
 * si conosce l'esito del rimborso (audit 2026-09-10, R7: il box «Elaborazione
 * non riuscita» diceva «errore imprevisto» anche quando i crediti erano stati
 * rimborsati o il messaggio era già scritto per l'utente). Puro.
 */
import { toUserMessage } from './user-error-messages';

export type RefundOutcome = 'refunded' | 'already_refunded' | 'not_refundable' | 'none' | 'failed';

export function refundSentence(outcome: RefundOutcome, amount?: number): string {
  switch (outcome) {
    case 'refunded':
      return amount && amount > 0
        ? `I ${amount} crediti dell'elaborazione ti sono stati rimborsati.`
        : 'I crediti dell\'elaborazione ti sono stati rimborsati.';
    case 'already_refunded':
      return 'I crediti dell\'elaborazione ti erano già stati rimborsati.';
    case 'not_refundable':
      return 'I crediti della lettura già eseguita non vengono rimborsati.';
    case 'failed':
      return 'Il rimborso automatico dei crediti non è riuscito: scrivici e lo sistemiamo subito.';
    case 'none':
    default:
      return '';
  }
}

/** Testo del box «Elaborazione non riuscita»: causa in italiano + esito del rimborso. */
export function composePipelineFailureUserMessage(errorMessage: string, outcome: RefundOutcome, amount?: number): string {
  const base = toUserMessage(errorMessage, { context: 'pipeline' }).trim();
  const refund = refundSentence(outcome, amount);
  if (!refund) return base;
  // Il messaggio del monitor contiene già l'esito del rimborso: non ripeterlo.
  if (/rimborsat/i.test(base)) return base;
  return `${base} ${refund}`;
}

/** Nota mostrata nel passo Perizia quando «Riscrivi tutto il report» fallisce. */
export function composeRegenerationFailureUserMessage(errorMessage: string): string {
  const cause = toUserMessage(errorMessage, { context: 'pipeline' }).trim();
  return `Rigenerazione non riuscita: ${cause} Il report precedente è invariato e i crediti della rigenerazione ti vengono rimborsati.`;
}
