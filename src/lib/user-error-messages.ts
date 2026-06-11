/**
 * Map technical/internal error messages to user-friendly Italian messages
 * with actionable remediation steps.
 */

const ERROR_MAP: Array<{ pattern: RegExp; message: string }> = [
  // NB: messaggi GIÀ user-facing (scritti in italiano per l'utente dalla
  // pipeline) stanno PRIMA di tutto: senza questi pattern finirebbero nel
  // fallback "errore imprevisto" — successo durante il test reale 2026-06-11:
  // 12 atti amministrativi correttamente analizzati (zero eventi clinici =
  // normale per procure/decreti/PEC) mostrati come finti errori spaventosi.
  {
    pattern: /nessun evento strutturato individuato/i,
    message: 'Nessun dato clinico in questo documento (normale per atti amministrativi, procure, comunicazioni): il testo è stato letto ed è comunque consultabile.',
  },
  {
    pattern: /non contiene testo leggibile/i,
    message: 'Il documento non contiene testo leggibile (potrebbe essere corrotto, protetto o una scansione illeggibile). Prova a riconvertirlo in PDF e ricaricarlo.',
  },
  // NB: i due pattern del validatore report stanno PRIMA dei pattern generici —
  // i messaggi dei finding possono contenere frasi come "non trovato" che
  // altrimenti verrebbero mappate su "Risorsa non trovata".
  {
    pattern: /controllo NON ignorabile/i,
    message: 'Il report è stato bloccato da un controllo di sicurezza non ignorabile (possibile dato copiato dagli esempi o fabbricato). Rigenera il report; se il problema persiste, contatta il supporto.',
  },
  {
    pattern: /Report non valido/i,
    message: 'Il report generato non ha superato i controlli di qualità automatici ed è stato bloccato per proteggerti da un report difettoso. Puoi riavviare l\'elaborazione oppure, se ritieni si tratti di un falso allarme, rigenerare ignorando i controlli di qualità.',
  },
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
    message: 'Il servizio è temporaneamente non disponibile. Riprova tra qualche minuto.',
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
