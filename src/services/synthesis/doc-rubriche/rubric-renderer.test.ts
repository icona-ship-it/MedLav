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

describe('spec Lavini 2026-09-04 — fascicolo contenitore, PS riclassificato', () => {
  const pages = (n: number, text: string) => Array.from({ length: n }, (_, i) => ({ pageNumber: i + 1, ocrText: i === 0 ? text : `DIARIO\ndecorso regolare giorno ${i + 1}` }));
  const fascicolo = (): RubricDocument => ({ documentId: 'fasc', documentType: 'cartella_clinica', header: '**Cartella clinica, in data 16.07.2023:**', sortDate: '2023-07-16', pages: pages(12, 'CARTELLA CLINICA\nDIAGNOSI\nFrattura del femore sinistro.\nINTERVENTO\nOsteosintesi con chiodo.') });
  const lettera = (): RubricDocument => ({ documentId: 'let', documentType: 'lettera_dimissione', header: '**Lettera di dimissione, in data 25.07.2023:**', sortDate: '2023-07-25', pages: [{ pageNumber: 1, ocrText: 'Ricoverato dal 16/07/2023 al 25/07/2023\nDIAGNOSI DI DIMISSIONE\nFrattura del femore sinistro trattata.\nTRATTAMENTO ADOTTATO\nOsteosintesi con chiodo.\nTERAPIA E COMPORTAMENTO DOMICILIARE\nEparina per 30 giorni.' }] });

  it('con la lettera agli atti il fascicolo diventa una riga di rimando; la lettera porta diagnosi, trattamento e terapia', () => {
    const out = renderRubricDocSanitaria([fascicolo(), lettera()], DEFAULT_RUBRIC_POLICY);
    expect(out.markdown).toContain('Fascicolo di ricovero agli atti (12 pagine): si riporta la lettera di dimissione.');
    expect(out.markdown).not.toContain('decorso regolare giorno');
    expect(out.markdown).toContain('Intervento: «Osteosintesi con chiodo.»');
    expect(out.markdown).toContain('Terapia: «Eparina per 30 giorni.»');
    expect(out.markdown).toContain('Dimissione: «Frattura del femore sinistro trattata.»');
  });

  it('senza lettera il fascicolo cede i soli passaggi-chiave (diagnosi, intervento), mai il diario', () => {
    const out = renderRubricDocSanitaria([fascicolo()], DEFAULT_RUBRIC_POLICY);
    expect(out.markdown).toContain('Diagnosi: «Frattura del femore sinistro.»');
    expect(out.markdown).toContain('Intervento: «Osteosintesi con chiodo.»');
    expect(out.markdown).not.toContain('decorso regolare');
  });

  it('un verbale di PS breve classificato cartella o altro resta un PS con i suoi passaggi', () => {
    const ps = (type: string): RubricDocument => ({ documentId: `ps-${type}`, documentType: type, header: `**PS ${type}, in data 13.09.2025:**`, sortDate: '2025-09-13', pages: [{ pageNumber: 1, ocrText: 'PRONTO SOCCORSO - Verbale di accesso\nTRIAGE\nCodice verde\nDIAGNOSI\nDistorsione della caviglia destra con edema perimalleolare laterale.\nPROGNOSI\nGiorni 10.' }] });
    const out = renderRubricDocSanitaria([ps('cartella_clinica'), ps('altro'), lettera()], DEFAULT_RUBRIC_POLICY);
    expect(out.markdown.match(/Diagnosi: «Distorsione della caviglia destra con edema perimalleolare laterale\.»/g)).toHaveLength(1); // il secondo è dedup
    expect(out.markdown).toContain('Prognosi: «Giorni 10.»');
    expect(out.markdown).not.toContain('Codice verde');
    expect(out.markdown).not.toContain('Fascicolo di ricovero');
  });
});

