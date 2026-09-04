import { describe, it, expect } from 'vitest';
import { renderRubricDocSanitaria, capAtSentence, type RubricDocument } from './rubric-renderer';
import { DEFAULT_RUBRIC_POLICY, loadRubricPolicy, policyForType } from './rubric-policy';

const PS = [
  'OSPEDALE CIVILE DI CITTÀDEMO - Pronto Soccorso',
  'TRIAGE', 'Codice verde, PA 120/80, FC 78',
  'ANAMNESI', 'Caduta accidentale in bicicletta.',
  'ESAME OBIETTIVO', 'Polso destro tumefatto e dolente.',
  'DIAGNOSI', 'Frattura composta dell\'epifisi distale del radio destro.',
  'PROGNOSI', 'Giorni 30 salvo complicazioni.',
  'ESAMI EMATOCHIMICI', 'Hb 13.1, WBC 7.2',
].join('\n');

const DIMISSIONE = [
  'Lettera di dimissione',
  'DIAGNOSI', 'Frattura composta dell\'epifisi distale del radio destro.',
  'DECORSO', 'Regolare, apparecchio gessato ben tollerato.',
  'TERAPIA ALLA DIMISSIONE', 'Paracetamolo 1000 mg al bisogno.',
].join('\n');

const doc = (o: Partial<RubricDocument> & { documentId: string; text: string }): RubricDocument => ({
  documentId: o.documentId,
  documentType: o.documentType ?? 'referto_specialistico',
  header: o.header ?? `**Documento ${o.documentId}, in data 13.09.2025:**`,
  sortDate: o.sortDate ?? '2025-09-13',
  pages: [{ pageNumber: 1, ocrText: o.text }],
});

