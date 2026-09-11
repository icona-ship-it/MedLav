import { describe, it, expect } from 'vitest';
import { composePipelineFailureUserMessage, composeRegenerationFailureUserMessage, refundSentence } from './pipeline-failure-message';

describe('composePipelineFailureUserMessage — causa in italiano + esito del rimborso', () => {
  it('should append the refund outcome to a mapped cause', () => {
    const m = composePipelineFailureUserMessage('Estrazione fallita: 0 eventi da 4 documenti (2/2 batch falliti)', 'refunded', 30);
    expect(m).toContain('errore del servizio AI');
    expect(m).toContain('I 30 crediti dell\'elaborazione ti sono stati rimborsati.');
    expect(m).not.toContain('errore imprevisto');
  });

  it('should use the pipeline fallback (never «riprova tra qualche istante») for unknown errors', () => {
    const m = composePipelineFailureUserMessage('LLM truncation detected after 50000 chars', 'refunded', 30);
    expect(m).toContain('Riavvia l\'elaborazione dal passo Elaborazione');
    expect(m).not.toContain('imprevisto');
    expect(m).not.toContain('contatta il supporto');
  });

  it('should say the OCR cost is not refunded on oversized input', () => {
    const m = composePipelineFailureUserMessage('[INPUT_TOO_LARGE] Caso troppo grande: 6100 pagine totali (limite 5000)', 'not_refundable');
    expect(m).toContain('5000 pagine');
    expect(m).toContain('non vengono rimborsati');
    expect(m).not.toContain('errore del servizio');
  });

  it('should not repeat the refund when the message already states it (stuck-case monitor)', () => {
    const monitor = 'L\'elaborazione si è interrotta durante la fase "elaborazione" dopo 75 minuti senza avanzamento. I crediti ti sono stati rimborsati: puoi riavviarla dalla pagina del caso.';
    const m = composePipelineFailureUserMessage(monitor, 'refunded', 30);
    expect(m).toBe(monitor);
  });

  it('should tell the doctor when the automatic refund failed', () => {
    expect(refundSentence('failed')).toContain('scrivici');
    expect(refundSentence('none')).toBe('');
    expect(refundSentence('already_refunded')).toContain('già');
  });
});

describe('composeRegenerationFailureUserMessage — mai testo tecnico grezzo nel passo Perizia', () => {
  it('should translate a circuit-breaker error and state that the previous report is untouched', () => {
    const m = composeRegenerationFailureUserMessage('[circuit-breaker] Circuit OPEN — Mistral API appears down. 5 consecutive failures. Retry in 45s.');
    expect(m).toMatch(/^Rigenerazione non riuscita: /);
    expect(m).toContain('temporaneamente non disponibile');
    expect(m).toContain('report precedente è invariato');
    expect(m).not.toContain('Circuit OPEN');
  });
});
