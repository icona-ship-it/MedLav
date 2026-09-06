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

describe('maschere di modulo e codici (panel giro 4)', () => {
  it('righe di tabella con separatori, campi di maschera e codici lunghi restano fuori; il referto integrale non ha etichette di rubrica', () => {
    const ps = doc({ documentId: 'ps', documentType: 'cartella_clinica', text: 'PRONTO SOCCORSO\nANAMNESI\nCaduta dalla bicicletta.\nDinamica | caduta | ore 09:15\nRIFIUTO PRESTAZIONI: no\nFIRMA | PAZIENTE\nCodice uscita 12 | DGRV 1234\nDIAGNOSI\nFrattura composta del radio destro.' });
    const rx = doc({ documentId: 'rx', documentType: 'esame_strumentale', text: 'NOTIZIE CLINICHE\nTrauma da caduta.\nREFERTO\nFrattura composta del radio. 1234567890 Rossi Mario richiedente\nCONCLUSIONI\nFrattura composta.' });
    const out = renderRubricDocSanitaria([ps, rx], DEFAULT_RUBRIC_POLICY);
    expect(out.markdown).toContain('Anamnesi: «Caduta dalla bicicletta.»');
    expect(out.markdown).not.toContain('Dinamica |');
    expect(out.markdown).not.toContain('RIFIUTO');
    expect(out.markdown).not.toContain('DGRV');
    expect(out.markdown).not.toContain('1234567890');
    expect(out.markdown).not.toContain('Referto: «');
    expect(out.markdown).toContain('«Trauma da caduta.»');
    expect(out.markdown).toContain('«Frattura composta.»');
  });
});

