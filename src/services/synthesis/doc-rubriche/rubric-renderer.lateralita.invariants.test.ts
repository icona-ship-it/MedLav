import { describe, it, expect } from 'vitest';
import { renderRubricDocSanitaria, type RubricDocument } from './rubric-renderer';
import { DEFAULT_RUBRIC_POLICY } from './rubric-policy';

/**
 * INVARIANTI LATERALITÀ — renderer per rubriche (audit 2026-09-10).
 *
 * Il renderer COPIA il testo del medico dentro le «…»: un lato presente nel
 * testo OCR deve restare nella citazione, mai sparire per dedup, per pulizia
 * del rumore amministrativo o per fusione di righe. Percorso reale:
 * generate-report → DOC_SANITARIA (rubriche) espanso a lettura (UI, export
 * HTML/DOCX, link pubblico) via formatDocumentazioneSanitariaRubriche.
 * Fixture interamente fittizie.
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

const SIDE_RE = /\b(dx|sx|sn|ds|destr[oaie]|sinistr[oaie]|bilateral[ei])\b/gi;
const sideOf = (w: string): string => /^bilateral/i.test(w) ? 'bil' : /^(dx|ds|destr)/i.test(w) ? 'dx' : 'sx';
const sidesIn = (s: string): string[] => (s.match(SIDE_RE) ?? []).map(sideOf);

const doc = (id: string, type: string, text: string, date = '2026-02-10'): RubricDocument => ({
  documentId: id, documentType: type, header: `**Doc ${id}, in data 10.02.2026:**`, sortDate: date, pages: [{ pageNumber: 1, ocrText: text }],
});

// 51 parole di boilerplate radiologico SENZA parole-chiave di rumore (protocollo, firma, ...).
const BOILER = 'Esame radiografico del segmento scheletrico eseguito nelle proiezioni standard antero posteriore e laterale con apparecchiatura digitale diretta e successivo confronto con i precedenti radiogrammi disponibili che mostra regolare mineralizzazione ossea e conservati rapporti articolari senza evidenza di alterazioni strutturali significative a carico delle componenti ossee esaminate ed in particolare si segnala';

describe('dedup: due referti identici tranne il lato sono DUE referti', () => {
  // Classe coperta (audit 2026-09-10): chiave di dedup sull'incipit (40 parole) — il referto "sinistro" viene dichiarato "Contenuto identico" e sparisce
  it('boilerplate identico nelle prime 40 parole, lato diverso dopo: entrambi i lati nel depositabile', () => {
    const out = renderRubricDocSanitaria([
      doc('a', 'esame_strumentale', `${BOILER}\nFrattura composta del radio distale destro.`),
      doc('b', 'esame_strumentale', `${BOILER}\nFrattura composta del radio distale sinistro.`),
    ], DEFAULT_RUBRIC_POLICY);
    expect(out.markdown, 'sanity: il boilerplate è citato (non scartato come rumore)').toContain('Esame radiografico del segmento');
    expect(out.markdown).not.toContain('Contenuto identico');
    expect(sidesIn(out.markdown).sort()).toEqual(['dx', 'sx']);
  });
});

describe('etichette di lato: mai perse né riattribuite', () => {
  // Classe coperta (audit 2026-09-10): "Ginocchio sx:" da sola su una riga è scartata come etichetta orfana → i reperti dei due lati si fondono
  it('referto bilaterale con "Ginocchio dx:" / "Ginocchio sx:" su righe proprie: entrambi i lati restano nella citazione', () => {
    const out = renderRubricDocSanitaria([
      doc('rx', 'esame_strumentale', 'RX GINOCCHIA\nGinocchio dx:\nNon lesioni ossee di natura traumatica.\nGinocchio sx:\nFrattura del piatto tibiale laterale.'),
    ], DEFAULT_RUBRIC_POLICY);
    expect(out.markdown).toContain('Non lesioni ossee');
    expect(out.markdown).toContain('Frattura del piatto tibiale');
    expect(sidesIn(out.markdown)).toEqual(['dx', 'sx']);
    // il reperto "Frattura" deve stare DOPO l'etichetta sx, non sotto quella dx
    expect(out.markdown.indexOf('Frattura del piatto')).toBeGreaterThan(out.markdown.search(/\bsx\b/));
  });

  // Classe coperta (audit 2026-09-10): "DX:" / "SX:" orfane scartate (SHORT_ORPHAN_LABEL_RE) → lati persi
  it('etichette "DX:" e "SX:" su righe proprie in una consulenza: entrambi i lati restano', () => {
    const out = renderRubricDocSanitaria([
      doc('c', 'referto_specialistico', 'ESAME OBIETTIVO\nDX:\nSpalla libera, non dolente.\nSX:\nSpalla dolente alla abduzione oltre 90 gradi.\nDIAGNOSI\nTendinopatia della cuffia.'),
    ], DEFAULT_RUBRIC_POLICY);
    expect(out.markdown).toContain('Spalla dolente');
    expect(sidesIn(out.markdown)).toEqual(['dx', 'sx']);
  });

  // Classe coperta (audit 2026-09-10): codice lungo + titolo d'esame maiuscolo sulla stessa riga → scrubInlineCodes mangia "RX POLSO DX"
  it('accession number seguito dal titolo d\'esame con lato: il titolo e il lato restano', () => {
    const out = renderRubricDocSanitaria([
      doc('r', 'referto_specialistico', 'DIAGNOSI\nAccession 12345678 RX POLSO DX: frattura composta del radio distale.'),
    ], DEFAULT_RUBRIC_POLICY);
    expect(out.markdown).not.toContain('12345678');
    expect(out.markdown).toMatch(/RX POLSO DX/);
    expect(sidesIn(out.markdown)).toEqual(['dx']);
  });
});

describe('fuzz (seme fisso, 500 documenti): la diagnosi citata conserva il lato del testo OCR; nessun lato inventato', () => {
  const SENTENCES = [
    'Frattura composta del radio distale {side}.', 'Distorsione della caviglia {side} con edema perimalleolare.',
    'Lesione del menisco mediale del ginocchio {side}.', 'Trauma contusivo della spalla {side}, non fratture.',
    'Esiti di frattura del femore {side} trattata con osteosintesi.', 'Frattura {side} del malleolo peroneale, composta.',
    'Sospetta lesione del legamento crociato anteriore {side}.', 'Gonalgia {side} post-traumatica con versamento articolare.',
  ];
  const SIDES = ['dx', 'sx', 'sn', 'destro', 'sinistro', 'destra', 'sinistra', 'DX', 'SX', 'bilaterale'];
  const NOISE = [
    'Codice fiscale: DMPMRA70A41C890X', 'Nata a Cittàdemo il 01/01/1970, residente in via degli Esempi 1', 'Tel. 045 000000 - email: demo@esempio.it',
    'Firmato digitalmente', 'Pagina 1 di 2', 'Equipe Medica: Dr. Mario Demprova', 'Nr. Radiologico: | 2023/45615', 'Data nascita: | 01/01/1970',
    'Il Medico:', 'OSPEDALE CIVILE DI CITTÀDEMO', 'Referto Firmato Digitalmente', '| Data | Esito |', '|---|---|', '^{}[]', 'In fede', 'Protocollo: 9000.19/06/2025',
  ];
  const OTHER = ['ANAMNESI', 'Riferisce caduta accidentale in bicicletta.', 'ESAME OBIETTIVO', 'Tumefazione e dolore alla palpazione.', 'PROGNOSI', 'Giorni 30 salvo complicazioni.', 'TERAPIA', 'Paracetamolo 1000 mg al bisogno.'];

  it('la citazione della Diagnosi ha esattamente il lato del testo; l\'output non contiene lati assenti dall\'input', () => {
    const r = mulberry32(20260910);
    for (let i = 0; i < 500; i++) {
      const side = pick(r, SIDES);
      const diag = pick(r, SENTENCES).replace('{side}', side);
      const lines: string[] = [];
      for (let k = 0; k < 4 + Math.floor(r() * 8); k++) lines.push(r() < 0.5 ? pick(r, NOISE) : pick(r, OTHER));
      lines.push('DIAGNOSI', diag);
      for (let k = 0; k < Math.floor(r() * 4); k++) lines.push(pick(r, NOISE));
      const type = pick(r, ['referto_specialistico', 'lettera_dimissione', 'altro', 'esame_strumentale']);
      const text = lines.join('\n');
      const out = renderRubricDocSanitaria([doc(`d${i}`, type, text)], DEFAULT_RUBRIC_POLICY);
      const inputSides = new Set(sidesIn(text));
      for (const s of sidesIn(out.markdown)) expect(inputSides.has(s), `lato inventato "${s}" (doc ${i})`).toBe(true);
      const cited = out.markdown.includes(diag.replace(/\.$/, ''));
      expect(cited, `diagnosi con lato "${side}" non citata (tipo ${type}, doc ${i}):\n${out.markdown}`).toBe(true);
    }
  });
});
