/**
 * INVARIANTI EXPORT — markdown-to-html (audit lente EXPORT, 2026-09-10).
 *
 * L'HTML esportato (basic, professional e cronistoria) e il DOCX passano dallo
 * stesso markdown della sintesi. Qui si controlla "cosa non deve succedere MAI"
 * quando quel markdown attraversa markdownToHtml: una riga persa, un carattere
 * cambiato, un numero di elenco riscritto, una cella di tabella diversa da
 * quella che vede il DOCX. Fuzz a seme fisso (mulberry32), fixture fittizie
 * (Cittàdemo / Demprova / via degli Esempi).
 */
import { describe, it, expect } from 'vitest';
import { markdownToHtml } from './markdown-to-html';
import { parseMarkdownTable } from './docx-export';
import { renderHeaderMarkdown } from '@/services/synthesis/header-template';

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

/** Testo → come lo legge il medico: via i tag, entità decodificate, spazi normalizzati. */
function htmlToText(html: string): string {
  return html
    .replace(/<\/?(strong|em|b|i|u|span|img)\b[^>]*>/g, '') // inline: nessuno spazio inserito
    .replace(/<[^>]+>/g, ' ')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, '\'').replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}
const norm = (s: string): string => s.replace(/\s+/g, ' ').trim();

/** Righe "piane": nessuna sintassi markdown a inizio riga né inline — devono
 * uscire IDENTICHE (a meno degli spazi) in ogni formato. */
const PLAIN_LINES = [
  'Frattura composta del radio distale destro.',
  '«Rapporti articolari conservati; non lesioni ossee di natura traumatica»',
  'Temperatura 38,5 °C — PA 120/80 mmHg — SpO2 97 %',
  'Dosaggio 2,5 µg/kg; emoglobina 12 g/dl; ½ compressa',
  'L’esame obiettivo è negativo per deficit neurovascolari periferici',
  'Ospedale Civile di Cittàdemo, via degli Esempi 1',
  'DEMPROVA MARIA, nata a Cittàdemo il 01/01/1970',
  'Referto [ILLEGGIBILE] con parte mancante [...] poi «prosegue»',
  'Testo con <b>tag html</b> e <!--MEDLAV:CRONO--> marker residuo',
  'ESAME OBIETTIVO: TUMEFAZIONE E DOLORE ALLA PALPAZIONE DEL POLSO DX',
  'manoscritto: "gg 30 s.c." parzialmente illeggibile',
  'Prognosi ≥ 30 giorni, ≤ 40 giorni; PCR < 5 mg/l',
  'Diagnosi: "frattura" (virgolette dritte) & apostrofo dell\'ulna',
  'Il periziando riferisce dolore alla caviglia sinistra (sx), non destra (dx).',
  'A'.repeat(3000),
];

