import { describe, it, expect } from 'vitest';
import { anonymizeText } from './anonymizer';
import type { PeriziaMetadata } from '@/types';

/**
 * INVARIANTI ANONIMIZZAZIONE (audit 2026-09-10) — "cosa non deve succedere MAI"
 * nell'export anonimizzato: (a) il periziando (nome, data di nascita, CF,
 * indirizzo, telefono) non sopravvive in NESSUNA variante; (b) l'anonimizzatore
 * non altera in silenzio numeri, importi, lateralità e testo clinico che PII
 * non è. Fuzz a seme fisso, universo fittizio Cittàdemo/Demprova/via degli Esempi.
 * Requisito: DPIA §5.6 (CF, telefoni, email, nomi di parti e professionisti
 * rimossi), CLAUDE.md "zero errori silenziosi". Le date cliniche sono redatte
 * per scelta di prodotto (ADR: "anche le date ISO ora redatte") — NON testate
 * come "da preservare".
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
const esc = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** Contenimento come PAROLA, Unicode-aware (il `\b` di JS è ASCII-only). */
const hasWord = (text: string, w: string): boolean => new RegExp(`(?<![\\p{L}])${esc(w)}(?![\\p{L}])`, 'u').test(text);
const hasFullName = (text: string, n: string, c: string): boolean =>
  new RegExp(`${esc(n)}\\s+${esc(c)}|${esc(c)}\\s+${esc(n)}`, 'iu').test(text);

const pm = (over: Partial<PeriziaMetadata> = {}): PeriziaMetadata => ({ patientFullName: 'Testina Demprova', ...over });

/** [nome, cognome] fittizi, tutti token ≥ 4 caratteri (limite dichiarato del token-expansion). */
const NAMES: ReadonlyArray<readonly [string, string]> = [
  ['Testina', 'Demprova'], ['Mario', 'Esempi'], ['Anna', 'Provetti'], ['Carla', 'Fittizia'],
  ['Luca', 'Campione'], ['Giulia', 'Modello'], ['Paolo', 'Simulato'], ['Elena', 'Dimostra'],
];
const VARIANTS: ReadonlyArray<(n: string, c: string) => string> = [
  (n, c) => `${n} ${c}`,
  (n, c) => `${c} ${n}`,
  (n, c) => `${c.toUpperCase()} ${n.toUpperCase()}`,
  (n, c) => `${n.toUpperCase()} ${c.toUpperCase()}`,
  (n, c) => `Sig.ra ${n} ${c}`,
  (n, c) => `Sig. ${c} ${n}`,
  (n, c) => `del sig. ${c}`,
  (n, c) => `della sig.ra ${n} ${c}`,
  (_n, c) => c.toUpperCase(),
  (_n, c) => c,
  (n, c) => `il periziando ${n} ${c}`,
  (n, c) => `Paziente: ${c.toUpperCase()} ${n}`,
  (n, c) => `${c} ${n} nato/a il 15/05/1985`,
  (n, c) => `| ${c} ${n} | 15/05/1985 |`,
  (n, c) => `<td>${c.toUpperCase()}</td><td>${n}</td>`,
  (n, c) => `[ILLEGGIBILE] ${c} [...] ${n}`,
  (n, c) => `<!--MEDLAV--> ${c} ${n}`,
  (n, c) => `Cognome e nome: ${c} ${n}`,
  (n, c) => `${c},${n}`,
  (n, c) => `${c}\n${n}`,
];
/** Testo clinico SENZA PII: numeri, importi, lateralità, misure, marker OCR. */
const CLINICAL: readonly string[] = [
  'Frattura composta del radio distale sinistro.', 'PA 130/80 mmHg, FC 72 bpm, SpO2 98%.',
  'Hb 12,5 g/dl; PLT 250.000/mmc; INR 1,1.', 'Spesa documentata € 1.250,00 (fattura n. 128).',
  'ITT 30 giorni, ITP al 50% 20 giorni, ITP al 25% 10 giorni.', 'Rachialgia L4-L5 e C5-C6 con irradiazione dx.',
  'Ketoprofene 100 mg 1 cp x 2/die per 7 giorni.', 'Flessione 0-110°, estensione -5°.',
  'Lesione di 3 mm; edema di 0,5 cm; versamento 15 ml.', 'Barthel 85/100; NRS 6/10.',
  'Ricovero di 3 giorni in Ortopedia e Traumatologia.', 'ECG: ritmo sinusale 25mm/s 10mm/mV.',
  'Ginocchio destro: Lachman positivo, cassetto anteriore ++.', 'Somministrati 1000 mg di paracetamolo ev.',
  '| Esame | Esito |', '|---|---|', '<br/>', '[ILLEGGIBILE]', 'RX POLSO DX: non lesioni ossee.', 'Guaribile in gg 30.',
];

