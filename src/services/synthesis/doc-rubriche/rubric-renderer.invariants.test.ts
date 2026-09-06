import { describe, it, expect } from 'vitest';
import { renderRubricDocSanitaria, type RubricDocument } from './rubric-renderer';
import { DEFAULT_RUBRIC_POLICY, RUBRIC_EXCLUDED_DOC_TYPES } from './rubric-policy';

/**
 * Invarianti del renderer (verifica definitiva 2026-09-06), su testi OCR
 * casuali con seme fisso (rubriche, tabelle, anagrafica, garble, manoscritti):
 * mai un codice fiscale o una data di nascita nel depositabile, mai una «…»
 * vuota, mai una citazione fatta di soli marker, mai un documento perso, mai
 * un'eccezione. Fixture interamente fittizie.
 */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 0x100000000; };
}
const pick = <T,>(r: () => number, a: readonly T[]): T => a[Math.floor(r() * a.length)]!;

const HEADINGS = ['ANAMNESI', 'ESAME OBIETTIVO', 'DIAGNOSI', 'PROGNOSI', 'TERAPIA', 'INDICAZIONI', 'REFERTO', 'CONCLUSIONI', 'DIARIO CLINICO', 'INTERVENTO', 'Diagnosi:', 'Si consiglia', 'RX POLSO DX:', 'Notizie cliniche:', 'TRIAGE', 'ESAMI EMATOCHIMICI'];
const CLINICAL = [
  'Frattura composta del radio distale destro.', 'Polso tumefatto e dolente, non deficit neurovascolari.', 'Giorni 30 salvo complicazioni.',
  'Paracetamolo 1000 mg al bisogno.', 'Controllo ortopedico tra 7 giorni.', 'Esiti di frattura.', 'Tachicardia sinusale.', 'Non lesioni ossee traumatiche.',
  'Riferisce caduta accidentale in bicicletta con trauma del polso destro.', 'Guaribile in giorni | clinici 30', 'Prognosi confermata fino al 30/06/2025.',
  'Alla visita ortopedica: "Clinicamente cicatrici in ordine.', 'Si consiglia - proseguire FKT; graduale dismissione delle stampelle"', 'Ulna integra',
];
const NOISE = [
  'Codice fiscale: DMPMRA70A41C890X', 'Nata a Cittàdemo il 01/01/1970, residente in via degli Esempi 1', 'Tel. 045 000000 - email: demo@esempio.it',
  'Firmato digitalmente', 'Pagina 1 di 2', 'Equipe Medica: Dr. Mario Demprova Dr.ssa Anna Demprova', '25mm/s 10mm/mV 150Hz CID: 1',
  'EID: 68 EDT: 21:58 ORDINE: H0000001 CONTO: DMPMRA70A41C890X VISITA: S6YG0P', '01-gen-1970 (55 anni)', 'Nr. Radiologico: | 2023/45615',
  'Data nascita: | 01/01/1970', 'Provenienza: | PRONTO SOCCORSO', 'Il Medico:', 'orario (lun-ven) 7.00-19.00', 'Prenotazione TC/RM: 045000000',
  '^{}[]', 'Protocollo: INPS.9000.19/06/2025.0000000', 'Cittàdemo, 24 giugno 2025', 'In fede', 'OSPEDALE CIVILE DI CITTÀDEMO', 'Referto Firmato Digitalmente',
  '[tbl-0.html](tbl-0.html)', '<table><tr><td>Referto</td><td>Frattura del femore.</td></tr></table>', '| Data | Esito |', '|---|---|',
];
const GARBLE = ['[ILLEGGIBILE] Nella', 'Cansello.[ILLEGGIBILE] odierne le', '[ILLEGGIBILE]', 'ottime [ILLEGGIBILE] orse', '[ILLEGGIBILE][ILLEGGIBILE] 1.'];
const TYPES = ['referto_specialistico', 'esame_strumentale', 'cartella_clinica', 'lettera_dimissione', 'certificato', 'altro', 'esame_laboratorio', 'spese_mediche'];