// Panel giro 7 (2026-09-06), caso C — reperti sul renderer. Fixture interamente fittizie.
describe('renderRubricDocSanitaria — rumore macchina, manoscritti, certificati (giro 7)', () => {
  const ECG = [
    '01-gen-1970 (55 anni)', 'Femmina Ignoto', 'Camera:', 'Ubic:64',
    'Frequenza ventricolare 101 BPM', 'Intervallo PR 146 ms',
    'Tachicardia sinusale', 'Anormalità aspecifiche onda T', 'Non sono disponibili ECG precedenti',
    'Confermato da DEMPROVA, ANNA (68) il 13/09/2025 21:58:26', 'Tecnico: INF PS',
    'Indicazioni:"trauma "', 'Med.:', 'Confermato da: ANNA DEMPROVA',
    '25mm/s 10mm/mV 150Hz 10.2.3 12SL 241 CID: 1',
    'EID: 68 EDT: 21:58 13-set-2025 ORDINE: H0000001 CONTO: DMPMRA70A41C890X VISITA: S6YG0P', 'Pagina 1 di 1',
  ].join('\n');

  it('ECG: il referto clinico (prima delle rubriche) entra nell\'integrale; header macchina, codice fiscale e data di nascita no', () => {
    const out = renderRubricDocSanitaria([doc({ documentId: 'ecg', documentType: 'esame_strumentale', text: ECG })], DEFAULT_RUBRIC_POLICY);
    expect(out.markdown).toContain('Tachicardia sinusale');
    expect(out.markdown).toContain('Anormalità aspecifiche onda T');
    expect(out.markdown).not.toContain('DMPMRA70A41C890X');
    expect(out.markdown).not.toContain('CONTO');
    expect(out.markdown).not.toContain('mm/s');
    expect(out.markdown).not.toContain('55 anni');
    expect(out.markdown).not.toContain('Confermato da');
    expect(out.markdown).not.toContain('Ubic');
  });

  it('esame strumentale con rubrica "Referto": il preambolo (carta intestata) NON entra quando il referto c\'è', () => {
    const RX = ['OSPEDALE CIVILE DI CITTÀDEMO', 'U.O. Radiologia', 'Esame: RX polso destro', 'REFERTO', 'Frattura composta del radio distale. Ulna integra.'].join('\n');
    const out = renderRubricDocSanitaria([doc({ documentId: 'rx', documentType: 'esame_strumentale', text: RX })], DEFAULT_RUBRIC_POLICY);
    expect(out.markdown).toContain('Frattura composta del radio distale');
    expect(out.markdown).not.toContain('OSPEDALE CIVILE');
    expect(out.markdown).not.toContain('U.O. Radiologia');
  });

  it('manoscritto in larga parte illeggibile: riga di rimando, MAI garble tra virgolette', () => {
    const MANO = ['[ILLEGGIBILE] Nella', '13/9/2025', '[ILLEGGIBILE] me.', 'Cansello.[ILLEGGIBILE] odierne le', 'ottime [ILLEGGIBILE]', '[ILLEGGIBILE]', 'Dott. DEMPROVA MARIO', 'Medico Chirurgo'].join('\n');
    const out = renderRubricDocSanitaria([doc({ documentId: 'mano', text: MANO })], DEFAULT_RUBRIC_POLICY);
    expect(out.markdown).toMatch(/non leggibile|illeggibile/i);
    expect(out.markdown).toContain('originale');
    expect(out.markdown).not.toContain('«');
    expect(out.illegibleDocs).toBe(1);
  });

  it('un solo [ILLEGGIBILE] in un referto leggibile resta inline nella citazione', () => {
    const REF = ['DIAGNOSI', 'Frattura composta del radio distale destro, [ILLEGGIBILE] scomposizione.', 'PROGNOSI', 'Giorni 30.'].join('\n');
    const out = renderRubricDocSanitaria([doc({ documentId: 'ref', text: REF })], DEFAULT_RUBRIC_POLICY);
    expect(out.markdown).toContain('Diagnosi: «Frattura composta del radio distale destro, [ILLEGGIBILE] scomposizione.»');
    expect(out.illegibleDocs).toBe(0);
  });

  it('certificati: gli attestati di malattia si aggregano; gli altri certificati (psicologa, INPS, idoneità) hanno il loro blocco', () => {
    const ATTESTATO = (a: string, b: string) => ['Attestato di malattia telematico', 'DATI PROGNOSI', `Inizio malattia ${a}`, `Fine prognosi ${b}`, 'PUC 1234'].join('\n');
    const PSICO = [
      'Dott.ssa Demprova Anna', 'Psicologa Psicoterapeuta', 'Via degli Esempi 1, Cittàdemo P. IVA 00000000000',
      'certifico che la Sig.ra Demprova Maria, nata a Cittàdemo il 01/01/1970, ha effettuato 10 sedute di psicoterapia.',
      'L\'obiettivo del lavoro svolto è stato di sostegno per uno stato ansioso reattivo.', 'Il percorso è tutt\'ora in corso.', 'In fede',
    ].join('\n');
    const out = renderRubricDocSanitaria([
      doc({ documentId: 'a1', documentType: 'certificato', text: ATTESTATO('25/11/2024', '08/01/2025'), sortDate: '2024-11-25' }),
      doc({ documentId: 'a2', documentType: 'certificato', text: ATTESTATO('09/01/2025', '14/02/2025'), sortDate: '2025-01-09' }),
      doc({ documentId: 'psi', documentType: 'certificato', header: '**Certificato medico, Dott.ssa Demprova Anna, in data 30.03.2026:**', text: PSICO, sortDate: '2026-03-30' }),
    ], DEFAULT_RUBRIC_POLICY);
    expect(out.markdown).toContain('**Certificati medici (2), dal 25.11.2024 al 09.01.2025:**');
    expect(out.markdown).toContain('**Certificato medico, Dott.ssa Demprova Anna, in data 30.03.2026:**');
    expect(out.markdown).toContain('L\'obiettivo del lavoro svolto è stato di sostegno per uno stato ansioso reattivo.');
    expect(out.markdown).not.toContain('nata a');
    expect(out.markdown).not.toContain('P. IVA');
  });
});

