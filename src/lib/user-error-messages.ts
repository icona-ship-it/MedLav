/**
 * Map technical/internal error messages to user-friendly Italian messages
 * with actionable remediation steps.
 */

const ERROR_MAP: Array<{ pattern: RegExp; message: string }> = [
  {
    pattern: /All documents failed OCR/i,
    message: 'Impossibile leggere i documenti. Verifica che i file siano PDF, immagini (JPG, PNG) o Word validi e non corrotti.',
  },
  {
    pattern: /OCR.*(?:timeout|timed out)/i,
    message: 'La lettura del documento ha richiesto troppo tempo. Prova con un file più piccolo o meno pagine.',
  },
  {
    pattern: /rate.?limit|429|Too many requests|Troppe richieste/i,
    message: 'Troppe richieste. Attendi qualche minuto e riprova.',
  },
  {
    pattern: /network|ECONNREFUSED|ENOTFOUND|fetch failed/i,
    message: 'Errore di connessione. Verifica la tua connessione internet e riprova.',
  },
  {
    pattern: /auth|autenticato|401|unauthorized/i,
    message: 'Sessione scaduta. Effettua nuovamente il login.',
  },
  {
    pattern: /permission|forbidden|403/i,
    message: 'Non hai i permessi per questa operazione.',
  },
  {
    pattern: /not found|404|non trovato/i,
    message: 'Risorsa non trovata. La pagina potrebbe essere stata rimossa.',
  },
  {
    pattern: /file.*(?:too large|size|grande)/i,
    message: 'File troppo grande. Il limite è 100MB per documento.',
  },
  {
    pattern: /invalid.*(?:format|tipo|type)/i,
    message: 'Formato file non supportato. Usa PDF, JPG, PNG, TIFF, DOC, DOCX o XLS.',
  },
  {
    pattern: /extraction.*fail|estrazione.*fallita/i,
    message: 'Errore nell\'analisi del documento. Il file potrebbe essere protetto da password o corrotto.',
  },
  {
    pattern: /synthesis.*fail|sintesi.*fallita/i,
    message: 'Errore nella generazione del report. Riprova tra qualche minuto.',
  },
  {
    pattern: /circuit.?breaker|service unavailable|503/i,
    message: 'Il servizio AI è temporaneamente non disponibile. Riprova tra qualche minuto.',
  },
  {
    pattern: /500|internal.*error|errore interno/i,
    message: 'Si è verificato un errore. Se il problema persiste, contatta il supporto.',
  },
];

/**
 * Convert a technical error message to a user-friendly Italian message.
 * Returns the friendly message if a pattern matches, otherwise returns a generic message.
 */
export function toUserMessage(error: string | Error | unknown): string {
  const msg = error instanceof Error ? error.message : String(error ?? '');

  for (const { pattern, message } of ERROR_MAP) {
    if (pattern.test(msg)) return message;
  }

  return 'Si è verificato un errore imprevisto. Riprova tra qualche istante.';
}