function randomDoc(r: () => number, id: number): RubricDocument {
  const nLines = 1 + Math.floor(r() * 40);
  const lines: string[] = [];
  for (let i = 0; i < nLines; i++) {
    const x = r();
    lines.push(x < 0.25 ? pick(r, HEADINGS) : x < 0.65 ? pick(r, CLINICAL) : x < 0.9 ? pick(r, NOISE) : pick(r, GARBLE));
  }
  const nPages = 1 + Math.floor(r() * (r() < 0.1 ? 15 : 2));
  const perPage = Math.ceil(lines.length / nPages);
  const pages = Array.from({ length: nPages }, (_, p) => ({ pageNumber: p + 1, ocrText: lines.slice(p * perPage, (p + 1) * perPage).join('\n') }));
  const y = 2024 + Math.floor(r() * 3); const m = 1 + Math.floor(r() * 12); const d = 1 + Math.floor(r() * 28);
  return { documentId: `d${id}`, documentType: pick(r, TYPES), header: `**Documento ${id}, in data ${String(d).padStart(2, '0')}.${String(m).padStart(2, '0')}.${y}:**`, sortDate: `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`, pages };
}

const CF_RE = /\b[A-Z]{6}\d{2}[A-Z]\d{2}[A-Z]\d{3}[A-Z]\b/;

describe('invarianti — renderer rubriche (fuzz, seme fisso, 1500 documenti)', () => {
  it('mai CF/anagrafica/recapiti/equipe nel depositabile, mai «» vuote o di soli marker, ogni documento con testo produce un blocco, mai eccezioni', () => {
    const r = rng(20260907);
    for (let i = 0; i < 300; i++) {
      const docs = Array.from({ length: 1 + Math.floor(r() * 5) }, (_, k) => randomDoc(r, i * 10 + k));
      let out;
      expect(() => { out = renderRubricDocSanitaria(docs, DEFAULT_RUBRIC_POLICY); }).not.toThrow();
      const md = out!.markdown;
      expect(md, 'codice fiscale').not.toMatch(CF_RE);
      expect(md, 'data di nascita').not.toMatch(/01\/01\/1970|\(55 anni\)|Nata a Cittàdemo/);
      expect(md, 'recapiti').not.toMatch(/045 000000|demo@esempio\.it/);
      expect(md, 'equipe').not.toMatch(/Equipe Medica/i);
      expect(md, 'header macchina').not.toMatch(/mm\/s|CONTO:|ORDINE:/);
      expect(md, 'html/markdown residuo').not.toMatch(/<table|<td|\[tbl-|\|---\|/);
      expect(md, 'citazione vuota').not.toMatch(/«\s*»/);
      expect(md, 'citazione di soli marker').not.toMatch(/«(\s*\[ILLEGGIBILE\]\s*)+»/);
      expect(md, 'undefined/NaN').not.toMatch(/undefined|NaN|\[object/);
      // Ogni documento non escluso per tipo produce un blocco (mai perdere un documento):
      // i non-certificati hanno un'intestazione propria; i certificati o propria o aggregata.
      const expected = docs.filter((d) => !RUBRIC_EXCLUDED_DOC_TYPES.has(d.documentType ?? '') && d.documentType !== 'esame_laboratorio');
      const headers = (md.match(/^\*\*Documento \d+, in data/gm) ?? []).length;
      const aggregated = Number(/\*\*Certificati medici \((\d+)\)/.exec(md)?.[1] ?? 0);
      const certs = expected.filter((d) => d.documentType === 'certificato').length;
      expect(headers, 'documento non-certificato perso').toBeGreaterThanOrEqual(expected.length - certs);
      expect(headers + aggregated, 'certificato perso').toBeGreaterThanOrEqual(expected.length);
      expect(out!.blocks).toBeGreaterThanOrEqual(headers);
    }
  });

  it('idempotenza e determinismo: stesso input → stesso output; ordine cronologico dei blocchi', () => {
    const r = rng(7);
    for (let i = 0; i < 200; i++) {
      const docs = Array.from({ length: 2 + Math.floor(r() * 4) }, (_, k) => randomDoc(r, i * 10 + k));
      const a = renderRubricDocSanitaria(docs, DEFAULT_RUBRIC_POLICY).markdown;
      const b = renderRubricDocSanitaria([...docs].reverse(), DEFAULT_RUBRIC_POLICY).markdown;
      expect(a).toBe(b);
      const dates = [...a.matchAll(/^\*\*Documento \d+, in data (\d{2})\.(\d{2})\.(\d{4}):\*\*/gm)].map((m) => `${m[3]}-${m[2]}-${m[1]}`);
      for (let k = 1; k < dates.length; k++) expect(dates[k]! >= dates[k - 1]!, 'ordine cronologico').toBe(true);
    }
  });
});
