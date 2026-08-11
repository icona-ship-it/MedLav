/**
 * INVARIANTI di sicurezza dello snapper (reperti audit 2026-08-11 B-1/B-2).
 *
 * Lo snapping può correggere refusi a livello di carattere e riflusso degli
 * a-capo, ma NON deve MAI cambiare in silenzio un token portante: un numero/data,
 * una negazione, una lateralità (dx/sx) o la polarità di una parola (composta →
 * scomposta). Se lo span più simile non conserva questi token esatti, la
 * citazione deve restare intatta e finire al verificatore (outcome 'unmatched').
 *
 * Questi test nascono da violazioni reali riprodotte in fase di audit e sono
 * l'invariante permanente: qualunque refactor che li rompe reintroduce la classe
 * di bug per cui una perizia poteva riportare "sx" al posto di "dx" o "25 mg" al
 * posto di "2,5 mg" senza alcun segnale al perito.
 */
import { describe, it, expect } from 'vitest';
import { snapQuoteToSource, buildSnapCorpus, loadBearingSignature } from './quote-snapper';

describe('INVARIANTE B-1 — negazioni, lateralità e severità non cambiano in silenzio', () => {
  it('negazione persa: la citazione con "non" non si aggancia a uno span affermativo', () => {
    const corpus = buildSnapCorpus(
      'Al controllo odierno il paziente presenta segni di frattura al polso destro.',
    );
    const res = snapQuoteToSource(
      'Al controllo odierno il paziente NON presenta segni di frattura al polso destro.',
      corpus,
    );
    expect(res.outcome).toBe('unmatched');
  });

  it('lateralità invertita (quasi-gemelli): "distale destro" non si aggancia al passaggio "distale sinistro"', () => {
    const corpus = buildSnapCorpus(
      'Frattura composta del radio distale sinistro trattata con gesso per trenta giorni.',
    );
    const res = snapQuoteToSource(
      'Frattura composta del radio distale destro trattata con gesso per trenta giorni.',
      corpus,
    );
    expect(res.outcome).toBe('unmatched');
  });

  it('severità per prefisso privativo: "composta" non si aggancia a "scomposta"', () => {
    const corpus = buildSnapCorpus(
      'Si apprezza frattura scomposta del terzo medio della clavicola con indicazione chirurgica.',
    );
    const res = snapQuoteToSource(
      'Si apprezza frattura composta del terzo medio della clavicola con indicazione chirurgica.',
      corpus,
    );
    expect(res.outcome).toBe('unmatched');
  });

  it('negazione AGGIUNTA: uno span con "non" non riscrive una citazione affermativa', () => {
    const corpus = buildSnapCorpus(
      'Il referto conclude che non si apprezzano lesioni ossee di natura traumatica in atto oggi.',
    );
    const res = snapQuoteToSource(
      'Il referto conclude che si apprezzano lesioni ossee di natura traumatica in atto oggi.',
      corpus,
    );
    expect(res.outcome).toBe('unmatched');
  });
});

describe('INVARIANTE B-2 — la guardia numeri non collassa i decimali', () => {
  it('dosaggio 2,5 mg non si aggancia a 25 mg', () => {
    const corpus = buildSnapCorpus(
      'Terapia domiciliare con farmaco Alfa 25 mg una volta al giorno secondo schema allegato.',
    );
    const res = snapQuoteToSource(
      'Terapia domiciliare con farmaco Alfa 2,5 mg una volta al giorno secondo schema allegato.',
      corpus,
    );
    expect(res.outcome).toBe('unmatched');
  });

  it('importo 1.000 non si aggancia a 10,00', () => {
    const corpus = buildSnapCorpus(
      'La spesa complessiva documentata ammonta a 10,00 euro come da ricevuta allegata al fascicolo.',
    );
    const res = snapQuoteToSource(
      'La spesa complessiva documentata ammonta a 1.000 euro come da ricevuta allegata al fascicolo.',
      corpus,
    );
    expect(res.outcome).toBe('unmatched');
  });

  it('lo stesso decimale (2,5 ≡ 2.5, refuso separatore OCR) NON blocca l\'aggancio', () => {
    const corpus = buildSnapCorpus(
      'Terapia domiciliare con farmaco Alfa 2.5 mg una volta al giorno secondo lo schema allegato.',
    );
    const res = snapQuoteToSource(
      'Terapia domiciliare con farmaco Alfa 2,5 mg una volta al giorno secondo lo schema allegato.',
      corpus,
    );
    expect(res.outcome).toBe('snapped');
    expect(res.sourceText).toContain('2.5 mg');
  });
});

