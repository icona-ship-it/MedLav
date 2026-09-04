import { describe, it, expect } from 'vitest';
import { parseRubriche, normalizeRubricLabel, cleanOcrLine } from './rubric-parser';

const PS_VERBALE = [
  'OSPEDALE CIVILE DI CITTÀDEMO',
  'Pronto Soccorso - Verbale di accesso n. PS/2026/000123',
  'Paziente: DEMPROVA MARIO, nato il 01/01/1970',
  'TRIAGE',
  'Codice verde, ore 09:15, PA 120/80, FC 78',
  'ANAMNESI',
  'Riferisce caduta accidentale in bicicletta. Pregressa frattura clavicola sinistra nel 2019.',
  'ESAME OBIETTIVO:',
  'Polso destro tumefatto e dolente. Non deficit neurovascolari.',
  'Diagnosi: frattura composta dell\'epifisi distale del radio destro.',
  'PROGNOSI: giorni 30 salvo complicazioni.',
  'TERAPIA CONSIGLIATA',
  'Apparecchio gessato; paracetamolo 1000 mg al bisogno.',
  'Si consiglia controllo ortopedico a 7 giorni.',
].join('\n');

describe('parseRubriche — segmentazione del testo OCR per rubriche del medico', () => {
  it('riconosce le rubriche note (maiuscole, con o senza due punti, inline "Diagnosi: …") e le normalizza', () => {
    const segs = parseRubriche([{ pageNumber: 1, ocrText: PS_VERBALE }]);
    const labels = segs.map((s) => s.label);
    expect(labels).toEqual(['preambolo', 'triage', 'anamnesi', 'esame_obiettivo', 'diagnosi', 'prognosi', 'terapia', 'indicazioni']);
    const diagnosi = segs.find((s) => s.label === 'diagnosi')!;
    expect(diagnosi.text).toBe('frattura composta dell\'epifisi distale del radio destro.');
    expect(diagnosi.rawLabel).toBe('Diagnosi');
    expect(diagnosi.pageNumber).toBe(1);
    const prognosi = segs.find((s) => s.label === 'prognosi')!;
    expect(prognosi.text).toBe('giorni 30 salvo complicazioni.');
    const terapia = segs.find((s) => s.label === 'terapia')!;
    expect(terapia.text).toBe('Apparecchio gessato; paracetamolo 1000 mg al bisogno.');
    expect(segs.find((s) => s.label === 'indicazioni')!.text).toBe('Si consiglia controllo ortopedico a 7 giorni.');
  });

  it('un referto senza rubriche → un unico segmento "corpo" con tutto il testo', () => {
    const text = 'RX polso destro in due proiezioni.\nFrattura composta dell\'epifisi distale del radio, senza interessamento articolare. Ulna integra.';
    const segs = parseRubriche([{ pageNumber: 1, ocrText: text }]);
    expect(segs).toHaveLength(1);
    expect(segs[0]!.label).toBe('corpo');
    expect(segs[0]!.text).toContain('Ulna integra.');
  });

  it('le intestazioni-carta (righe maiuscole di ente/indirizzo) non diventano rubriche', () => {
    const text = 'AZIENDA ULSS N. 9 SCALIGERA\nVIA DEGLI ESEMPI 1 - CITTÀDEMO\nTEL. 045 000000\nCONCLUSIONI\nConsolidazione in atto.';
    const segs = parseRubriche([{ pageNumber: 1, ocrText: text }]);
    expect(segs.map((s) => s.label)).toEqual(['preambolo', 'conclusioni']);
    expect(segs[1]!.text).toBe('Consolidazione in atto.');
  });

  it('tabelle HTML e markdown dell\'OCR diventano testo piano; le pagine si accodano in ordine', () => {
    const p1 = '<table><tr><td>Diagnosi</td><td>frattura del radio</td></tr></table>\n**ESAME OBIETTIVO**\nPolso dolente.';
    const p2 = '# DIARIO CLINICO\n| Data | Nota |\n|---|---|\n| 14.11 | decorso regolare |';
    const segs = parseRubriche([{ pageNumber: 1, ocrText: p1 }, { pageNumber: 2, ocrText: p2 }]);
    expect(segs.map((s) => s.label)).toEqual(['preambolo', 'esame_obiettivo', 'diario']);
    expect(segs[0]!.text).toContain('Diagnosi | frattura del radio');
    expect(segs[2]!.text).toContain('14.11 | decorso regolare');
    expect(segs[2]!.pageNumber).toBe(2);
    expect(segs[2]!.text).not.toContain('---');
  });

  it('normalizzazione etichette: sinonimi e abbreviazioni', () => {
    expect(normalizeRubricLabel('E.O.')).toBe('esame_obiettivo');
    expect(normalizeRubricLabel('Esame obiettivo')).toBe('esame_obiettivo');
    expect(normalizeRubricLabel('DIAGNOSI DI DIMISSIONE')).toBe('dimissione');
    expect(normalizeRubricLabel('Conclusione')).toBe('conclusioni');
    expect(normalizeRubricLabel('Giudizio conclusivo')).toBe('conclusioni');
    expect(normalizeRubricLabel('Anamnesi patologica remota')).toBe('anamnesi_remota');
    expect(normalizeRubricLabel('Verbale operatorio')).toBe('intervento');
    expect(normalizeRubricLabel('Esami ematochimici')).toBe('laboratorio');
    expect(normalizeRubricLabel('Parametri vitali')).toBe('parametri');
    expect(normalizeRubricLabel('Qualcosa di ignoto')).toBeNull();
    expect(normalizeRubricLabel('Terapia farmacologica alla dimissione')).toBe('dimissione');
    expect(normalizeRubricLabel('ESAMI ESEGUITI')).toBe('referto');
    expect(normalizeRubricLabel('RX gomito sn')).toBe('referto');
    expect(normalizeRubricLabel('ECO ginocchio destro')).toBe('referto');
    expect(normalizeRubricLabel('Consiglio')).toBe('indicazioni');
    expect(normalizeRubricLabel('INFORMAZIONE E CONSENSO')).toBe('consenso');
    // intestazioni-carta e titoli non-rubrica restano fuori
    expect(normalizeRubricLabel('Ortopedia e Traumatologia')).toBeNull();
    expect(normalizeRubricLabel('Segreteria')).toBeNull();
  });

  it('cleanOcrLine: toglie markdown e tag, conserva il testo', () => {
    expect(cleanOcrLine('**DIAGNOSI:** frattura')).toBe('DIAGNOSI: frattura');
    expect(cleanOcrLine('<b>Prognosi</b> giorni 30')).toBe('Prognosi giorni 30');
    expect(cleanOcrLine('## Conclusioni')).toBe('Conclusioni');
    expect(cleanOcrLine('[table_html_start]')).toBe('');
  });

  it('input vuoto o pagine senza testo → nessun segmento', () => {
    expect(parseRubriche([])).toEqual([]);
    expect(parseRubriche([{ pageNumber: 1, ocrText: '' }, { pageNumber: 2, ocrText: '   ' }])).toEqual([]);
  });
});
