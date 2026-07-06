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
