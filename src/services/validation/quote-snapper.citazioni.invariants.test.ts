import { describe, it, expect } from 'vitest';
import { snapQuoteToSource, buildSnapCorpus } from './quote-snapper';
import { concatOcrText } from './doc-sanitaria-quote-check';
import { verifyGeneratedQuotes } from './generated-quote-verifier';

/**
 * Invarianti CITAZIONI (audit 2026-09-10, I2) — classi non coperte da
 * quote-snapper.invariants.test.ts: lateralità abbreviata a 1-3 lettere,
 * numerali in lettere corti, citazione «ponte» fra due documenti.
 * Dati interamente fittizi.
 */
describe('lateralità abbreviata e numerali in lettere non cambiano in silenzio', () => {
  it('"ginocchio S" non si aggancia a "ginocchio D"; "arto sup. sin." non a "arto sup. dex."', () => {
    const cases: Array<[string, string]> = [
      [
        'Al controllo odierno si apprezza modesto versamento articolare del ginocchio D con dolore alla digitopressione.',
        'Al controllo odierno si apprezza modesto versamento articolare del ginocchio S con dolore alla digitopressione.',
      ],
      [
        'Esame obiettivo: limitazione funzionale antalgica dell\'arto sup. dex. con ipotrofia muscolare del cingolo scapolare.',
        'Esame obiettivo: limitazione funzionale antalgica dell\'arto sup. sin. con ipotrofia muscolare del cingolo scapolare.',
      ],
    ];
    const outcomes = cases.map(([src, quote]) => snapQuoteToSource(quote, buildSnapCorpus(src)).outcome);
    expect(outcomes).toEqual(['unmatched', 'unmatched']);
  });

  it('"due proiezioni" non si aggancia a "tre proiezioni"; "tre frammenti" non a "sei frammenti"', () => {
    const cases: Array<[string, string]> = [
      [
        'Radiografia del polso destro eseguita in tre proiezioni documenta frattura composta del radio distale senza scomposizione.',
        'Radiografia del polso destro eseguita in due proiezioni documenta frattura composta del radio distale senza scomposizione.',
      ],
      [
        'La tomografia conferma frattura pluriframmentaria della testa radiale con sei frammenti ossei principali dislocati.',
        'La tomografia conferma frattura pluriframmentaria della testa radiale con tre frammenti ossei principali dislocati.',
      ],
    ];
    const outcomes = cases.map(([src, quote]) => snapQuoteToSource(quote, buildSnapCorpus(src)).outcome);
    expect(outcomes).toEqual(['unmatched', 'unmatched']);
  });

  it('un refuso vero nella stessa frase si aggancia ancora (nessun blocco spurio)', () => {
    const src = 'Radiografia del polso destro eseguita in due proiezioni documenta frattura composta del radio distale senza scomposizione.';
    const quote = 'Radiografia del polso destro eseguita in due proiezioni documenta fratura composta del radio distale senza scomposizione.';
    expect(snapQuoteToSource(quote, buildSnapCorpus(src)).outcome).toBe('snapped');
  });
});

const DOC_A = [
  'Riferisce caduta accidentale in bicicletta con trauma diretto del polso destro avvenuta il 12.05.2025 in via degli Esempi.',
  'Polso destro tumefatto e dolente alla palpazione della tabacchiera anatomica, non deficit neurovascolari periferici.',
  'Prognosi di giorni 30 salvo complicazioni, con rivalutazione ortopedica programmata il 30.06.2025.',
];
const DOC_B = [
  'Ricoverata presso Ospedale Civile di Cittàdemo dal 16.07.2025 al 25.07.2025 per frattura scomposta del femore sinistro.',
  'Intervento di osteosintesi con chiodo endomidollare eseguito in data 17.07.2025 senza complicanze intraoperatorie.',
];
const docs = [
  { documentId: 'a', fileName: 'a.pdf', documentType: 'referto_specialistico', pages: DOC_A.map((t, i) => ({ pageNumber: i + 1, ocrText: t })) },
  { documentId: 'b', fileName: 'b.pdf', documentType: 'lettera_dimissione', pages: DOC_B.map((t, i) => ({ pageNumber: i + 1, ocrText: t })) },
] as never;

describe('una citazione non può essere un ponte fra due documenti del corpus concatenato', () => {
  it('coda del documento A + testa del documento B → mai exact/snapped, e il verificatore non la conferma', () => {
    const corpusText = concatOcrText(docs);
    const tailA = DOC_A[DOC_A.length - 1]!.split(' ').slice(-6).join(' ');
    const headB = DOC_B[0]!.split(' ').slice(0, 6).join(' ');
    const bridge = `${tailA} ${headB}`;
    expect(snapQuoteToSource(bridge, buildSnapCorpus(corpusText)).outcome).toBe('unmatched');
    const verified = verifyGeneratedQuotes(`Il referto riporta: «${bridge}»`, corpusText);
    expect(verified.verifications.some((v) => v.grounded)).toBe(false);
  });

  it('una citazione interna a un documento resta exact anche col marcatore fra i documenti', () => {
    const corpusText = concatOcrText(docs);
    expect(snapQuoteToSource(DOC_B[1]!, buildSnapCorpus(corpusText)).outcome).toBe('exact');
    expect(corpusText).toContain('⟦DOC⟧');
  });
});
