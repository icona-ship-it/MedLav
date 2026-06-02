import { describe, it, expect } from 'vitest';
import { scoreReport, jaccardSimilarity, tokenize, sectionCoverage } from './eval-scoring';

describe('eval-scoring', () => {
  it('testo identico → similarità 1 e verdict match', () => {
    const text = '## Intestazione\nTribunale di Verona. Diagnosi: frattura. Invalidità temporanea 90 giorni.';
    const s = scoreReport(text, text);
    expect(s.similarity).toBe(1);
    expect(s.verdict).toBe('match');
    expect(s.wordDeltaPct).toBe(0);
  });

  it('testi molto diversi → similarità bassa, verdict divergent', () => {
    const gold = 'Diagnosi frattura femore nesso causale invalidità permanente esiti ricovero intervento.';
    const gen = 'Lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor.';
    const s = scoreReport(gold, gen);
    expect(s.similarity).toBeLessThan(0.2);
    expect(s.verdict).toBe('divergent');
  });

  it('jaccard è 1 su insiemi uguali, 0 su disgiunti', () => {
    expect(jaccardSimilarity(tokenize('alfa beta gamma'), tokenize('alfa beta gamma'))).toBe(1);
    expect(jaccardSimilarity(tokenize('alfa beta'), tokenize('delta epsilon'))).toBe(0);
  });

  it('section coverage riconosce gli heading ## e i titoli MAIUSCOLI del benchmark', () => {
    const gold = '# TRIBUNALE ORDINARIO DI BOLZANO\n## Quesiti\nI DATI DELLA DOCUMENTAZIONE SANITARIA IN ATTI\ntesto';
    const gen = '## Intestazione\n# TRIBUNALE ORDINARIO DI BOLZANO\n## Quesiti\nI DATI DELLA DOCUMENTAZIONE SANITARIA IN ATTI\naltro';
    const cov = sectionCoverage(gold, gen);
    expect(cov.goldSections).toBeGreaterThanOrEqual(3);
    expect(cov.matchedInGenerated).toBe(cov.goldSections); // tutte presenti nel generato
    expect(cov.missing).toHaveLength(0);
  });

  it('keyword coverage segnala i termini di dominio mancanti nel generato', () => {
    const gold = 'anamnesi diagnosi terapia prognosi nesso causale invalidità';
    const gen = 'anamnesi diagnosi';
    const s = scoreReport(gold, gen);
    expect(s.keyword.presentInGold).toBeGreaterThan(s.keyword.presentInGenerated);
    expect(s.keyword.missingFromGenerated.length).toBeGreaterThan(0);
  });
});