describe('INVARIANTE — i refusi char-level legittimi si agganciano ancora (nessun over-block)', () => {
  it('refuso di una lettera si corregge quando numeri/negazioni/lateralità combaciano', () => {
    const corpus = buildSnapCorpus(
      'Diagnosi conclusiva di frattura composta del terzo distale del radio destro senza complicanze.',
    );
    const res = snapQuoteToSource(
      'Diagnosi conclusiva di frattura conposta del terzo distale del radio destro senza complicanze.',
      corpus,
    );
    expect(res.outcome).toBe('snapped');
    expect(res.sourceText).toContain('composta');
  });
});

describe('INVARIANTE (fuzz seed fisso) — nessuno snap altera i token portanti', () => {
  it('su 400 casi generati, ogni snap conserva ESATTI numeri/negazioni/lateralità della citazione', () => {
    // LCG deterministico (seed fisso): riproducibile, nessuna dipendenza da Math.random.
    let seed = 20260811;
    const rnd = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };
    const pick = <T,>(arr: T[]): T => arr[Math.floor(rnd() * arr.length)];

    const fillers = [
      'il paziente giunge in osservazione clinica per un',
      'si documenta a carico del segmento anatomico esaminato un',
      'al controllo clinico ambulatoriale odierno si rileva un',
      'la relazione specialistica conclusiva depone per un',
    ];
    const bodies = [
      'quadro di sofferenza del terzo distale del radio trattato',
      'processo capsulo legamentoso con edema dei tessuti molli monitorato',
      'esito contusivo con limitazione funzionale complessivamente osservato',
    ];
    const lateral = ['destro', 'sinistro', 'bilaterale'];
    const negations = ['', 'non ', 'senza '];
    const numbers = ['15', '2,5', '1.000', '30', '10,00', '7'];

    // Inietta un refuso char-level in una parola lunga → forza il percorso di
    // snap (la citazione non è più identica alla fonte) senza toccare i token
    // portanti. "complessivamente" è presente in ogni frase.
    const refuso = (s: string): string => s.replace('complessivamente', 'conplessivamente');

    let attempted = 0;
    let snapped = 0;
    for (let i = 0; i < 400; i++) {
      const filler = pick(fillers);
      const body = pick(bodies);
      const tail = (neg: string, num: string, lat: string): string =>
        `${filler} ${neg}${body} e complessivamente valutato in ${num} giorni al lato ${lat}.`;
      const neg = pick(negations);
      const num = pick(numbers);
      const lat = pick(lateral);
      const srcSentence = tail(neg, num, lat);
      // La citazione: stessi token portanti (→ snap che deve riuscire), ma con
      // ~15% di probabilità per token una MUTAZIONE (→ deve restare unmatched).
      // Più un refuso char-level per forzare lo snap invece dell'exact.
      const mNeg = rnd() < 0.15 ? pick(negations) : neg;
      const mNum = rnd() < 0.15 ? pick(numbers) : num;
      const mLat = rnd() < 0.15 ? pick(lateral) : lat;
      const qSentence = refuso(tail(mNeg, mNum, mLat));
      const corpus = buildSnapCorpus(srcSentence);
      const res = snapQuoteToSource(qSentence, corpus);
      attempted++;
      if (res.outcome === 'snapped' && res.sourceText) {
        snapped++;
        // L'INVARIANTE: i token portanti del testo agganciato devono essere
        // identici a quelli della citazione. Se lo snap avesse cambiato un
        // numero/negazione/lateralità, qui le firme divergerebbero.
        expect(loadBearingSignature(res.sourceText)).toEqual(loadBearingSignature(qSentence));
      }
    }
    // Sanity: il fuzz deve aver ESERCITATO davvero lo snap (altrimenti non prova nulla).
    expect(attempted).toBe(400);
    expect(snapped).toBeGreaterThan(20);
  });
});