describe('invarianti anonimizzazione — nome del periziando in ogni variante (fuzz, seme fisso)', () => {
  it('nome e cognome dei metadati non sopravvivono in nessuna variante (maiuscolo, invertito, titolo, possessivo, isolato, tabella, tag, marker) — 400 casi', () => {
    const r = mulberry32(20260910);
    for (let i = 0; i < 400; i++) {
      const [n, c] = pick(r, NAMES);
      const k = 3 + Math.floor(r() * 8);
      const parts = Array.from({ length: k }, () => (r() < 0.5 ? pick(r, VARIANTS)(n, c) : pick(r, CLINICAL)));
      const text = parts.join(pick(r, [' ', '\n', ' — ', '. ']));
      const meta = pm({ patientFullName: r() < 0.5 ? `${n} ${c}` : `${c} ${n}` });
      const out = anonymizeText({ text, periziaMetadata: meta }).anonymizedText;
      for (const w of [n, c, n.toUpperCase(), c.toUpperCase()]) {
        expect(hasWord(out, w), `caso ${i}: token «${w}» sopravvissuto in:\n${out}`).toBe(false);
      }
      expect(hasFullName(out, n, c), `caso ${i}: nome completo sopravvissuto in:\n${out}`).toBe(false);
    }
  });

  // AUDIT 2026-09-10 ROSSO (trovato dal fuzz, caso 50): nome completo in
  // MINUSCOLO e in ordine INVERTITO rispetto ai metadati («giulia modello» con
  // patientFullName «Modello Giulia») sopravvive — il match letterale (anonymizer.ts:234)
  // non costruisce la forma invertita, il token-expansion (:255-261) è case-sensitive
  // e la propagazione (:477-515) copre solo i nomi rilevati da un trigger. Firma
  // «in fede, giulia modello» a fine referto = leak. Percorso: export html/docx/csv.
  it('nome completo minuscolo in ordine invertito rispetto ai metadati («in fede, testina demprova» con «Demprova Testina»): redatto', () => {
    const out = anonymizeText({ text: 'Decorso regolare. In fede, testina demprova.', periziaMetadata: pm({ patientFullName: 'Demprova Testina' }) }).anonymizedText;
    expect(hasFullName(out, 'Testina', 'Demprova'), out).toBe(false);
  });

  // Classe coperta (audit 2026-09-10): token-expansion con `\b` ASCII-only — un nome/cognome
  // che FINISCE con lettera accentata (Nicolò, Demprovè) isolato nel testo non è
  // redatto (anonymizer.ts:261, `\\b(?:Cap|UPPER)\\b`): dopo «ò» non c'è confine
  // di parola per JS. Percorso: export html/docx/csv (anonymizeText con metadati).
  it('token accentato in finale (Nicolò, Demprovè) isolato: redatto come gli altri', () => {
    for (const [n, c] of [['Nicolò', 'Demprova'], ['Mario', 'Demprovè']] as const) {
      const text = `Il periziando ${n} ${c} riferisce dolore. Successivamente ${n} veniva dimesso; in calce ${c}.`;
      const out = anonymizeText({ text, periziaMetadata: pm({ patientFullName: `${n} ${c}` }) }).anonymizedText;
      expect.soft(hasWord(out, n), `«${n}» in: ${out}`).toBe(false);
      expect.soft(hasWord(out, c), `«${c}» in: ${out}`).toBe(false);
    }
  });

  it('cognome con apostrofo o trattino (D\'Esempi, Demprova-Esempi): redatto in ogni variante', () => {
    for (const [n, c] of [['Anna', "D'Esempi"], ['Mario', 'Demprova-Esempi']] as const) {
      const text = [`Sig.ra ${n} ${c}`, `${c.toUpperCase()} ${n.toUpperCase()}`, `del sig. ${c}`, `${c} ${n}`, c].join('. ');
      const out = anonymizeText({ text, periziaMetadata: pm({ patientFullName: `${n} ${c}` }) }).anonymizedText;
      expect.soft(hasWord(out, c), `«${c}» in: ${out}`).toBe(false);
      expect.soft(hasWord(out, c.toUpperCase()), `«${c.toUpperCase()}» in: ${out}`).toBe(false);
    }
  });

  // Classe coperta (audit 2026-09-10): varianti tipografiche dell'OCR — apostrofo curvo (’)
  // al posto di quello ASCII dei metadati e trattino perso/spaziato — il nome
  // sfugge sia al match letterale (anonymizer.ts:234) sia ai token (:254-261).
  it('OCR con apostrofo tipografico (D’ESEMPI) o trattino perso (DEMPROVA ESEMPI): il cognome dei metadati è comunque redatto', () => {
    const a = anonymizeText({ text: 'Paziente D’ESEMPI ANNA, poi D’Esempi.', periziaMetadata: pm({ patientFullName: "Anna D'Esempi" }) }).anonymizedText;
    expect.soft(/D[’']ESEMPI/u.test(a) || /D[’']Esempi/u.test(a), `apostrofo curvo: ${a}`).toBe(false);
    const b = anonymizeText({ text: 'Paziente DEMPROVA ESEMPI Mario; poi Demprova - Esempi.', periziaMetadata: pm({ patientFullName: 'Mario Demprova-Esempi' }) }).anonymizedText;
    expect.soft(hasWord(b, 'DEMPROVA') || hasWord(b, 'ESEMPI') || hasWord(b, 'Demprova'), `trattino perso: ${b}`).toBe(false);
  });
});

