import { describe, it, expect } from 'vitest';
import { stallNotice, STALL_INFO_MINUTES, STALL_WARN_MINUTES } from './processing-stall';

describe('stallNotice — pause di estrazione spiegate (CASO-2026-235)', () => {
  it('ritmo normale (< 4 min) → nessun messaggio', () => {
    expect(stallNotice(0).tone).toBe('none');
    expect(stallNotice(STALL_INFO_MINUTES - 1).tone).toBe('none');
  });

  it('pausa 4-14 min → spiegazione calma: è normale, riprende da sola', () => {
    const n = stallNotice(8);
    expect(n.tone).toBe('info');
    expect(n.text).toContain('8 minuti');
    expect(n.text).toContain('riprende da sola');
    expect(n.text?.toLowerCase()).not.toContain('annullare');
  });

  it('pausa ≥ 15 min (i silenzi di 17-19 min del caso reale) → anche la via d\'uscita', () => {
    const n = stallNotice(STALL_WARN_MINUTES + 2);
    expect(n.tone).toBe('warn');
    expect(n.text).toContain('annullare');
    expect(n.text).toContain('rimborsati');
  });
});

describe('stallNotice — fase OCR (0 eventi): l\'avviso esiste anche prima del primo evento', () => {
  it('should word the notice on document reading when no event exists yet', () => {
    const n = stallNotice(5, 'ocr');
    expect(n.tone).toBe('info');
    expect(n.text).toContain('Nessun avanzamento nella lettura dei documenti da 5 minuti');
    expect(stallNotice(16, 'ocr').tone).toBe('warn');
  });

  it('should keep the extraction wording by default', () => {
    expect(stallNotice(5).text).toContain('Nessun nuovo evento da 5 minuti');
  });
});