describe('renderRubricDocSanitaria — giro avversariale sul rumore (mai perdere testo clinico)', () => {
  it('terapia domiciliare, EO con etichette corte e "Femmina di 47 anni giunge…" restano; l\'anagrafica no', () => {
    const REF = [
      'ANAMNESI', 'Femmina di 47 anni, giunge per caduta accidentale.', 'Nata a Cittàdemo il 01/01/1970, residente in via degli Esempi 1.',
      'ESAME OBIETTIVO', 'Cute: integra', 'Lato: dx', 'Polso: presente',
      'TERAPIA', 'Proseguire terapia domiciliare con eparina; dimissione al domicilio.',
    ].join('\n');
    const out = renderRubricDocSanitaria([doc({ documentId: 'r', text: REF })], DEFAULT_RUBRIC_POLICY);
    expect(out.markdown).toContain('Femmina di 47 anni, giunge per caduta accidentale.');
    expect(out.markdown).toContain('Cute: integra');
    expect(out.markdown).toContain('Lato: dx');
    expect(out.markdown).toContain('Proseguire terapia domiciliare con eparina; dimissione al domicilio.');
    expect(out.markdown).not.toContain('Nata a');
    expect(out.markdown).not.toContain('01/01/1970');
  });
  it('referto dattiloscritto con 3 parole incerte su 12 righe resta citato per intero', () => {
    const lines = ['REFERTO', ...Array.from({ length: 12 }, (_, i) => `Riga clinica numero ${i + 1} del referto${i < 3 ? ' [ILLEGGIBILE]' : ''}.`)];
    const out = renderRubricDocSanitaria([doc({ documentId: 'r', documentType: 'esame_strumentale', text: lines.join('\n') })], DEFAULT_RUBRIC_POLICY);
    expect(out.illegibleDocs).toBe(0);
    expect(out.markdown).toContain('Riga clinica numero 12');
  });
});

describe('renderRubricDocSanitaria — certificati INPS/idoneità: via la modulistica, resta il giudizio', () => {
  it('artefatti OCR, protocollo, etichette orfane, luogo-data e boilerplate di ricorso non entrano', () => {
    const INPS = ['^{}[]', 'Esito di Visita medica di Controllo', 'Protocollo: INPS.9000.19/06/2025.0000000', 'Il Lavoratore:', 'Il Medico:',
      'Cittàdemo, 24 giugno 2025', 'Giudizio: idoneo con limitazioni al carico per 30 giorni.', 'Avverso il giudizio è ammesso ricorso entro trenta giorni.'].join('\n');
    const out = renderRubricDocSanitaria([doc({ documentId: 'inps', documentType: 'certificato', text: INPS })], DEFAULT_RUBRIC_POLICY);
    expect(out.markdown).toContain('Conclusioni: «idoneo con limitazioni al carico per 30 giorni.»');
    expect(out.markdown).toContain('Esito di Visita medica di Controllo');
    expect(out.markdown).not.toContain('^{}');
    expect(out.markdown).not.toContain('Protocollo');
    expect(out.markdown).not.toContain('Il Medico:');
    expect(out.markdown).not.toContain('24 giugno 2025');
    expect(out.markdown).not.toContain('ricorso');
  });
});

describe('renderRubricDocSanitaria — tetto di blocco: la rubrica che non entra viene accorciata, non persa', () => {
  it('dopo un\'anamnesi lunga l\'esame obiettivo resta (accorciato su frase) invece di sparire dietro "[...]"', () => {
    const anamnesi = Array.from({ length: 14 }, (_, i) => `Frase di anamnesi numero ${i + 1} con dieci parole di riempimento qui dentro.`).join(' ');
    const eo = 'Non dolore a riposo al ginocchio, presente dolore durante la deambulazione in discesa (8/10 NRS). ' + Array.from({ length: 8 }, (_, i) => `Altra frase di esame obiettivo numero ${i + 1} con riempimento.`).join(' ');
    const referto = Array.from({ length: 6 }, (_, i) => `Riga di referto numero ${i + 1} con dieci parole di riempimento qui dentro.`).join(' ');
    const text = ['REFERTO', referto, 'ANAMNESI PROSSIMA', anamnesi, 'ESAME OBIETTIVO', eo, 'DIAGNOSI', 'Esiti di frattura.'].join('\n');
    const out = renderRubricDocSanitaria([doc({ documentId: 'fis', text })], DEFAULT_RUBRIC_POLICY);
    expect(out.markdown).toContain('(8/10 NRS)');
    expect(out.markdown).toMatch(/Esame obiettivo: «Non dolore a riposo/);
    expect(out.markdown).toContain('Diagnosi: «Esiti di frattura.»');
    const words = out.markdown.split(/\s+/).length;
    expect(words).toBeLessThan(340);
  });
});

