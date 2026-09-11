/**
 * Consapevolezza delle PAUSE durante l'estrazione (CASO-2026-235: il servizio
 * AI impone pause da rate-limit anche di 15-20 minuti sui fascicoli grandi —
 * silenzi totali in cui contatore e percentuale restano fermi. Chi guarda lo
 * schermo vive un blocco, annulla a 2/3 del lavoro e perde tutto).
 *
 * Regola di prodotto: mai lasciare l'utente a interpretare un silenzio.
 * Sotto i 4 minuti è ritmo normale; tra 4 e 15 si spiega la pausa; oltre i 15
 * si dà anche la via d'uscita (annulla e riavvia, crediti rimborsati).
 */

export interface StallNotice {
  tone: 'none' | 'info' | 'warn';
  text?: string;
}

/** Minuti di silenzio oltre i quali la pausa va spiegata. */
export const STALL_INFO_MINUTES = 4;
/** Minuti oltre i quali si offre anche la via d'uscita. */
export const STALL_WARN_MINUTES = 15;

/** 'extraction' = eventi in crescita; 'ocr' = nessun evento ancora (lettura dei documenti,
 * audit 2026-09-10 R6: prima a 0 eventi non compariva alcun avviso per 60 minuti). */
export type StallPhase = 'extraction' | 'ocr';

export function stallNotice(minutesSinceLastProgress: number, phase: StallPhase = 'extraction'): StallNotice {
  const what = phase === 'ocr' ? 'Nessun avanzamento nella lettura dei documenti' : 'Nessun nuovo evento';
  if (minutesSinceLastProgress >= STALL_WARN_MINUTES) {
    return {
      tone: 'warn',
      text: `${what} da ${minutesSinceLastProgress} minuti. Le pause lunghe possono capitare sui fascicoli voluminosi (il servizio AI lavora a intervalli) e l'analisi riparte da sola. Se resta ferma ancora a lungo puoi annullare in fondo alla pagina e riavviare: i documenti restano e i crediti dell'elaborazione ti vengono rimborsati.`,
    };
  }
  if (minutesSinceLastProgress >= STALL_INFO_MINUTES) {
    return {
      tone: 'info',
      text: `${what} da ${minutesSinceLastProgress} minuti: è una pausa normale — il servizio AI impone attese tra un blocco e l'altro, soprattutto sui fascicoli grandi. L'analisi riprende da sola, non serve fare nulla.`,
    };
  }
  return { tone: 'none' };
}
