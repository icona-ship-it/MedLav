import { describe, it, expect } from 'vitest';
import { stripLabBlocks } from './lab-block-stripper';

/**
 * Block A (perizia RC stragiudiziale, direttiva Lavini): i valori di laboratorio
 * vanno esclusi dalla riproduzione. Il filtro per-EVENTO non basta perché i valori
 * sono annegati nell'OCR grezzo delle cartelle e nel sourceText degli eventi non-lab.
 * stripLabBlocks rimuove i BLOCCHI di laboratorio (≥3 analiti con valore, contigui),
 * senza toccare la prosa clinica (anti-falsi-positivi).
 */
describe('stripLabBlocks', () => {
  it('rimuove una tabella ematochimica multi-riga (≥3 analiti con valore+range)', () => {
    const input = [
      'Esami ematochimici del 18.07:',
      'Emoglobina 114.0 g/L 120.0-160.0',
      'Ematocrito 0.34 L/L 0.36-0.46',
      'Eritrociti 3.80 10^12/L 4.20-5.40',
      'Piastrine 210 10^9/L 150-400',
      'Creatinina 0.9 mg/dL 0.5-1.1',
      'Esame obiettivo: addome trattabile, ferita in ordine.',
    ].join('\n');
    const { text, removedBlocks } = stripLabBlocks(input);
    expect(removedBlocks).toBe(1);
    expect(text).not.toMatch(/Emoglobina 114/);
    expect(text).not.toMatch(/Creatinina 0\.9/);
    // la prosa clinica resta
    expect(text).toMatch(/addome trattabile/);
  });

  it('rimuove il formato inline a pipe con ≥3 coppie analita-valore', () => {
    const input = 'Riscontro: Eritrociti 2.74 | Emoglobina 89.0 | Ematocrito 0.27 | MCV 98 — quadro anemico.';
    const { text, removedBlocks } = stripLabBlocks(input);
    expect(removedBlocks).toBe(1);
    expect(text).not.toMatch(/Emoglobina 89/);
    expect(text).not.toMatch(/Ematocrito 0\.27/);
  });

  it('NON modifica prosa clinica con UN solo valore (Hb 89, trasfuse 2 unità)', () => {
    const input = 'Paziente con Hb 89, trasfuse 2 unità di emazie concentrate.';
    const { text, removedBlocks } = stripLabBlocks(input);
    expect(removedBlocks).toBe(0);
    expect(text).toBe(input);
  });

  it('NON tocca un referto RX (numeri+gradi ma zero analiti ematochimici)', () => {
    const input = 'RX: frattura composta del radio distale, angolazione 15° dorsale, 2 frammenti.';
    const { text, removedBlocks } = stripLabBlocks(input);
    expect(removedBlocks).toBe(0);
    expect(text).toBe(input);
  });

  it('NON tocca i parametri vitali del PS (PA/FC/SpO2/TC — non sono analiti ematochimici)', () => {
    const input = 'Parametri: PA 120/80, FC 78, SpO2 98%, TC 36.5°C. Paziente vigile.';
    const { text, removedBlocks } = stripLabBlocks(input);
    expect(removedBlocks).toBe(0);
    expect(text).toBe(input);
  });

  it('NON rimuove un blocco sotto-soglia (esattamente 2 analiti)', () => {
    const input = ['Glicemia 95 mg/dL', 'Creatinina 0.8 mg/dL', 'Resto nella norma.'].join('\n');
    const { text, removedBlocks } = stripLabBlocks(input);
    expect(removedBlocks).toBe(0);
    expect(text).toContain('Glicemia 95');
  });

  it('riconosce il separatore decimale italiano (virgola)', () => {
    const input = [
      'Glicemia 95,5 mg/dL',
      'Colesterolo 210,0 mg/dL',
      'Trigliceridi 150,3 mg/dL',
      'Creatinina 0,9 mg/dL',
    ].join('\n');
    const { removedBlocks } = stripLabBlocks(input);
    expect(removedBlocks).toBe(1);
  });

  it('è idempotente', () => {
    const input = [
      'Emoglobina 114 g/L',
      'Ematocrito 0.34 L/L',
      'Piastrine 210 10^9/L',
      'Leucociti 8.2 10^9/L',
      'Nota clinica finale.',
    ].join('\n');
    const once = stripLabBlocks(input).text;
    const twice = stripLabBlocks(once).text;
    expect(twice).toBe(once);
  });

  it('gestisce stringa vuota e testo senza lab senza crash', () => {
    expect(stripLabBlocks('').removedBlocks).toBe(0);
    expect(stripLabBlocks('Nessun dato di laboratorio qui.').removedBlocks).toBe(0);
    expect(stripLabBlocks('Nessun dato di laboratorio qui.').text).toBe('Nessun dato di laboratorio qui.');
  });

  it('assorbe la riga-header che precede il blocco lab', () => {
    const input = [
      'Decorso post-operatorio regolare.',
      'Esami ematochimici di controllo:',
      'Emoglobina 100 g/L 120-160',
      'Ematocrito 0.31 L/L 0.36-0.46',
      'Globuli bianchi 9.1 10^9/L 4-10',
      'Dimesso in buone condizioni.',
    ].join('\n');
    const { text } = stripLabBlocks(input);
    expect(text).not.toMatch(/Esami ematochimici di controllo/);
    expect(text).toMatch(/Decorso post-operatorio/);
    expect(text).toMatch(/Dimesso in buone condizioni/);
  });

  it('rimuove più blocchi distinti e li conta', () => {
    const input = [
      'Ingresso.',
      'Emoglobina 114 g/L',
      'Ematocrito 0.34 L/L',
      'Creatinina 0.9 mg/dL',
      'Visita intermedia: ferita in ordine.',
      'Glicemia 110 mg/dL',
      'Sodio 140 mmol/L',
      'Potassio 4.2 mmol/L',
      'Dimissione.',
    ].join('\n');
    const { removedBlocks, text } = stripLabBlocks(input);
    expect(removedBlocks).toBe(2);
    expect(text).toMatch(/Ingresso\./);
    expect(text).toMatch(/Visita intermedia/);
    expect(text).toMatch(/Dimissione\./);
  });
});