describe('renderRubricDocSanitaria — giro avversariale 2: titoli d\'esame restano, firme ed equipe no', () => {
  it('cartella: "RX FEMORE SN:" resta come titolo del referto interno; "Equipe Medica:" e l\'elenco dei medici no', () => {
    const text = ['CARTELLA CLINICA', 'REFERTO', 'RX FEMORE SN:', 'Frattura diafisaria.', 'Equipe Medica:', 'Dr. Mario Demprova', 'Dr.ssa Anna Demprova', 'Il Medico Radiologo Dott.ssa Anna Demprova', 'Referto Firmato Digitalmente', 'Data referto 16/07/2023 12:31'].join('\n');
    const out = renderRubricDocSanitaria([doc({ documentId: 'cc', documentType: 'lettera_dimissione', text })], DEFAULT_RUBRIC_POLICY);
    expect(out.markdown).toContain('RX FEMORE SN:');
    expect(out.markdown).toContain('Frattura diafisaria.');
    expect(out.markdown).not.toContain('Equipe Medica');
    expect(out.markdown).not.toContain('Dr. Mario');
    expect(out.markdown).not.toContain('Radiologo');
    expect(out.markdown).not.toContain('Firmato');
  });
  it('verbale INPS a tabella: NOME/COGNOME/DENOMINAZIONE fuori', () => {
    const text = ['VERBALE DI VISITA MEDICA DI CONTROLLO', 'DENOMINAZIONE: COMUNE DI CITTÀDEMO | RAGIONE SOCIALE:', 'NOME: MARIA | COGNOME: DEMPROVA', 'Prognosi confermata fino al 30/06/2025.'].join('\n');
    const out = renderRubricDocSanitaria([doc({ documentId: 'v', documentType: 'certificato', text })], DEFAULT_RUBRIC_POLICY);
    expect(out.markdown).toContain('Prognosi: «confermata fino al 30/06/2025.»');
    expect(out.markdown).not.toContain('COGNOME');
    expect(out.markdown).not.toContain('DENOMINAZIONE');
  });
});

describe('renderRubricDocSanitaria — piè di pagina dello studio radiologico fuori dal referto integrale', () => {
  it('referto sottile con testo nel preambolo: entra il referto, non orari/prenotazioni/consulenti; il titolo d\'esame resta', () => {
    const text = [
      'OSPEDALE CIVILE DI CITTÀDEMO', 'U.O.C. Radiologia', 'Demprova Maria', 'Campi polmonari ipoespansi, con affastellamento delle strutture broncovasali basali.',
      'Consul. Radiol. Interventistica', 'orario (lun-ven) 7.00-19.00', '(sabato) 8.00-12.30', 'Prenotazione TC/RM: 045000000', 'Prenotazione Rx, Ecografia,', 'Mammografia, Densitometria:',
      'RX TORACE:', 'I',
    ].join('\n');
    const out = renderRubricDocSanitaria([doc({ documentId: 'rxt', documentType: 'esame_strumentale', text })], DEFAULT_RUBRIC_POLICY);
    expect(out.markdown).toContain('Campi polmonari ipoespansi');
    // "RX TORACE: I" (titolo + classe di dose) è una citazione vuota: non si emette.
    expect(out.markdown).not.toMatch(/«RX TORACE:\s*I»/);
    expect(out.markdown).not.toContain('orario');
    expect(out.markdown).not.toContain('Prenotazione');
    expect(out.markdown).not.toContain('Densitometria');
    expect(out.markdown).not.toContain('Consul.');
    expect(out.markdown).not.toContain('OSPEDALE CIVILE');
  });
});

