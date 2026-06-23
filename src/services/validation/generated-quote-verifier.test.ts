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

  it('should GROUND a faithful quote even when the OCR wraps terms in markdown (Mistral OCR returns markdown)', () => {
    // Mistral OCR emits markdown: emphasis around clinical terms is common.
    const ocrMd = 'Diagnosi: frattura **composta** del *radio distale* destro.';
    const md = 'Il referto riporta «frattura composta del radio distale destro».';
    const res = verifyGeneratedQuotes(md, ocrMd);

    expect(res.groundedCount).toBe(1);
    expect(res.ungroundedCount).toBe(0);
    expect(res.annotatedMarkdown).toBe(md); // no spurious "da verificare"
  });

  it('should FLAG a single-token clinical flip that LCS≥0.80 would falsely ground', () => {
    // composta → scomposta: opposite clinical meaning, but only 1 of 6 words
    // differs → LCS ratio ~0.83 would pass the lenient grounding. The strict
    // verbatim check must NOT treat a near-match as clean.
    const md = 'Il referto descrive una «frattura scomposta del radio distale destro».';
    const res = verifyGeneratedQuotes(md, OCR);

    expect(res.groundedCount).toBe(0);
    expect(res.ungroundedCount).toBe(1);
    expect(res.annotatedMarkdown).toContain('da verificare');
  });

  it('should FLAG a number/prognosi flip (30 → 60 giorni)', () => {
    const md = 'Si consiglia «immobilizzazione in gesso per 60 giorni».';
    const res = verifyGeneratedQuotes(md, OCR);

    expect(res.groundedCount).toBe(0);
    expect(res.ungroundedCount).toBe(1);
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

  it('should add a section note when a FABRICATED quote uses straight/curly delimiters', () => {
    // Not present in the OCR → a fabricated citation that escaped the «...» check.
    const md = 'Il medico annota "lesione del legamento crociato anteriore sinistro" senza caporali.';
    const res = verifyGeneratedQuotes(md, OCR);

    expect(res.nonGuillemetQuotesDetected).toBe(true);
    expect(res.annotatedMarkdown).toContain('non racchiuse tra «...»');
    // The note is appended once, even with multiple stray quotes.
    const md2 = '"prima citazione lunga inventata fuori formato" e "seconda citazione lunga inventata".';
    expect(
      verifyGeneratedQuotes(md2, OCR).annotatedMarkdown.match(/non racchiuse tra/g)?.length,
    ).toBe(1);
  });

  it('should NOT flag a FAITHFUL straight-quoted span (present in OCR → harmless mis-delimiter)', () => {
    const md = 'Il referto riporta "frattura composta del radio distale destro" senza caporali.';
    const res = verifyGeneratedQuotes(md, OCR);
    expect(res.nonGuillemetQuotesDetected).toBe(false);
  });

  it('should NOT flag guillemet quotes as non-format', () => {
    const md = 'Diagnosi «frattura composta del radio distale destro» confermata.';
    const res = verifyGeneratedQuotes(md, OCR);
    expect(res.nonGuillemetQuotesDetected).toBe(false);
  });

  it('should handle empty OCR by flagging every meaningful quote', () => {
    const md = 'Reperto: «frattura composta del radio distale destro».';
    const res = verifyGeneratedQuotes(md, '');

    expect(res.total).toBe(1);
    expect(res.ungroundedCount).toBe(1);
  });
});

describe('verifyGeneratedQuotes — annotateStraightQuotes (sezioni verbatim atti/pareri)', () => {
  it('NON tocca una citazione "..." FEDELE (presente nell\'OCR)', () => {
    const md = 'Il parere riporta "frattura composta del radio distale destro" come da originale.';
    const res = verifyGeneratedQuotes(md, OCR, { annotateStraightQuotes: true });
    expect(res.total).toBe(1);
    expect(res.groundedCount).toBe(1);
    expect(res.ungroundedCount).toBe(0);
    expect(res.annotatedMarkdown).toBe(md);
  });

  it('FLAGGA inline una citazione "..." ALTERATA (composta -> scomposta)', () => {
    const md = 'Il CTP conclude "frattura scomposta del radio distale destro".';
    const res = verifyGeneratedQuotes(md, OCR, { annotateStraightQuotes: true });
    expect(res.ungroundedCount).toBe(1);
    expect(res.annotatedMarkdown).toContain('da verificare sul documento originale');
    // testo originale preservato (mai perdere un fatto)
    expect(res.annotatedMarkdown).toContain('frattura scomposta del radio distale destro');
  });

  it('FLAGGA inline una citazione "..." FABBRICATA (assente dall\'OCR)', () => {
    const md = 'Il parere afferma "invalidita permanente del venticinque per cento complessivo".';
    const res = verifyGeneratedQuotes(md, OCR, { annotateStraightQuotes: true });
    expect(res.ungroundedCount).toBe(1);
    expect(res.annotatedMarkdown).toContain('da verificare');
  });

  it('FLAGGA anche le virgolette CURVE "..." se ungrounded', () => {
    const md = 'Il parere afferma “lesione del legamento crociato anteriore sinistro grave”.';
    const res = verifyGeneratedQuotes(md, OCR, { annotateStraightQuotes: true });
    expect(res.ungroundedCount).toBe(1);
    expect(res.annotatedMarkdown).toContain('da verificare');
  });

  it('NON esamina una "..." molto breve sotto la soglia (termini/abbreviazioni)', () => {
    const md = 'Referto con esito "negativo" al controllo.'; // "negativo" = 8 char < 12
    const res = verifyGeneratedQuotes(md, OCR, { annotateStraightQuotes: true });
    expect(res.total).toBe(0);
    expect(res.annotatedMarkdown).toBe(md);
  });

  it('CATTURA una "..." corta-ma-decisiva fabbricata (prognosi/percentuale, 12-19 char)', () => {
    const md = 'Il fiduciario indica "prognosi 90 giorni" non riscontrata in atti.';
    const res = verifyGeneratedQuotes(md, OCR, { annotateStraightQuotes: true });
    expect(res.ungroundedCount).toBe(1);
    expect(res.annotatedMarkdown).toContain('da verificare');
  });

  it('REGRESSIONE: senza opts una "..." alterata NON viene annotata inline (default invariato)', () => {
    const md = 'Il CTP conclude "frattura scomposta del radio distale destro".';
    const res = verifyGeneratedQuotes(md, OCR); // default: no annotateStraightQuotes
    expect(res.total).toBe(0); // nessuna «...» → nessuna verifica inline
    expect(res.annotatedMarkdown).not.toContain('da verificare sul documento originale');
  });
});