describe('pulizia del depositabile (panel giro 3)', () => {
  it('righe amministrative, caselle e marker tabella/immagine non entrano nelle «...»; il tetto di blocco non spezza una citazione', () => {
    const text = 'DIAGNOSI\nFrattura composta del radio destro.\nCodice Fiscale: DMPMRA70A01H501X\nTel. 045 000000 - e-mail ps@cittademo.it\n[tbl-1.html] ![img-0.jpeg](img-0.jpeg)\n☐ dimissione ☑ ricovero\nPROGNOSI\nGiorni 30.\nCONSULENZA ORTOPEDICA\nPolso destro: frattura composta, si consiglia gesso per 30 giorni e controllo a 7 giorni.';
    const out = renderRubricDocSanitaria([doc({ documentId: 'ps', documentType: 'cartella_clinica', text: `PRONTO SOCCORSO\n${text}` })], loadRubricPolicy({ tipi: { cartella_clinica: { maxParole: 20 } } }));
    expect(out.markdown).not.toContain('Codice Fiscale');
    expect(out.markdown).not.toContain('Tel.');
    expect(out.markdown).not.toContain('[tbl-');
    expect(out.markdown).not.toContain('![img');
    expect(out.markdown).not.toContain('☐');
    expect(out.markdown).toContain('Diagnosi: «Frattura composta del radio destro.»');
    const opens = (out.markdown.match(/«/g) ?? []).length; const closes = (out.markdown.match(/»/g) ?? []).length;
    expect(opens).toBe(closes);
    expect(out.markdown).toContain('[...]');
  });
  it('fascicolo contenitore: rimando + referti d\'esame eseguiti in degenza', () => {
    const fasc: RubricDocument = { documentId: 'f', documentType: 'cartella_clinica', header: '**Cartella clinica, dal 16.07.2023 al 25.07.2023:**', sortDate: '2023-07-16', pages: Array.from({ length: 12 }, (_, i) => ({ pageNumber: i + 1, ocrText: i === 3 ? 'RX femore sinistro\nFrattura pertrocanterica composta; mezzi di sintesi in sede.' : `DIARIO\ngiorno ${i + 1} decorso regolare` })) };
    const let2: RubricDocument = { documentId: 'l', documentType: 'lettera_dimissione', header: '**Lettera di dimissione, in data 25.07.2023:**', sortDate: '2023-07-25', pages: [{ pageNumber: 1, ocrText: 'DIAGNOSI DI DIMISSIONE\nFrattura pertrocanterica trattata.' }] };
    const out = renderRubricDocSanitaria([fasc, let2], DEFAULT_RUBRIC_POLICY);
    expect(out.markdown).toContain('Referti eseguiti in degenza:');
    expect(out.markdown).toContain('«RX femore sinistro: Frattura pertrocanterica composta; mezzi di sintesi in sede.»');
    expect(out.markdown).not.toContain('decorso regolare');
  });
});

describe('referti in degenza: niente screening pre-operatorio', () => {
  it('RX torace ed ECG di routine restano fuori, la RX del distretto colpito resta', () => {
    const fasc: RubricDocument = { documentId: 'f', documentType: 'cartella_clinica', header: '**Cartella clinica, dal 16.07.2023 al 25.07.2023:**', sortDate: '2023-07-16', pages: Array.from({ length: 12 }, (_, i) => ({ pageNumber: i + 1, ocrText: i === 2 ? 'RX torace\nNon lesioni pleuro-parenchimali in atto. Ombra cardiaca nei limiti.' : i === 3 ? 'ECG\nRitmo sinusale, frequenza 72.' : i === 4 ? 'RX femore sinistro\nFrattura pertrocanterica composta; mezzi di sintesi in sede.' : `DIARIO\ngiorno ${i + 1}` })) };
    const let2: RubricDocument = { documentId: 'l', documentType: 'lettera_dimissione', header: '**Lettera di dimissione, in data 25.07.2023:**', sortDate: '2023-07-25', pages: [{ pageNumber: 1, ocrText: 'DIAGNOSI DI DIMISSIONE\nFrattura pertrocanterica trattata.' }] };
    const out = renderRubricDocSanitaria([fasc, let2], DEFAULT_RUBRIC_POLICY);
    expect(out.markdown).toContain('RX femore sinistro: Frattura pertrocanterica composta');
    expect(out.markdown).not.toContain('pleuro-parenchimali');
    expect(out.markdown).not.toContain('Ritmo sinusale');
  });
});
