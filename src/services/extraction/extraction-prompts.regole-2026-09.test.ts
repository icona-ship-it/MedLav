import { describe, it, expect } from 'vitest';
import { buildExtractionSystemPrompt, getDocumentTypeHint } from './extraction-prompts';

describe('prompt di estrazione — regole del 2026-09 (PS un evento, certificato datato all\'emissione)', () => {
  it('il prompt di sistema chiede un solo evento per accesso in PS, esami separati, OBI = visita', () => {
    const p = buildExtractionSystemPrompt('generica');
    expect(p).toContain('Un accesso in PS = UN SOLO evento');
    expect(p).toContain('restano eventi "esame" separati');
    expect(p).toMatch(/OBI è ancora PS/);
    expect(p).toContain('"title": "Accesso in Pronto Soccorso per trauma ginocchio destro post caduta"');
  });
  it('le istruzioni per il certificato datano all\'emissione e tengono la prognosi nella description', () => {
    const cert = getDocumentTypeHint('certificato');
    expect(cert).toContain('DATA DI EMISSIONE');
    expect(cert).toContain('MAI un evento separato per la prognosi');
  });
});