// Panel giro 8 (2026-09-06) — reperti B/C sul renderer. Fixture fittizie.
describe('renderRubricDocSanitaria — giro 8: citazioni vuote, righe di tabella, priorità alle rubriche-cuore', () => {
  it('citazioni vuote o con soli residui ("I", "III", titolo d\'esame senza testo) non vengono emesse', () => {
    const text = ['CARTELLA CLINICA', 'REFERTO', 'RX FEMORE SN:', 'I', 'RX GOMITO SN:', 'III', 'RX ANCA SN: Esiti di frattura pluriframmentaria del III prossimale, sintetizzata.'].join('\n');
    const out = renderRubricDocSanitaria([doc({ documentId: 'cc', documentType: 'lettera_dimissione', text })], DEFAULT_RUBRIC_POLICY);
    expect(out.markdown).toContain('RX ANCA SN: Esiti di frattura');
    expect(out.markdown).not.toMatch(/«I»|«III»|«RX FEMORE SN:»|«RX GOMITO SN:»/);
  });

  it('righe di tabella a una cella ("Nr. Radiologico: | 2023/45615", "Data nascita: | …") e l\'equipe inline non entrano', () => {
    const text = ['REFERTO', 'Nr. Radiologico: | 2023/45615', 'Data nascita: | 01/01/1950', 'Provenienza: | PRONTO SOCCORSO', 'Frattura composta del radio distale.', 'Equipe Medica: Dr.ssa Anna Demprova Dr. Mario Demprova'].join('\n');
    const out = renderRubricDocSanitaria([doc({ documentId: 'rx', documentType: 'esame_strumentale', text })], DEFAULT_RUBRIC_POLICY);
    expect(out.markdown).toContain('Frattura composta del radio distale.');
    expect(out.markdown).not.toContain('Nr. Radiologico');
    expect(out.markdown).not.toContain('01/01/1950');
    expect(out.markdown).not.toContain('Equipe');
  });

  it('tetto di blocco: diagnosi, conclusioni, prognosi e indicazioni restano anche dopo un\'anamnesi lunga', () => {
    const long = (label: string, n: number) => Array.from({ length: n }, (_, i) => `${label} frase numero ${i + 1} con dieci parole di riempimento qui dentro.`).join(' ');
    const text = ['ANAMNESI PROSSIMA', long('Anamnesi', 20), 'ESAME OBIETTIVO', long('Obiettività', 20), 'CONCLUSIONI', 'Quadro clinico stabilizzato; si invia a valutazione otoneurologica.', 'INDICAZIONI', 'Controllo tra 6 mesi.'].join('\n');
    const out = renderRubricDocSanitaria([doc({ documentId: 'fis', text })], DEFAULT_RUBRIC_POLICY);
    expect(out.markdown).toContain('Conclusioni: «Quadro clinico stabilizzato; si invia a valutazione otoneurologica.»');
    expect(out.markdown).toContain('Indicazioni: «Controllo tra 6 mesi.»');
    expect(out.markdown.split(/\s+/).length).toBeLessThan(380);
  });

  it('lettera in prosa con la sola rubrica "Si consiglia": il corpo (anamnesi e obiettività in prosa) entra prima delle indicazioni', () => {
    const text = ['Gentile Collega,', 'ho visitato oggi la paziente per esiti di frattura del capitello radiale destro. Riferisce dolore in flesso-estensione; obiettivamente instabilità in valgo del gomito, flessione completa e dolente a fine corsa, deficit estensorio minimo.', 'Si consiglia ciclo di onde d\'urto focali e tutore anti varo-valgo per 3 mesi.', 'Cordiali saluti'].join('\n');
    const out = renderRubricDocSanitaria([doc({ documentId: 'ort', text })], DEFAULT_RUBRIC_POLICY);
    expect(out.markdown).toContain('instabilità in valgo del gomito');
    expect(out.markdown).toContain('Indicazioni: «Si consiglia ciclo di onde d\'urto focali');
    expect(out.markdown.indexOf('instabilità')).toBeLessThan(out.markdown.indexOf('Indicazioni:'));
  });

  it('fascicolo di ricovero classificato "altro" (molte pagine, marcatori di cartella) è un contenitore: rimando alla lettera', () => {
    const pages = Array.from({ length: 20 }, (_, i) => ({ pageNumber: i + 1, ocrText: i === 0 ? 'RICOVERO IN REGIME DI DEGENZA ORDINARIA\nCARTELLA CLINICA\nDIAGNOSI\nFrattura del femore sinistro.' : `DIARIO CLINICO\ndecorso regolare giorno ${i + 1}\nCONSENSO INFORMATO\nfirmato` }));
    const fasc: RubricDocument = { documentId: 'fasc', documentType: 'altro', header: '**Documento sanitario, in data 16.07.2023:**', sortDate: '2023-07-16', pages };
    const lettera: RubricDocument = { documentId: 'let', documentType: 'lettera_dimissione', header: '**Lettera di dimissione, in data 25.07.2023:**', sortDate: '2023-07-25', pages: [{ pageNumber: 1, ocrText: 'DIAGNOSI DI DIMISSIONE\nFrattura del femore sinistro trattata.' }] };
    const out = renderRubricDocSanitaria([fasc, lettera], DEFAULT_RUBRIC_POLICY);
    expect(out.markdown).toContain('Fascicolo di ricovero agli atti (20 pagine): si riporta la lettera di dimissione.');
    expect(out.markdown).not.toContain('decorso regolare giorno 5');
  });

  it('impegnativa/ricetta SSN: una riga col quesito diagnostico, niente modulistica tra virgolette', () => {
    const text = ['QUESITO DIAGNOSTICO: 386.19 Altre vertigini periferiche (386.19)', 'N.CONFEZIONI/PRESTAZIONI: 1 TIPO RICETTA: Assist. SSN', 'CODICE AUTENTICAZIONE: 070420261540381650009402518258', 'DATA: 07/04/2026', 'COGNOME E NOME DEL MEDICO: DEMPROVA ANNA', 'Rilasciato ai sensi dell\'art.11, comma 16 del DL 31 mag 2010'].join('\n');
    const out = renderRubricDocSanitaria([doc({ documentId: 'ric', text })], DEFAULT_RUBRIC_POLICY);
    expect(out.markdown).toContain('Impegnativa');
    expect(out.markdown).toContain('386.19 Altre vertigini periferiche');
    expect(out.markdown).not.toContain('TIPO RICETTA');
    expect(out.markdown).not.toContain('CODICE AUTENTICAZIONE');
  });
});