describe('renderRubricDocSanitaria — un documento = un blocco, rubriche copiate per intero', () => {
  it('PS: copia anamnesi, EO, diagnosi, prognosi; omette triage e laboratorio; verbatim del medico', () => {
    const out = renderRubricDocSanitaria([doc({ documentId: 'ps', documentType: 'cartella_clinica', text: PS })], DEFAULT_RUBRIC_POLICY);
    expect(out.blocks).toBe(1);
    expect(out.markdown).toContain('Diagnosi: «Frattura composta dell\'epifisi distale del radio destro.»');
    expect(out.markdown).toContain('Prognosi: «Giorni 30 salvo complicazioni.»');
    expect(out.markdown).toContain('Esame obiettivo: «Polso destro tumefatto e dolente.»');
    expect(out.markdown).not.toContain('PA 120/80');
    expect(out.markdown).not.toContain('Hb 13.1');
    expect(out.markdown.startsWith('**Documento ps')).toBe(true);
  });

  it('dedup: la diagnosi identica nella lettera di dimissione non viene riprodotta due volte; il decorso sì', () => {
    const out = renderRubricDocSanitaria([
      doc({ documentId: 'ps', documentType: 'cartella_clinica', text: PS, sortDate: '2025-09-13' }),
      doc({ documentId: 'dim', documentType: 'lettera_dimissione', text: DIMISSIONE, sortDate: '2025-09-14' }),
    ], DEFAULT_RUBRIC_POLICY);
    expect(out.blocks).toBe(2);
    expect(out.dedupSkipped).toBe(1);
    expect(out.markdown.match(/Frattura composta dell'epifisi distale del radio destro\./g)).toHaveLength(1);
    expect(out.markdown).toContain('Decorso: «Regolare, apparecchio gessato ben tollerato.»');
    expect(out.markdown).toContain('Dimissione: «Paracetamolo 1000 mg al bisogno.»');
  });

  it('esame strumentale senza rubriche: referto per intero (integrale); spese e laboratorio esclusi; certificati in una riga', () => {
    const out = renderRubricDocSanitaria([
      doc({ documentId: 'rx', documentType: 'esame_strumentale', text: 'RX polso destro: frattura composta del radio. Ulna integra.', sortDate: '2025-09-13' }),
      doc({ documentId: 'lab', documentType: 'esame_laboratorio', text: 'Hb 13.1 WBC 7.2', sortDate: '2025-09-13' }),
      doc({ documentId: 'fatt', documentType: 'spese_mediche', text: 'Fattura n. 45 totale 400,00', sortDate: '2026-04-30' }),
      doc({ documentId: 'c1', documentType: 'certificato', text: 'Certificato di malattia dal 13.09 al 12.10.', sortDate: '2025-09-13' }),
      doc({ documentId: 'c2', documentType: 'certificato', text: 'Certificato di malattia dal 13.10 al 30.10.', sortDate: '2025-10-13' }),
    ], DEFAULT_RUBRIC_POLICY);
    expect(out.markdown).toContain('«RX polso destro: frattura composta del radio. Ulna integra.»');
    expect(out.markdown).not.toContain('Hb 13.1');
    expect(out.markdown).not.toContain('400,00');
    expect(out.markdown).toContain('**Certificati medici (2), dal 13.09.2025 al 13.10.2025:**');
    expect(out.omitted).toBe(2);
    expect(out.blocks).toBe(2);
  });

  it('invariante: un documento clinico senza rubriche riconosciute produce comunque un blocco (fallback o rimando)', () => {
    const out = renderRubricDocSanitaria([
      doc({ documentId: 'v', documentType: 'referto_specialistico', text: 'Visita ortopedica. Il paziente sta bene, gesso integro.' }),
      doc({ documentId: 'k', documentType: 'cartella_clinica', text: 'Solo intestazioni amministrative e timbri.' }),
    ], DEFAULT_RUBRIC_POLICY);
    expect(out.blocks).toBe(2);
    expect(out.markdown).toContain('«Visita ortopedica. Il paziente sta bene, gesso integro.»');
    expect(out.markdown).toContain('nessuna rubrica clinica riprodotta');
    expect(out.fallbackDocs).toBe(2);
  });

  it('ordina i blocchi per data e rispetta il tetto di parole con taglio su frase', () => {
    const long = `DIAGNOSI\n${'Frase numero uno della diagnosi. '.repeat(40)}`;
    const policy = loadRubricPolicy({ tipi: { referto_specialistico: { maxParole: 30 } } });
    const out = renderRubricDocSanitaria([
      doc({ documentId: 'b', text: 'DIAGNOSI\nSeconda.', sortDate: '2026-01-02' }),
      doc({ documentId: 'a', text: long, sortDate: '2026-01-01' }),
    ], policy);
    expect(out.markdown.indexOf('Documento a')).toBeLessThan(out.markdown.indexOf('Documento b'));
    expect(out.markdown).toContain('[...]');
    expect(out.markdown.split('\n\n')[0]!.split(/\s+/).length).toBeLessThan(45);
  });
});

describe('capAtSentence e policy', () => {
  it('non taglia sotto il tetto; taglia su punto oltre il tetto', () => {
    expect(capAtSentence('Una frase. Due frase.', 10)).toBe('Una frase. Due frase.');
    const cut = capAtSentence('Prima frase lunga con molte parole dentro. Seconda frase pure lunga con parole. Terza.', 8);
    expect(cut.endsWith('[...]')).toBe(true);
    expect(cut).toContain('Prima frase lunga con molte parole dentro.');
  });
  it('loadRubricPolicy: campi mancanti → default, tipi ignoti aggiunti, valori invalidi ignorati', () => {
    const p = loadRubricPolicy({ version: 'x', tipi: { certificato: { mode: 'passaggi', maxParole: -1 }, nuovo_tipo: { copia: ['diagnosi'] } } });
    expect(p.version).toBe('x');
    expect(p.tipi.certificato!.mode).toBe('passaggi');
    expect(p.tipi.certificato!.maxParole).toBe(DEFAULT_RUBRIC_POLICY.tipi.certificato!.maxParole);
    expect(p.tipi.nuovo_tipo!.copia).toEqual(['diagnosi']);
    expect(policyForType(p, 'tipo_inesistente')).toBe(p.tipi[p.tipoDefault]);
    expect(loadRubricPolicy(null)).toBe(DEFAULT_RUBRIC_POLICY);
  });
});
