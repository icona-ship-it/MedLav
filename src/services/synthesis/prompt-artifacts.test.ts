import { describe, it, expect } from 'vitest';
import { stripPromptArtifacts, stripItalicMetaParagraphs } from './prompt-artifacts';

describe('stripPromptArtifacts — artefatti del prompt ricopiati nel testo (gate gold 2026-09-04, giro 1)', () => {
  it('toglie i tag di ambito temporale dentro e fuori le «...»', () => {
    const text = '«colecistectomia nel 2002 [riferito in anamnesi]» e RX di controllo [programmato, non eseguito nel documento]; 12.03.2026 [PROGRAMMATO: previsto, NON documentato come eseguito] visita [RIFERITO IN ANAMNESI: non è un atto di questo documento].';
    expect(stripPromptArtifacts(text)).toBe('«colecistectomia nel 2002» e RX di controllo; 12.03.2026 visita.');
  });

  it('toglie le sigle di categoria delle fonti "(FONTE: A - …)" e "(A|C - …)"', () => {
    const text = 'Dimessa con diagnosi di frattura (FONTE: A - cartella clinica del 16.07.2023). Controllo regolare (A|C - referto del 12.09.2023) e RX (B/C - referto).';
    expect(stripPromptArtifacts(text)).toBe('Dimessa con diagnosi di frattura. Controllo regolare e RX.');
  });

  it('toglie le parentesi di pseudo-verifica in prosa', () => {
    const text = 'Prognosi di 30 giorni (dato parzialmente riscontrato nella documentazione) con immobilizzazione (non documentato); terapia (dato non risultante dalla documentazione in atti).';
    expect(stripPromptArtifacts(text)).toBe('Prognosi di 30 giorni con immobilizzazione; terapia.');
  });

  it('non tocca parentesi cliniche legittime, sigle di esame e riferimenti a documenti in prosa', () => {
    const text = 'RX polso (2 proiezioni): frattura (composta) del radio; ECG (ritmo sinusale); vitamina D (25-OH) 30 ng/ml; come da referto del 13.11.2024 (Pronto Soccorso); esami (D-dimero 1200 ng/ml); PCR (C-reattiva) negativa; sospetta lesione (non confermata alla RX); allergia (documentata).';
    expect(stripPromptArtifacts(text)).toBe(text);
  });

  it('è idempotente', () => {
    const once = stripPromptArtifacts('esito (FONTE: C - referto) buono [riferito in anamnesi].');
    expect(stripPromptArtifacts(once)).toBe(once);
    expect(once).toBe('esito buono.');
  });
});

describe('stripItalicMetaParagraphs — doc-sanitaria senza commenti in corsivo', () => {
  it('toglie un paragrafo interamente in corsivo tra due citazioni, lascia intestazioni e citazioni', () => {
    const text = '**Cartella clinica, in data 13.09.2025:**\n«frattura composta del radio»\n\n*La dinamica del sinistro riportata nel verbale non coincide con quanto riferito: si segnala per verifica.*\n\n«prognosi giorni 30»';
    expect(stripItalicMetaParagraphs(text)).toBe('**Cartella clinica, in data 13.09.2025:**\n«frattura composta del radio»\n\n«prognosi giorni 30»');
  });

  it('non toglie corsivi brevi o dentro una riga con altro testo', () => {
    const text = 'Referto RX: *negativo*.\n*[da compilare dal perito]*\n«esame obiettivo: *dolente*»';
    expect(stripItalicMetaParagraphs(text)).toBe(text);
  });
});