describe('renderRubricDocSanitaria — giro 8, avversariale: nomi soli nel preambolo, avvisi di cassa', () => {
  it('nel preambolo di un referto sottile le righe con il solo nome (periziando, direttore) non entrano; "Ulna integra" sì', () => {
    const text = ['OSPEDALE CIVILE DI CITTÀDEMO', 'DEMPROVA MARIA', 'Campi polmonari ipoespansi.', 'Ulna integra', 'Mario Demprova', 'RX TORACE:', 'I'].join('\n');
    const out = renderRubricDocSanitaria([doc({ documentId: 'rxt', documentType: 'esame_strumentale', text })], DEFAULT_RUBRIC_POLICY);
    expect(out.markdown).toContain('Campi polmonari ipoespansi.');
    expect(out.markdown).toContain('Ulna integra');
    expect(out.markdown).not.toContain('DEMPROVA MARIA');
    expect(out.markdown).not.toContain('Mario Demprova');
  });
  it('"Guaribile in giorni | clinici 30" resta (prognosi), l\'avviso di cassa "entro 30 giorni" no', () => {
    const text = ['PROGNOSI', 'Guaribile in giorni | clinici 30', 'Gli esami non allegati devono essere ritirati alla cassa entro 30 giorni, pena il pagamento della tariffa.'].join('\n');
    const out = renderRubricDocSanitaria([doc({ documentId: 'ps', documentType: 'cartella_clinica', text })], DEFAULT_RUBRIC_POLICY);
    expect(out.markdown).toContain('Guaribile in giorni | clinici 30');
    expect(out.markdown).not.toContain('cassa');
  });
});