describe('invarianti export — markdownToHtml: nessuna riga e nessun carattere persi (fuzz, seme fisso)', () => {
  it('ogni riga piana esce identica (accenti, «», °, µ, ’, —, tag html, marker OCR) e in un blocco proprio', () => {
    const r = mulberry32(20260910);
    for (let i = 0; i < 500; i++) {
      const lines: string[] = [];
      const n = 1 + Math.floor(r() * 30);
      for (let k = 0; k < n; k++) {
        lines.push(pick(r, PLAIN_LINES));
        if (r() < 0.3) lines.push(''); // righe vuote: separano, non contano
      }
      const md = lines.join('\n');
      let html = '';
      expect(() => { html = markdownToHtml(md); }).not.toThrow();
      const text = htmlToText(html);
      const nonEmpty = lines.filter((l) => l.trim());
      for (const line of nonEmpty) {
        expect(text, `riga persa o alterata: ${line.slice(0, 60)}`).toContain(norm(line));
      }
      // Un blocco <p> per riga piana: nessuna fusione di due righe in una.
      expect((html.match(/<p>/g) ?? []).length, 'numero di paragrafi ≠ numero di righe').toBe(nonEmpty.length);
      expect(html).not.toMatch(/undefined|NaN|\[object/);
      // I tag html dell'OCR restano testo (mai eseguiti né persi).
      if (md.includes('<b>')) expect(html).toContain('&lt;b&gt;');
    }
  });

  it('documento enorme (2 MB, 40k righe): nessuna eccezione, nessuna riga persa', () => {
    const lines = Array.from({ length: 40000 }, (_, i) => `${PLAIN_LINES[i % (PLAIN_LINES.length - 1)]} #${i}`);
    const html = markdownToHtml(lines.join('\n'));
    expect((html.match(/<p>/g) ?? []).length).toBe(lines.length);
    expect(htmlToText(html)).toContain('#39999');
  });
});

describe('invarianti export — intestazione: una riga per dato (classe del bug f0fdcef)', () => {
  const md = renderHeaderMarkdown({
    perito: { nome: 'Dott. Mario Demprova', specializzazione: 'Specialista in Medicina Legale\nSpecialista in Ortopedia', iscrizioneAlbo: null, email: 'perito@esempio.it', pec: null },
    dataVisitaMedicoLegale: '01/09/2026',
    paziente: { nome: 'DEMPROVA Maria', luogoNascita: 'Cittàdemo', dataNascita: '01/01/1970', residenza: 'Cittàdemo, via degli Esempi 1', codiceFiscale: null, email: null, telefono: null, avvocato: 'Avv. Anna Demprova' },
    oggetto: { eventoIndice: 'trauma da caduta accidentale', dataEvento: '12/09/2025', ambito: 'rc_civile' },
  } as never);

  it('HTML export: ogni riga non vuota dell\'intestazione è un <p> a sé, nell\'ordine del template, nessuna persa', () => {
    const body = md.split('\n').slice(1); // via "## Intestazione"
    const lines = body.filter((l) => l.trim()).map((l) => norm(l.replace(/\*\*/g, '')));
    const html = markdownToHtml(body.join('\n'));
    const paragraphs = [...html.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/g)].map((m) => htmlToText(m[1]!));
    expect(paragraphs.length, 'righe fuse o perse').toBe(lines.length);
    lines.forEach((line, i) => expect(paragraphs[i], `riga ${i} fuori ordine`).toBe(line));
    // Nessun segnaposto perso: tanti marker nell'HTML quanti nel template.
    const expectedMarkers = (md.match(/\[da compilare dal perito\]/g) ?? []).length;
    expect(expectedMarkers).toBeGreaterThan(0);
    expect((htmlToText(html).match(/\[da compilare dal perito\]/g) ?? []).length).toBe(expectedMarkers);
  });
});

describe('invarianti export — numeri e segni del medico non cambiano in silenzio', () => {
  // Classe coperta (audit 2026-09-10): numerazione di elenco riscritta — "3." e "4." del
  // medico escono come "1." (basic) / "1)" (professional: counter-reset per <ol>)
  // perché markdownToHtml apre un nuovo <ol> senza start/value; il DOCX conserva
  // "3. " e "4. " (markdownToDocxParagraphs) e il viewer (GFM) emette start="3".
  it('un elenco numerato che parte da 3 conserva il 3 nell\'HTML (start/value o testo), come nel DOCX', () => {
    const md = 'Quesiti residui:\n3. Terzo quesito del perito\n\nNota intermedia.\n4. Quarto quesito del perito';
    const html = markdownToHtml(md);
    expect(html).toMatch(/start="3"|value="3"|3\.\s*Terzo/);
    expect(html).toMatch(/start="4"|value="4"|4\.\s*Quarto/);
  });

  it('enfasi markdown dentro una citazione «…» non spezza né altera il testo citato', () => {
    const r = mulberry32(7);
    const CITS = [
      '«Frattura **composta** del radio *distale* destro»',
      '«Diagnosi: __frattura__ _scomposta_ dell\'ulna»',
      '«**Prognosi**: giorni **30** salvo complicazioni; PA **120/80**»',
      '«Non *lesioni* ossee; *rapporti* articolari **conservati**»',
    ];
    for (let i = 0; i < 200; i++) {
      const line = `${pick(r, ['Diagnosi', 'Referto', 'Prognosi'])}: ${pick(r, CITS)}`;
      const text = htmlToText(markdownToHtml(line));
      const expected = norm(line.replace(/\*\*|__|\*|_/g, ''));
      expect(text).toBe(expected);
    }
  });

  // Classe coperta (audit 2026-09-10): underscore intraparola mangiati — "RM_GINOCCHIO_SX"
  // esce "RM<em>GINOCCHIO</em>SX" (testo letto: "RMGINOCCHIOSX"); stessa perdita
  // nel DOCX (parseInlineFormatting), mentre il viewer (CommonMark) li conserva.
  it('underscore intraparola (codici esame, nomi file) sopravvivono come nel viewer', () => {
    const line = 'Codice esame RM_GINOCCHIO_SX, file referto_2026_03.pdf, protocollo PS_0042';
    const text = htmlToText(markdownToHtml(line));
    expect(text).toContain('RM_GINOCCHIO_SX');
    expect(text).toContain('referto_2026_03.pdf');
  });

  // Classe coperta (audit 2026-09-10): segno di confronto a inizio riga inghiottito come
  // blockquote — "> 38 °C" diventa "38 °C" (HTML e DOCX: entrambi i parser
  // trattano `>` iniziale come citazione). Un valore clinico cambia senza avviso.
  it('una riga che inizia con "> <numero>" (confronto clinico) non perde il segno >', () => {
    const line = '> 38 °C persistente per tre giorni';
    const text = htmlToText(markdownToHtml(line));
    expect(text).toContain('> 38');
  });
});

