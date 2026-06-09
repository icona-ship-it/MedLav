import { describe, it, expect } from 'vitest';
import { verifyGeneratedQuotes } from './generated-quote-verifier';

const OCR = `REFERTO ORTOPEDICO — 12.03.2024
Si riscontra frattura composta del radio distale destro con interessamento
articolare. Si consiglia immobilizzazione in gesso per 30 giorni.
Diagnosi: trauma contusivo-distorsivo del rachide cervicale.`;

describe('verifyGeneratedQuotes', () => {
  it('should leave a verbatim-present quote untouched and count it grounded', () => {
    const md = 'Il referto descrive una «frattura composta del radio distale destro».';
    const res = verifyGeneratedQuotes(md, OCR);

    expect(res.total).toBe(1);
    expect(res.groundedCount).toBe(1);
    expect(res.ungroundedCount).toBe(0);
    expect(res.annotatedMarkdown).toBe(md);
  });

  it('should flag a fabricated quote with a visible non-blocking marker', () => {
    const md = 'Il medico annota «lesione del legamento crociato anteriore sinistro».';
    const res = verifyGeneratedQuotes(md, OCR);

    expect(res.total).toBe(1);
    expect(res.groundedCount).toBe(0);
    expect(res.ungroundedCount).toBe(1);
    expect(res.annotatedMarkdown).toContain('da verificare sul documento originale');
    // The original quote text is preserved (never silently deleted — mai perdere un fatto)
    expect(res.annotatedMarkdown).toContain('lesione del legamento crociato anteriore sinistro');
  });

  it('should ground a quote that differs only in whitespace/case (normalized match)', () => {
    const md = 'Diagnosi: «TRAUMA CONTUSIVO-DISTORSIVO   del rachide cervicale».';
    const res = verifyGeneratedQuotes(md, OCR);

    expect(res.groundedCount).toBe(1);
    expect(res.ungroundedCount).toBe(0);
  });

  it('should handle multiple quotes, flagging only the ungrounded ones', () => {
    const md =
      'Reperti: «frattura composta del radio distale destro» e «emorragia cerebrale acuta».';
    const res = verifyGeneratedQuotes(md, OCR);

    expect(res.total).toBe(2);
    expect(res.groundedCount).toBe(1);
    expect(res.ungroundedCount).toBe(1);
    // Only one marker, attached after the fabricated quote
    expect(res.annotatedMarkdown.match(/da verificare/g)?.length).toBe(1);
  });

  it('should return markdown unchanged when there are no guillemet quotes', () => {
    const md = 'Nessuna citazione verbatim qui, solo parafrasi del referto.';
    const res = verifyGeneratedQuotes(md, OCR);

    expect(res.total).toBe(0);
    expect(res.annotatedMarkdown).toBe(md);
  });

  it('should not flag very short fragments (below the meaningful-citation floor)', () => {
    const md = 'Lato «dx» non riscontrato.';
    const res = verifyGeneratedQuotes(md, OCR);

    expect(res.total).toBe(0);
    expect(res.ungroundedCount).toBe(0);
    expect(res.annotatedMarkdown).toBe(md);
  });

  it('should be idempotent — already-annotated quotes are not flagged twice', () => {
    const md = 'Il medico annota «lesione del legamento crociato anteriore sinistro».';
    const once = verifyGeneratedQuotes(md, OCR).annotatedMarkdown;
    const twice = verifyGeneratedQuotes(once, OCR).annotatedMarkdown;

    expect(twice).toBe(once);
    expect(twice.match(/da verificare/g)?.length).toBe(1);
  });

  it('should handle empty OCR by flagging every meaningful quote', () => {
    const md = 'Reperto: «frattura composta del radio distale destro».';
    const res = verifyGeneratedQuotes(md, '');

    expect(res.total).toBe(1);
    expect(res.ungroundedCount).toBe(1);
  });
});