describe('giro avversariale sul lotto 2 (renderer)', () => {
  it('tabella a una cella: il campo di modulo esce, la riga clinica lunga resta', () => {
    const text = ['ANAMNESI', 'Anamnesi | Caduta accidentale in bicicletta con trauma del polso destro', 'Provenienza: | PRONTO SOCCORSO', 'Data Esame | 16/07/2023', 'DIAGNOSI', 'Frattura del radio.'].join('\n');
    const out = renderRubricDocSanitaria([doc({ documentId: 'ps', documentType: 'cartella_clinica', text })], DEFAULT_RUBRIC_POLICY);
    expect(out.markdown).toContain('Caduta accidentale in bicicletta con trauma del polso destro');
    expect(out.markdown).not.toContain('Provenienza');
    expect(out.markdown).not.toContain('16/07/2023');
  });
  it('una lettera che "rilascia impegnativa" NON è un\'impegnativa: il referto resta', () => {
    const text = ['ANAMNESI', 'Dolore al gomito destro persistente da tre mesi.', 'ESAME OBIETTIVO', 'Instabilità in valgo, flessione completa e dolente.', 'INDICAZIONI', 'Si rilascia impegnativa per RM gomito destro con priorità B.'].join('\n');
    const out = renderRubricDocSanitaria([doc({ documentId: 'ort', text })], DEFAULT_RUBRIC_POLICY);
    expect(out.markdown).not.toContain('Impegnativa/prescrizione SSN agli atti');
    expect(out.markdown).toContain('Instabilità in valgo');
  });
});

describe('giro avversariale — campi di modulo a una cella con valore lungo', () => {
  it('"Provenienza: | MDA PRONTO SOCCORSO GENERALE E TRAUMA CENTER" e "Data ed Ora dimissione dal P.S. | Codice di uscita" escono', () => {
    const text = ['REFERTO', 'Provenienza: | MDA PRONTO SOCCORSO GENERALE E TRAUMA CENTER BT', 'Data ed Ora dimissione dal P.S. | Codice di uscita', 'Frattura composta del radio distale.'].join('\n');
    const out = renderRubricDocSanitaria([doc({ documentId: 'rx', documentType: 'esame_strumentale', text })], DEFAULT_RUBRIC_POLICY);
    expect(out.markdown).toContain('Frattura composta del radio distale.');
    expect(out.markdown).not.toContain('Provenienza');
    expect(out.markdown).not.toContain('Codice di uscita');
  });
});

describe('ordine a parità di data: referti prima del fascicolo, indipendente dall\'ordine di lettura', () => {
  it('lo stesso giorno l\'RX ha il suo blocco e il fascicolo lo segna come già riprodotto, in qualunque ordine arrivino', () => {
    const pages = (n: number, text: string) => Array.from({ length: n }, (_, i) => ({ pageNumber: i + 1, ocrText: i === 0 ? text : `DIARIO\ndecorso regolare giorno ${i + 1}` }));
    const fasc: RubricDocument = { documentId: 'zz-fasc', documentType: 'cartella_clinica', header: '**Cartella clinica, in data 16.07.2023:**', sortDate: '2023-07-16', pages: pages(12, 'CARTELLA CLINICA\nRX FEMORE SN\nFrattura pluriframmentata del terzo prossimale della diafisi femorale.') };
    const rx: RubricDocument = { documentId: 'aa-rx', documentType: 'esame_strumentale', header: '**Referto RX, in data 16.07.2023:**', sortDate: '2023-07-16', pages: [{ pageNumber: 1, ocrText: 'RX FEMORE SN\nFrattura pluriframmentata del terzo prossimale della diafisi femorale.' }] };
    const lettera: RubricDocument = { documentId: 'let', documentType: 'lettera_dimissione', header: '**Lettera, in data 25.07.2023:**', sortDate: '2023-07-25', pages: [{ pageNumber: 1, ocrText: 'DIAGNOSI DI DIMISSIONE\nFrattura trattata.' }] };
    const a = renderRubricDocSanitaria([fasc, rx, lettera], DEFAULT_RUBRIC_POLICY).markdown;
    const b = renderRubricDocSanitaria([lettera, rx, fasc], DEFAULT_RUBRIC_POLICY).markdown;
    expect(a).toBe(b);
    expect(a.indexOf('**Referto RX')).toBeLessThan(a.indexOf('**Cartella clinica'));
    expect(a.match(/Frattura pluriframmentata del terzo prossimale/g)).toHaveLength(1);
  });
});