describe('invarianti anonimizzazione — anagrafica dai metadati (DOB, CF, telefono, indirizzo)', () => {
  const META = pm({
    patientFullName: 'Testina Demprova', patientDateOfBirth: '1985-05-15', patientFiscalCode: 'DMPTSN85E55H501X',
    patientAddress: 'via degli Esempi 12, 37100 Cittàdemo', patientPhone: '333 1234567',
  });

  it('data di nascita nei 4 formati canonici (15/05/1985, 15.05.1985, 1985-05-15, 15 maggio 1985) + varianti: mai in chiaro', () => {
    const forms = ['15/05/1985', '15.05.1985', '15-05-1985', '1985-05-15', '15 maggio 1985', '15 Maggio 1985', '15/5/1985'];
    const text = forms.map((f) => `nato/a il ${f}`).join('; ');
    const out = anonymizeText({ text, periziaMetadata: META }).anonymizedText;
    for (const f of forms) expect.soft(out.includes(f), `DOB «${f}» in: ${out}`).toBe(false);
    expect(out).toMatch(/\[DATA_\d+\]/);
  });

  // Classe coperta (audit 2026-09-10): patientDateOfBirth dei metadati NON è usata
  // dall'anonimizzatore (buildNameReplacements, anonymizer.ts:564-605: solo nomi);
  // le forme compatte dell'OCR (anno a 2 cifre, mese abbreviato) sfuggono ai
  // regex DATE_* (:73-88) e la data di nascita esce in chiaro.
  it('data di nascita dei metadati in forma compatta/abbreviata (15/05/85, 15.5.85, 15 mag 1985, 15-5-85): mai in chiaro', () => {
    const forms = ['15/05/85', '15.5.85', '15 mag 1985', '15 mag. 85', '15-5-85'];
    const text = forms.map((f) => `nata il ${f}`).join('; ');
    const out = anonymizeText({ text, periziaMetadata: META }).anonymizedText;
    for (const f of forms) expect.soft(out.includes(f), `DOB compatta «${f}» in: ${out}`).toBe(false);
  });

  it('codice fiscale (maiuscolo, minuscolo, con etichetta C.F.): mai in chiaro', () => {
    const forms = ['DMPTSN85E55H501X', 'dmptsn85e55h501x', 'C.F. DMPTSN85E55H501X', 'CF: DMPTSN85E55H501X'];
    const out = anonymizeText({ text: forms.join(' — '), periziaMetadata: META }).anonymizedText;
    expect(out.toLowerCase()).not.toContain('dmptsn85e55h501x');
    expect(out).toMatch(/\[CF_\d+\]/);
  });

  // Classe coperta (audit 2026-09-10): patientFiscalCode dei metadati non è usato dal
  // matcher (anonymizer.ts:564-605); un CF spaziato dall'OCR («DMPTSN 85E55 H501X»,
  // come stampato sulla tessera) non combacia con CF_REGEX (:52) ed esce in chiaro.
  it('codice fiscale dei metadati spaziato dall\'OCR (DMPTSN 85E55 H501X): mai in chiaro', () => {
    const out = anonymizeText({ text: 'C.F. DMPTSN 85E55 H501X, residente a Cittàdemo.', periziaMetadata: META }).anonymizedText;
    expect(out.replace(/\s+/g, '')).not.toContain('DMPTSN85E55H501X');
  });

  it('telefono nei formati comuni (+39, spazi, punti, prefisso fisso): mai in chiaro', () => {
    const forms = ['333 1234567', '+39 333 1234567', '3331234567', '333.123.4567', '045 8012345', '0458012345', '+39 045 8012345'];
    const text = forms.map((f) => `tel. ${f}`).join('; ');
    const out = anonymizeText({ text, periziaMetadata: META }).anonymizedText;
    for (const f of forms) expect.soft(out.includes(f), `telefono «${f}» in: ${out}`).toBe(false);
  });

  it('indirizzo: la via dei metadati (via degli Esempi 12) non sopravvive, in minuscolo, maiuscolo o con "n."', () => {
    const forms = ['via degli Esempi 12', 'VIA DEGLI ESEMPI 12', 'Via degli Esempi n. 12', 'via degli Esempi, 12'];
    const text = forms.map((f) => `residente in ${f}`).join('; ');
    const out = anonymizeText({ text, periziaMetadata: META }).anonymizedText;
    for (const f of forms) expect.soft(out.includes(f), `via «${f}» in: ${out}`).toBe(false);
    expect.soft(hasWord(out, 'Esempi') || hasWord(out, 'ESEMPI'), `token via in: ${out}`).toBe(false);
  });

  // Classe coperta (audit 2026-09-10): patientAddress dei metadati non è usato dal matcher;
  // il regex ADDRESS (anonymizer.ts:105) ferma al civico e lascia in chiaro
  // CAP + comune di residenza del periziando («37100 Cittàdemo»), quasi-identificatore.
  it('indirizzo: CAP e comune di residenza dei metadati (37100 Cittàdemo) non sopravvivono accanto alla via redatta', () => {
    const out = anonymizeText({ text: 'residente in via degli Esempi 12, 37100 Cittàdemo', periziaMetadata: META }).anonymizedText;
    expect(out, `residuo indirizzo: ${out}`).not.toContain('37100');
  });
});