describe('invarianti export — tabelle: HTML e DOCX vedono le stesse celle (fuzz, seme fisso)', () => {
  const CELLS = ['ITT al 100%', '10.01.2024', '**Totale**', '15 giorni', '', '€ 1.038,80', '«referto»', 'ITT \\| ITP', 'Ospedale Civile di Cittàdemo', 'µg/kg', 'dx', 'sx', '—'];

  it('stesse righe, stesse celle, stesso testo con e senza pipe finale; nessuna cella spostata', () => {
    const r = mulberry32(99);
    for (let i = 0; i < 300; i++) {
      const cols = 1 + Math.floor(r() * 5);
      const rows = 1 + Math.floor(r() * 6);
      const trailing = r() < 0.5;
      const mk = (cells: string[]): string => `| ${cells.join(' | ')}${trailing ? ' |' : ''}`;
      const data = Array.from({ length: rows }, () => Array.from({ length: cols }, () => pick(r, CELLS)));
      // L'ultima cella vuota senza pipe finale è ambigua in GFM: la evitiamo nel fuzz.
      for (const row of data) if (!trailing && row[cols - 1] === '') row[cols - 1] = 'x';
      const md = [mk(data[0]!), `|${'---|'.repeat(cols)}`, ...data.slice(1).map(mk)].join('\n');

      const html = markdownToHtml(md);
      const docxRows = parseMarkdownTable(md);
      const htmlRows = [...html.matchAll(/<tr>([\s\S]*?)<\/tr>/g)]
        .map((m) => [...m[1]!.matchAll(/<t[hd]>([\s\S]*?)<\/t[hd]>/g)].map((c) => htmlToText(c[1]!)));

      expect(htmlRows.length, 'righe HTML ≠ righe dati').toBe(rows);
      if (rows >= 2) {
        expect(docxRows, 'DOCX non riconosce la tabella').not.toBeNull();
        expect(docxRows!.length).toBe(rows);
        docxRows!.forEach((row, ri) => {
          expect(row.length, `riga ${ri}: numero celle DOCX`).toBe(cols);
          expect(htmlRows[ri]!.length, `riga ${ri}: numero celle HTML`).toBe(cols);
          row.forEach((cell, ci) => {
            const expected = norm(cell.replace(/\*\*/g, ''));
            expect(htmlRows[ri]![ci], `cella [${ri},${ci}] diversa fra HTML e DOCX`).toBe(expected);
            expect(expected).toBe(norm(data[ri]![ci]!.replace(/\\\|/g, '|').replace(/\*\*/g, '')));
          });
        });
      }
      expect(html).not.toContain('<td>---</td>');
    }
  });

  it('una riga-pipe isolata ("| nota |") non perde il testo in nessuno dei due formati', () => {
    const md = '| nota sciolta del perito |';
    expect(htmlToText(markdownToHtml(md))).toContain('nota sciolta del perito');
    expect(parseMarkdownTable(md)).toBeNull(); // il DOCX la tiene come paragrafo (test co-locato)
  });
});
