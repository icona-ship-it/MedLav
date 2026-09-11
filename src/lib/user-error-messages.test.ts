import { describe, it, expect } from 'vitest';
import { toUserMessage } from './user-error-messages';

describe('toUserMessage', () => {
  it('should NEVER turn the benign "no clinical events" note into a scary generic error', () => {
    // Regression — test reale 2026-06-11: 12 atti amministrativi correttamente
    // analizzati venivano mostrati come "errore imprevisto" rossi.
    const msg = toUserMessage('Documento analizzato ma nessun evento strutturato individuato nelle 3 pagine. Il testo OCR è comunque disponibile.');
    expect(msg).toContain('Nessun dato clinico');
    expect(msg).toContain('atti amministrativi');
    expect(msg).not.toContain('errore imprevisto');
  });

  it('should map the unreadable-document note to actionable advice', () => {
    const msg = toUserMessage('Il documento non contiene testo leggibile (0 pagine estratte dall\'OCR). Verificare che il file non sia corrotto o protetto.');
    expect(msg).toContain('non contiene testo leggibile');
    expect(msg).not.toBe('Si è verificato un errore imprevisto. Riprova tra qualche istante.');
  });

  it('should keep mapping known technical patterns', () => {
    expect(toUserMessage('Request failed with status 429 Too many requests')).toContain('Troppe richieste');
    expect(toUserMessage('fetch failed: ECONNREFUSED')).toContain('connessione');
  });

  it('should fall back to the generic message for unknown technical errors', () => {
    expect(toUserMessage('TypeError: x is undefined')).toBe('Si è verificato un errore imprevisto. Riprova tra qualche istante.');
  });
});

describe('toUserMessage — upload oltre limite (bug Motta 2026-07-06)', () => {
  it('mappa "Payload too large" di Supabase su un messaggio actionable, non generico', () => {
    const m = toUserMessage('Payload too large');
    expect(m).toContain('troppo grande');
    expect(m).not.toContain('imprevisto');
  });

  it('mappa "The object exceeded the maximum allowed size"', () => {
    expect(toUserMessage('The object exceeded the maximum allowed size')).toContain('troppo grande');
  });

  it('mappa un 413', () => {
    expect(toUserMessage('Request failed with status 413')).toContain('troppo grande');
  });

  it('continua a mappare i messaggi con la parola "file"', () => {
    expect(toUserMessage('file too large')).toContain('troppo grande');
  });
});

describe('toUserMessage — messaggi reali della pipeline (audit 2026-09-10, R7)', () => {
  it('should map the Italian OCR failures to the file advice, not to the generic fallback', () => {
    expect(toUserMessage('Tutti i documenti hanno fallito l\'OCR. Verifica che i file siano leggibili.')).toContain('rimuovi quelli illeggibili');
    expect(toUserMessage('OCR fallito su 3/4 documenti (>50%) — elaborazione interrotta')).toContain('rimuovi quelli illeggibili');
  });

  it('should not read «limite 5000 pagine» as an HTTP 500', () => {
    const m = toUserMessage('[INPUT_TOO_LARGE] Caso troppo grande: 6100 pagine totali (limite 5000). Suddividi la documentazione in più casi e riprova.');
    expect(m).toContain('5000 pagine');
    expect(m).not.toContain('contatta il supporto');
    expect(toUserMessage('LLM truncation detected after 50000 chars', { context: 'pipeline' })).not.toContain('contatta il supporto');
  });

  it('should pass through messages already written for the user by the pipeline', () => {
    const monitor = 'L\'elaborazione si è interrotta durante la fase "elaborazione" dopo 75 minuti senza avanzamento. I crediti ti sono stati rimborsati: puoi riavviarla dalla pagina del caso.';
    expect(toUserMessage(monitor)).toBe(monitor);
  });

  it('should blame the AI service, not the file, when extraction produced nothing after a successful OCR', () => {
    expect(toUserMessage('Estrazione fallita: 0 eventi da 4 documenti (2/2 batch falliti)')).toContain('non dei tuoi file');
    expect(toUserMessage('JSON LLM irrecuperabile')).toContain('servizio AI');
  });

  it('should not tell the doctor to log in again when the AI service key is rejected', () => {
    expect(toUserMessage('Mistral API error 401: Unauthorized')).not.toContain('login');
    expect(toUserMessage('Unauthorized access to case')).toBe('Non hai accesso a questo caso.');
    expect(toUserMessage('Non autenticato')).toContain('login');
  });

  it('should explain the per-document «Pipeline fallita» / timeout state instead of «errore imprevisto»', () => {
    expect(toUserMessage('Pipeline fallita')).toContain('passo Elaborazione');
    expect(toUserMessage('Elaborazione interrotta (timeout)')).toContain('passo Elaborazione');
  });

  it('should use the pipeline fallback only with the pipeline context', () => {
    expect(toUserMessage('boom', { context: 'pipeline' })).toContain('Riavvia l\'elaborazione dal passo Elaborazione');
    expect(toUserMessage('boom')).toContain('Riprova tra qualche istante');
  });
});