describe('invarianti anonimizzazione — il testo clinico NON PII resta identico', () => {
  it('numeri, importi, lateralità, misure, marker OCR: output === input (fuzz 300 casi)', () => {
    const r = mulberry32(777);
    for (let i = 0; i < 300; i++) {
      const k = 2 + Math.floor(r() * 12);
      const text = Array.from({ length: k }, () => pick(r, CLINICAL)).join(pick(r, [' ', '\n', ' | ', '\n\n']));
      const out = anonymizeText({ text, periziaMetadata: pm() }).anonymizedText;
      expect(out, `caso ${i}`).toBe(text);
    }
  });

  // Classe coperta (audit 2026-09-10): HOSPITAL_REGEX (anonymizer.ts:153) consuma fino a 40
  // caratteri DOPO il nome della struttura (`[^\.,;:\n]{2,40}` greedy): il testo
  // clinico che segue — qui la diagnosi e la lateralità — sparisce dentro
  // [STRUTTURA_N] senza avviso. Percorso: export html/docx (synthesis + full-HTML),
  // csv (descrizione), cronistoria (OCR e blocchi evento).
  it('struttura seguita da testo clinico: «per frattura del femore sinistro» sopravvive alla redazione della struttura', () => {
    const text = 'Ricoverato presso Ospedale Civile di Cittàdemo per frattura del femore sinistro con ITT 30 giorni.';
    const out = anonymizeText({ text, periziaMetadata: pm() }).anonymizedText;
    expect(out, out).toContain('per frattura del femore sinistro');
    expect(out).toContain('ITT 30 giorni');
  });

  // Classe coperta (audit 2026-09-10): ADDRESS_CAPS_REGEX (anonymizer.ts:110) legge
  // «FRAZIONE DI EIEZIONE 55» come indirizzo (tipo-via FRAZIONE + connettore DI +
  // nome + civico): il valore ecocardiografico sparisce in [INDIRIZZO_N].
  it('«FRAZIONE DI EIEZIONE 55 %» (ecocardiogramma OCR maiuscolo) non è un indirizzo: il valore resta', () => {
    const text = 'ECOCARDIOGRAMMA: FRAZIONE DI EIEZIONE 55 %, cinetica conservata.';
    const out = anonymizeText({ text, periziaMetadata: pm() }).anonymizedText;
    expect(out, out).toContain('55');
    expect(out).not.toContain('[INDIRIZZO');
  });

  // Classe coperta (audit 2026-09-10): CONTEXT_NAME_REGEX (anonymizer.ts:116) non ha `\b`
  // prima dei trigger: «attore » combacia dentro «Fattore » e le due parole
  // capitalizzate seguenti («Reumatoide Negativo») diventano [PERSONA_N].
  it('«Fattore Reumatoide Negativo» (referto di laboratorio Title Case) non è un nome: il risultato resta', () => {
    const text = 'Esami: Fattore Reumatoide Negativo; PCR 3 mg/l.';
    const out = anonymizeText({ text, periziaMetadata: pm() }).anonymizedText;
    expect(out, out).toContain('Reumatoide Negativo');
  });

  it('cognome contenuto in parola più lunga o in minuscolo comune (Costa/costale/costa, Bianchi/bianchi/Bianchini): intatto', () => {
    const text = 'Dolore costale; la costa VII è integra; globuli bianchi 8.000; il dott. Bianchini refertava.';
    const out = anonymizeText({ text, periziaMetadata: pm({ patientFullName: 'Mario Costa' }) }).anonymizedText;
    const out2 = anonymizeText({ text, periziaMetadata: pm({ patientFullName: 'Anna Bianchi' }) }).anonymizedText;
    for (const o of [out, out2]) {
      expect.soft(o).toContain('costale');
      expect.soft(o).toContain('la costa VII');
      expect.soft(o).toContain('globuli bianchi 8.000');
      expect.soft(o).toContain('Bianchini');
    }
  });

  it('immagine embedded: alt-text col nome redatto, base64 intatto', () => {
    const b64 = 'data:image/png;base64,iVBORw0KGgo3471234567AAAA1234567890shapeddigits15051985==';
    const text = `Referto. ![RX ginocchio destro di Testina Demprova del 15/05/1985](${b64}) Fine.`;
    const out = anonymizeText({ text, periziaMetadata: pm() }).anonymizedText;
    expect(out).toContain(b64);
    expect(hasWord(out, 'Demprova') || hasWord(out, 'Testina')).toBe(false);
    expect(out).toContain('RX ginocchio destro');
  });
});

