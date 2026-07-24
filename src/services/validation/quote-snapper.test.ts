import { describe, it, expect } from 'vitest';
import { snapQuoteToSource, snapDocSanitariaQuotes, buildSnapCorpus } from './quote-snapper';

const OCR = `[PAGE_START:1]
OSPEDALE CIVILE DI CITTADEMO - VERBALE DI PRONTO SOCCORSO
IL PAZIENTE GIUNGE IN PS PER INCIDENTE STRADALE AUTO CONTRO AUTO. RIEFRITO SCOPPIO DEGLI AIRBAG.
INDOSSAVA LA CINTURA DI SICUREZZA. NEGA TRAUMA CRANICO. RIFERISCE TRAUMA CONTUSIVO CAVIGLIA DESTRA.
APR: pregresso intervento per instabilita sindesmosi (placca+ vite) 2022, artroscopia dicaviglia a marzo 2026.
Il paziente riesce a dembulare concedendo carico completo. Si lascia libero.
DIAGNOSI: TRAUMA DISTORSIVO T-T DX
[PAGE_END:1]`;

describe('snapQuoteToSource — il testo lo copia il codice, non il modello', () => {
  const corpus = buildSnapCorpus(OCR);

  it('citazione già identica → exact, nessun cambiamento', () => {
    const res = snapQuoteToSource('DIAGNOSI: TRAUMA DISTORSIVO T-T DX', corpus);
    expect(res.outcome).toBe('exact');
  });

  it('parole RIMESCOLATE sugli a-capo (il caso del collaudo live) → agganciata al testo esatto', () => {
    // Il modello aveva ricomposto male l'ordine: "RIEFRITO SCOPPIO INDOSSAVA LA
    // CINTURA ... TRAUMA CONTUSIVO DEGLI AIRBAG" — parole giuste, ordine sbagliato.
    const res = snapQuoteToSource(
      'IL PAZIENTE GIUNGE IN PS PER INCIDENTE STRADALE AUTO CONTRO AUTO. RIEFRITO SCOPPIO INDOSSAVA LA CINTURA DI SICUREZZA. NEGA TRAUMA CRANICO. RIFERISCE TRAUMA CONTUSIVO DEGLI AIRBAG. CAVIGLIA DESTRA.',
      corpus,
    );
    expect(res.outcome).toBe('snapped');
    expect(res.sourceText).toContain('RIEFRITO SCOPPIO DEGLI AIRBAG.');
    expect(res.sourceText).toContain('RIFERISCE TRAUMA CONTUSIVO CAVIGLIA DESTRA');
  });

  it('refuso INTRODOTTO dal modello («piacca» per «placca», il reperto del caso beta) → corretto alla fonte', () => {
    const res = snapQuoteToSource(
      'APR: pregresso intervento per instabilita sindesmosi (piacca+ vite) 2022, artroscopia di caviglia a marzo 2026.',
      corpus,
    );
    expect(res.outcome).toBe('snapped');
    expect(res.sourceText).toContain('(placca+ vite)');
    expect(res.sourceText).toContain('dicaviglia'); // il refuso VERO del documento resta
  });

  it('citazione fabbricata (assente nella fonte) → unmatched, testo NON toccato', () => {
    const res = snapQuoteToSource(
      'Il paziente veniva sottoposto a risonanza magnetica del ginocchio sinistro con esiti di lesione meniscale.',
      corpus,
    );
    expect(res.outcome).toBe('unmatched');
  });

  it('citazioni corte → skipped (mai agganci azzardati)', () => {
    expect(snapQuoteToSource('T-T DX', corpus).outcome).toBe('skipped');
  });

  it('GUARDIA NUMERI: data/numero diversi dalla fonte → MAI snap silenzioso, resta flaggata', () => {
    // Il fuzzy-match parole considererebbe "2023"≈nessuno ma "artroscopia dicaviglia
    // a marzo 2027" quasi identico a "...marzo 2026": riscrivere la citazione
    // cambierebbe una DATA senza che il perito lo veda. Deve restare unmatched.
    const res = snapQuoteToSource(
      'APR: pregresso intervento per instabilita sindesmosi (placca+ vite) 2022, artroscopia dicaviglia a marzo 2027.',
      corpus,
    );
    expect(res.outcome).toBe('unmatched');
  });

  it('GUARDIA NUMERI: le date UGUALI alla fonte non bloccano l\'aggancio', () => {
    const res = snapQuoteToSource(
      'APR: pregresso intervento per instabilita sindesmosi (piacca+ vite) 2022, artroscopia di caviglia a marzo 2026.',
      corpus,
    );
    expect(res.outcome).toBe('snapped');
  });

  it('GUARDIA DENSITÀ (collaudo live 029 v2): due certificati quasi-gemelli consecutivi → MAI citazione-ponte con dentro firma e intestazione del secondo', () => {
    // Riproduce il difetto trovato dal vivo: certificato 20.04 e certificato
    // definitivo 30.06 iniziano con le stesse parole; lo span faceva ponte
    // inglobando "Dott." + intestazione del secondo documento e finendo a metà
    // frase. Con la guardia di densità lo snap viene rifiutato.
    const dueCertificati = [
      'STUDIO MEDICO DR. DEMPROVA - CERTIFICATO MEDICO',
      'Cittàdemo, 20/04/2026',
      'Il Sig. DEMPROVA CARLO, nato a Cittàdemo il 10.03.1990, via degli Esempi 1, in relazione all\'incidente stradale occorsogli il 18/04/2026 ha riportato trauma distorsico tibio tarsica destra valutato presso PS.',
      'Prognosi giorni s.c. 40 giorni (quaranta) dall\'incidente.',
      'Dott. Nicolò Demprova',
      'STUDIO MEDICO DR. DEMPROVA - CERTIFICATO MEDICO DEFINITIVO',
      'Cittàdemo, 30/06/2026',
      'Il Sig. DEMPROVA CARLO, nato a Cittàdemo il 10.03.1990, via degli Esempi 1, in riferimento all\'infortunio causato dall\'incidente stradale occorsogli il giorno 18/04/2026, ha conseguito guarigione clinica con postumi da valutare.',
    ].join('\n');
    const c = buildSnapCorpus(dueCertificati);
    // Citazione "cucita" dal modello: pezzi del primo E del secondo certificato.
    const cucita = 'Il Sig. DEMPROVA CARLO, nato a Cittàdemo il 10.03.1990, via degli Esempi 1, in relazione all\'incidente stradale occorsogli il 18/04/2026 ha riportato trauma distorsico tibio tarsica destra valutato presso PS. Prognosi giorni s.c. 40 giorni (quaranta) dall\'incidente. Il Sig. DEMPROVA CARLO, nato a Cittàdemo il 10.03.1990, via degli Esempi 1, in riferimento all\'infortunio causato dall\'incidente';
    const res = snapQuoteToSource(cucita, c);
    if (res.outcome === 'snapped') {
      // Se aggancia, il testo NON deve contenere materiale estraneo alla citazione
      expect(res.sourceText).not.toContain('Dott. Nicolò Demprova');
      expect(res.sourceText).not.toContain('CERTIFICATO MEDICO DEFINITIVO');
    } else {
      expect(res.outcome).toBe('unmatched'); // rifiuto esplicito → la flagga il verificatore
    }
  });

  it('GUARDIA HEADING: i "#" markdown dell\'OCR non entrano MAI nel testo agganciato (varco GDPR parser sezioni)', () => {
    const ocrConHeading = [
      'Testo introduttivo del referto radiologico eseguito in urgenza.',
      '## REFERTO CONCLUSIVO DELLO SPECIALISTA',
      'Non si apprezzano lesioni ossee di natura traumatica in atto sui segmenti scheletrici esaminati oggi.',
    ].join('\n');
    const c = buildSnapCorpus(ocrConHeading);
    const res = snapQuoteToSource(
      'REFERTO CONCLUSIVO SPECIALISTA DELLO Non si apprezzano lesioni ossee di natura traumatica in atto sui segmenti scheletrici esaminati oggi.',
      c,
    );
    expect(res.outcome).toBe('snapped');
    expect(res.sourceText).not.toMatch(/^#/m);
    expect(res.sourceText).toContain('REFERTO CONCLUSIVO');
  });
});

describe('snapDocSanitariaQuotes — sezione intera', () => {
  it('sostituisce solo le «…» risolte; le irrisolte restano per il verificatore', () => {
    const md = [
      'Blocco:',
      '«Il paziente riesce a dembulare concedendo carico completo. Si lascia libero.»', // exact
      '«IL PAZIENTE GIUNGE IN PS PER INCIDENTE STRADALE AUTO CONTRO AUTO. RIEFRITO SCOPPIO INDOSSAVA LA CINTURA DI SICUREZZA DEGLI AIRBAG. NEGA TRAUMA CRANICO.»', // da agganciare
      '«Questa citazione è completamente inventata e non esiste da nessuna parte nel documento sorgente.»', // unmatched
    ].join('\n\n');
    const res = snapDocSanitariaQuotes(md, OCR);
    expect(res.total).toBe(3);
    expect(res.exactCount).toBe(1);
    expect(res.snappedCount).toBe(1);
    expect(res.unmatchedCount).toBe(1);
    expect(res.markdown).toContain('RIEFRITO SCOPPIO DEGLI AIRBAG.'); // agganciata
    expect(res.markdown).toContain('completamente inventata'); // intatta
  });

  it('ellissi interne (omissioni volute della direttiva): ogni frammento agganciato separatamente', () => {
    const md = '«IL PAZIENTE GIUNGE IN PS PER INCIDENTE STRADALE AUTO CONTRO AUTO. RIEFRITO SCOPPIO DEGLI AIRBAG. … DIAGNOSI: TRAUMA DISTORSIVO T-T DX»';
    const res = snapDocSanitariaQuotes(md, OCR);
    expect(res.unmatchedCount).toBe(0);
    expect(res.markdown).toContain('…');
  });

  it('idempotente: seconda passata = zero nuovi agganci', () => {
    const md = '«IL PAZIENTE GIUNGE IN PS PER INCIDENTE STRADALE AUTO CONTRO AUTO. RIEFRITO SCOPPIO INDOSSAVA LA CINTURA DI SICUREZZA DEGLI AIRBAG. NEGA TRAUMA CRANICO.»';
    const first = snapDocSanitariaQuotes(md, OCR);
    const second = snapDocSanitariaQuotes(first.markdown, OCR);
    expect(second.snappedCount).toBe(0);
    expect(second.markdown).toBe(first.markdown);
  });
});
