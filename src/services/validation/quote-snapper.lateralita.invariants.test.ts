import { describe, it, expect } from 'vitest';
import { snapQuoteToSource, buildSnapCorpus, snapDocSanitariaQuotes } from './quote-snapper';

/**
 * INVARIANTI LATERALITÀ — snapper delle citazioni (audit 2026-09-10).
 *
 * Lo snapper RISCRIVE la «…» col testo della fonte: se lo span scelto ha il
 * lato opposto a quello citato, la perizia cambia lato in silenzio. Gli
 * invarianti esistenti (quote-snapper.invariants.test.ts) coprono
 * destro/sinistro/bilaterale; qui le SIGLE (dx, sx, sn, ds, DX/SX con
 * punteggiatura), le abbreviazioni latine (dex/sin — 14 "sin" nel gold C)
 * e le lettere singole (D/S) usate nei referti. Percorso reale:
 * section-generator / section-regenerator → snapDocSanitariaQuotes.
 */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const pick = <T,>(r: () => number, a: readonly T[]): T => a[Math.floor(r() * a.length)]!;

const SIDE_MAP: Record<string, 'dx' | 'sx' | 'bil'> = {
  dx: 'dx', ds: 'dx', dex: 'dx', d: 'dx', destro: 'dx', destra: 'dx',
  sx: 'sx', sn: 'sx', sin: 'sx', s: 'sx', sinistro: 'sx', sinistra: 'sx',
  bilaterale: 'bil',
};
function sideSequence(text: string): string[] {
  return text.split(/\s+/).map((w) => w.toLowerCase().replace(/[.,;:()«»"'\-]/g, '')).map((w) => SIDE_MAP[w]).filter((s): s is 'dx' | 'sx' | 'bil' => !!s);
}

const FILLER = 'Al controllo clinico odierno si rileva tumefazione dolente del';
const TAIL = 'con limitazione funzionale marcata e dolore alla pressione.';

describe('sigle di lateralità: mai uno snap che cambia lato', () => {
  it('dx↔sx, sn↔dx, ds↔sx, DX↔SX con punteggiatura: la citazione col lato opposto resta unmatched', () => {
    const pairs: Array<[string, string]> = [['dx', 'sx'], ['sn', 'dx'], ['ds', 'sx'], ['DX', 'SX'], ['(dx),', '(sx),'], ['dx.', 'sx.']];
    for (const [q, s] of pairs) {
      const corpus = buildSnapCorpus(`${FILLER} polso ${s} ${TAIL}`);
      const res = snapQuoteToSource(`${FILLER} polso ${q} ${TAIL}`, corpus);
      expect(res.outcome, `${q} vs ${s}`).toBe('unmatched');
    }
  });

  it('sigla contro parola intera di lato opposto (dx vs sinistro, sn vs destra): mai snap', () => {
    for (const [q, s] of [['dx', 'sinistro'], ['sn', 'destra'], ['sx', 'destro']] as const) {
      const corpus = buildSnapCorpus(`${FILLER} polso ${s} ${TAIL}`);
      expect(snapQuoteToSource(`${FILLER} polso ${q} ${TAIL}`, corpus).outcome, `${q} vs ${s}`).toBe('unmatched');
    }
  });

  // Classe coperta (audit 2026-09-10): "dex"/"sin" (abbreviazioni latine, presenti nei gold) non sono token portanti → snap che inverte il lato
  it('abbreviazioni latine dex↔sin: la citazione "polso dex" non si aggancia al passaggio "polso sin"', () => {
    const corpus = buildSnapCorpus(`${FILLER} polso sin ${TAIL}`);
    const res = snapQuoteToSource(`${FILLER} polso dex ${TAIL}`, corpus);
    expect(res.outcome).toBe('unmatched');
    const corpus2 = buildSnapCorpus(`${FILLER} ginocchio dex ${TAIL}`);
    expect(snapQuoteToSource(`${FILLER} ginocchio sin ${TAIL}`, corpus2).outcome).toBe('unmatched');
  });

  // Classe coperta (audit 2026-09-10): lettere singole D/S non sono token portanti → snap che inverte il lato
  it('lettere singole D↔S ("ginocchio D" vs "ginocchio S"): mai snap', () => {
    const corpus = buildSnapCorpus(`${FILLER} ginocchio S ${TAIL}`);
    expect(snapQuoteToSource(`${FILLER} ginocchio D ${TAIL}`, corpus).outcome).toBe('unmatched');
  });
});

describe('fuzz (seme fisso): ogni snap conserva la SEQUENZA dei lati della citazione', () => {
  const BODIES = ['quadro di sofferenza del comparto', 'processo capsulo legamentoso del', 'esito contusivo con versamento del', 'lesione parziale del legamento collaterale del'];
  const DISTRICTS = ['polso', 'ginocchio', 'gomito', 'caviglia', 'spalla'];
  const refuso = (s: string): string => s.replace('limitazione', 'limitazoine');

  function runFuzz(family: readonly string[], seed: number): { snapped: number; flipped: string[] } {
    const r = mulberry32(seed);
    let snapped = 0; const flipped: string[] = [];
    for (let i = 0; i < 500; i++) {
      const body = pick(r, BODIES); const d = pick(r, DISTRICTS);
      const srcSide = pick(r, family); const qSide = r() < 0.5 ? srcSide : pick(r, family);
      const mk = (side: string): string => `${FILLER} ${body} ${d} ${side} ${TAIL}`;
      const res = snapQuoteToSource(refuso(mk(qSide)), buildSnapCorpus(mk(srcSide)));
      if (res.outcome === 'snapped' && res.sourceText) {
        snapped++;
        const a = sideSequence(mk(qSide)).join(','); const b = sideSequence(res.sourceText).join(',');
        if (a !== b) flipped.push(`«${qSide}» → «${srcSide}»`);
      }
    }
    return { snapped, flipped };
  }

  it('famiglia protetta (dx, sx, sn, ds, destro/a, sinistro/a, bilaterale, maiuscole): nessuno snap cambia lato', () => {
    const { snapped, flipped } = runFuzz(['dx', 'sx', 'sn', 'ds', 'destro', 'sinistro', 'destra', 'sinistra', 'bilaterale', 'DX', 'SX', 'Dx', 'Sx'], 7);
    expect(snapped, 'il fuzz deve esercitare lo snap').toBeGreaterThan(50);
    expect(flipped, `snap con lato invertito: ${[...new Set(flipped)].join('; ')}`).toEqual([]);
  });

  // Classe coperta (audit 2026-09-10): famiglia estesa (dex, sin, D, S) — lo snap inverte il lato
  it('famiglia estesa (dex, sin, D, S): nessuno snap cambia lato', () => {
    const { snapped, flipped } = runFuzz(['dex', 'sin', 'D', 'S', 'dx', 'sx'], 11);
    expect(snapped, 'il fuzz deve esercitare lo snap').toBeGreaterThan(50);
    expect(flipped, `snap con lato invertito: ${[...new Set(flipped)].join('; ')}`).toEqual([]);
  });
});

describe('livello documento (snapDocSanitariaQuotes): due citazioni con lati diversi restano ciascuna col proprio lato', () => {
  it('corpus con entrambi i passaggi (dx e sx): ogni «…» agganciata conserva il lato citato', () => {
    const ocr = [
      'REFERTO RX POLSO DX. Frattura composta del radio distale dx con minima scomposizione dei frammenti ossei.',
      'REFERTO RX POLSO SX. Non si apprezzano lesioni ossee di natura traumatica a carico del polso sx esaminato.',
    ].join('\n');
    const md = [
      'Diagnosi: «Frattura conposta del radio distale dx con minima scomposizione dei frammenti ossei.»',
      'Referto: «Non si aprezzano lesioni ossee di natura traumatica a carico del polso sx esaminato.»',
    ].join('\n');
    const out = snapDocSanitariaQuotes(md, ocr);
    // Lo snap può anche NON avvenire (unmatched → la flagga il verificatore): mai un
    // aggancio che cambi il lato. Su questo corpus a due righe la prima citazione
    // resta prudentemente unmatched (comportamento pre-esistente, non silenzioso).
    expect(out.snappedCount + out.unmatchedCount).toBe(2);
    expect(out.snappedCount).toBeGreaterThanOrEqual(1);
    const quotes = [...out.markdown.matchAll(/«([^»]+)»/g)].map((m) => m[1]!);
    expect(sideSequence(quotes[0]!)).toEqual(['dx']);
    expect(sideSequence(quotes[1]!)).toEqual(['sx']);
    expect(quotes[0]).toMatch(/co[mn]posta/);
    expect(quotes[1]).toMatch(/ap+rezzano/);
  });
});
