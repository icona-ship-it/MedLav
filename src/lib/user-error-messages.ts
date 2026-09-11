/**
 * Map technical/internal error messages to user-friendly Italian messages
 * with actionable remediation steps.
 */

const ERROR_MAP: Array<{ pattern: RegExp; message: string }> = [
  {
    // Annullamento volontario (cancel route): senza questo ramo ogni documento
    // mostrava "errore imprevisto" dopo un annullo scelto dall'utente.
    pattern: /annullat[oa] dall.utente/i,
    message: 'Analisi annullata su tua richiesta: questo documento non è stato elaborato. Riavvia l\'elaborazione quando vuoi — il file caricato è ancora qui.',
  },
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
  // Audit 2026-09-10 (reperti R7): messaggi REALI della pipeline che finivano nel
  // fallback generico o su un consiglio sbagliato. I pattern specifici stanno
  // PRIMA di quelli generici (500, not found, auth, extraction).
  {
    pattern: /\[INPUT_TOO_LARGE\]/,
    message: 'Il caso supera il limite di 5000 pagine. Suddividi la documentazione in più casi (per esempio per periodo o per struttura) e riavvia l\'elaborazione.',
  },
  {
    pattern: /hanno fallito l.OCR|OCR fallito su|All documents failed OCR/i,
    message: 'Impossibile leggere i documenti, o la maggior parte di essi. Verifica che i file siano PDF, immagini (JPG, PNG) o Word leggibili e non corrotti, rimuovi quelli illeggibili dal passo Documenti e riavvia l\'elaborazione.',
  },
  {
    pattern: /^Pipeline fallita$|Elaborazione interrotta \(timeout\)/i,
    message: 'Questo documento non è stato elaborato perché l\'analisi del caso si è interrotta: il motivo è nel passo Elaborazione, da dove puoi riavviarla.',
  },
  {
    pattern: /Estrazione fallita: 0 eventi|JSON LLM irrecuperabile|batch falliti/i,
    message: 'La lettura dei documenti è riuscita, ma l\'analisi clinica non ha prodotto risultati per un errore del servizio AI, non dei tuoi file. Riavvia l\'elaborazione tra qualche minuto.',
  },
  {
    pattern: /Pages not found|Case not found/i,
    message: 'Durante l\'analisi non sono stati trovati i dati del caso (documento o caso rimosso nel frattempo). Riavvia l\'elaborazione; se si ripete, scrivici indicando il codice del caso.',
  },
  {
    pattern: /mistral.*(?:401|unauthorized)|(?:401|unauthorized).*mistral/i,
    message: 'Il servizio AI ha rifiutato la richiesta per un problema di configurazione del servizio, non dei tuoi documenti o del tuo account: non serve uscire e rientrare, scrivici indicando il codice del caso.',
  },
  {
    pattern: /unauthorized access to case/i,
    message: 'Non hai accesso a questo caso.',
  },
  {
    // AUDIT 2026-07-16: PDF protetto da password → prima "errore imprevisto".
    pattern: /password|encrypted|protett|criptat|cannot decrypt/i,
    message: 'Il documento è protetto da password: rimuovi la protezione (o stampalo/ri-salvalo in PDF senza password) e ricaricalo.',
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
    // Include i messaggi REALI di Supabase Storage per un upload oltre limite —
    // "Payload too large", "The object exceeded the maximum allowed size", 413:
    // NON contengono la parola "file", quindi il vecchio pattern li mancava e
    // l'utente vedeva "errore imprevisto" (bug Motta 2026-07-06).
    pattern: /file.*(?:too large|size|grande)|payload too large|exceeded the maximum|maximum allowed size|(?:request )?entity too large|\b413\b/i,
    message: 'File troppo grande (limite 100 MB per documento). Se è un PDF voluminoso, dividilo in file più piccoli prima di caricarlo.',
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
    // \b500\b: «limite 5000 pagine» e «50000 chars» NON sono un HTTP 500 (audit 2026-09-10).
    pattern: /\b500\b|internal.*error|errore interno/i,
    message: 'Si è verificato un errore del servizio. Riprova tra qualche minuto; se il problema persiste, scrivici indicando il codice del caso.',
  },
];

/**
 * Convert a technical error message to a user-friendly Italian message.
 * Returns the friendly message if a pattern matches, otherwise returns a generic message.
 */
/**
 * Messaggi API GIÀ user-friendly (con numeri/dettagli utili tipo il saldo
 * crediti): vanno mostrati così come sono, non appiattiti sul generico
 * (sweep chiarezza 2026-07-24).
 */
const PASS_THROUGH: RegExp[] = [
  /crediti insufficienti/i,
  /elaborazione (già )?in corso/i,
  /troppi tentativi/i,
  /ricarica la pagina e riprova/i,
  /nessun credito è stato addebitato/i,
  // Messaggi già user-facing scritti dalla pipeline (stuck-case-monitor, onFailure)
  /crediti ti sono stati rimborsati/i,
  /si è interrotta durante la fase/i,
];

export interface ToUserMessageOptions {
  /** 'pipeline': l'errore viene dall'analisi di un caso → il fallback dice di
   * riavviare dal passo Elaborazione, non «riprova tra qualche istante». */
  context?: 'pipeline';
}

export const PIPELINE_FALLBACK_MESSAGE =
  'L\'analisi si è interrotta per un errore del servizio, non dei tuoi documenti. Riavvia l\'elaborazione dal passo Elaborazione; se si ripete, scrivici indicando il codice del caso.';

export function toUserMessage(error: string | Error | unknown, opts?: ToUserMessageOptions): string {
  const msg = error instanceof Error ? error.message : String(error ?? '');

  if (PASS_THROUGH.some((p) => p.test(msg))) return msg;

  for (const { pattern, message } of ERROR_MAP) {
    if (pattern.test(msg)) return message;
  }

  if (opts?.context === 'pipeline') return PIPELINE_FALLBACK_MESSAGE;
  return 'Si è verificato un errore imprevisto. Riprova tra qualche istante.';
}