describe('invarianti anonimizzazione — coerenza e scala', () => {
  // Classe coperta (audit 2026-09-10): la stessa persona esce con placeholder diversi —
  // il match letterale dei metadati usa il tracker ([PERSONA_N], anonymizer.ts:237),
  // il token-expansion usa «[PAZIENTE]» (:265), il titolo «Sig.» apre un terzo
  // [PERSONA_M]: chi legge l'anonimizzato vede 2-3 persone dove ce n'è una.
  it('stessa persona → stesso placeholder (nome completo, con titolo, cognome isolato)', () => {
    const text = 'Il sig. Testina Demprova è stato visitato. Testina Demprova riferisce dolore. Successivamente Demprova veniva dimesso.';
    const res = anonymizeText({ text, periziaMetadata: pm() });
    const labels = new Set(res.replacements.filter((x) => x.type === 'nome').map((x) => x.replacement));
    expect(labels, `placeholder per la stessa persona: ${[...labels].join(', ')} — ${res.anonymizedText}`).toHaveLength(1);
  });

  it('cartella enorme (400 pagine, ~450 KB, nome su ogni pagina): nessun leak e tempo < 20 s', { timeout: 60_000 }, () => {
    const r = mulberry32(99);
    const pages: string[] = [];
    for (let p = 1; p <= 400; p++) {
      const lines = Array.from({ length: 28 }, () => pick(r, CLINICAL));
      pages.push(`Pag. ${p}\nPaziente: DEMPROVA Testina nato/a il 15/05/1985\n${lines.join('\n')}\nIn fede, Demprova; visto Testina Demprova.`);
    }
    const text = pages.join('\n\n');
    expect(text.length).toBeGreaterThan(400_000);
    const t0 = Date.now();
    const out = anonymizeText({ text, periziaMetadata: pm() }).anonymizedText;
    const ms = Date.now() - t0;
    expect(ms, `tempo ${ms} ms`).toBeLessThan(20_000);
    expect(hasWord(out, 'Demprova') || hasWord(out, 'DEMPROVA') || hasWord(out, 'Testina')).toBe(false);
    expect(out).not.toContain('15/05/1985');
    expect(out.split('Pag. ').length).toBe(401);
  });
});
