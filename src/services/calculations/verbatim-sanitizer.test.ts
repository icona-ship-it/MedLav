import { describe, it, expect } from 'vitest';
import { sanitizeVerbatimOcr, htmlTableToPipeText } from './verbatim-sanitizer';

describe('verbatim-sanitizer', () => {
  describe('htmlTableToPipeText', () => {
    it('should convert a simple HTML table to a pipe table', () => {
      const html = '<tr><th>Esame</th><th>Valore</th></tr><tr><td>Hb</td><td>13.2 g/dL</td></tr>';
      const out = htmlTableToPipeText(html);
      expect(out).toContain('| Esame | Valore |');
      expect(out).toContain('| Hb | 13.2 g/dL |');
      expect(out).toContain('| --- | --- |');
    });

    it('should return null when no rows are parseable', () => {
      expect(htmlTableToPipeText('testo senza righe')).toBeNull();
    });
  });

  describe('sanitizeVerbatimOcr', () => {
    it('should convert TABLE_HTML blocks into readable pipe tables', () => {
      const text = `Referto del 12.03.2024
[TABLE_HTML_START]
<table><tr><th>Parametro</th><th>Risultato</th></tr><tr><td>Glicemia</td><td>98 mg/dL</td></tr></table>
[TABLE_HTML_END]
Conclusioni: nella norma.`;
      const out = sanitizeVerbatimOcr(text);
      expect(out).not.toContain('TABLE_HTML_START');
      expect(out).not.toContain('<table>');
      expect(out).toContain('| Glicemia | 98 mg/dL |');
      expect(out).toContain('Conclusioni: nella norma.');
    });

    it('should strip broken markdown image references (the 92-114 per report)', () => {
      const text = 'Esame radiografico.\n![img-3.jpeg](img-3.jpeg)\nNessuna frattura visibile. ![foto](scan_02.png)';
      const out = sanitizeVerbatimOcr(text);
      expect(out).not.toContain('![');
      expect(out).toContain('Esame radiografico.');
      expect(out).toContain('Nessuna frattura visibile.');
    });

    it('should clean only UNAMBIGUOUS null junk, never German clinical "null" (= zero)', () => {
      const text = 'Pianificazione: null null Mer 12.03\nEsito (null) negativo\nSchmerzen: null\nnull Komplikationen';
      const out = sanitizeVerbatimOcr(text);
      // "null null" ripetuto e "(null)" sono junk certo dei gestionali
      expect(out).not.toContain('null null');
      expect(out).toContain('Pianificazione: — Mer 12.03');
      expect(out).toContain('Esito  negativo'.replace('  ', ' ').trim().split(' ')[0]); // 'Esito' resta
      expect(out).not.toContain('(null)');
      // Tedesco clinico legittimo: resta INTATTO (anche la forma col due punti)
      expect(out).toContain('Schmerzen: null');
      expect(out).toContain('null Komplikationen');
    });

    it('should strip stray HTML tags and decode entities outside tables', () => {
      const text = 'Diagnosi:<br/>frattura femore &amp; lesione menisco &#232; confermata';
      const out = sanitizeVerbatimOcr(text);
      expect(out).not.toContain('<br');
      expect(out).toContain('frattura femore & lesione menisco è confermata');
    });

    it('should handle bare <table> without markers', () => {
      const text = 'Valori:\n<table><tr><td>Na</td><td>140</td></tr></table>\nFine referto.';
      const out = sanitizeVerbatimOcr(text);
      expect(out).not.toContain('<table>');
      expect(out).toContain('| Na | 140 |');
    });

    it('should never lose clinical prose and collapse blank-line noise', () => {
      const text = 'Anamnesi.\n\n\n\n![img-1.jpeg](img-1.jpeg)\n\n\nEsame obiettivo nei limiti.';
      const out = sanitizeVerbatimOcr(text);
      expect(out).toBe('Anamnesi.\n\nEsame obiettivo nei limiti.');
    });

    it('should leave already-clean text untouched', () => {
      const text = 'Paziente di anni 45, riferisce dolore al ginocchio destro dal 2021.';
      expect(sanitizeVerbatimOcr(text)).toBe(text);
    });
  });
});

describe('un "<" clinico non apre mai un tag (audit 2026-09-10, invariante I1)', () => {
  const SIDE_RE = /\b(dx|sx|sn|ds|destr[oaie]|sinistr[oaie])\b/gi;

  it('"ROM dx<sx" + "NRS >5" + &nbsp; nella pagina: la diagnosi con lato resta e i lati sono nell\'ordine originale', () => {
    const input = 'ESAME OBIETTIVO\nROM dx<sx, dolore alla pressione.\nDIAGNOSI\nFrattura polso sx.\nDolore NRS >5.\nPROGNOSI&nbsp;Giorni 30.';
    const out = sanitizeVerbatimOcr(input);
    expect(out).toContain('Frattura polso sx.');
    expect(out).toContain('ROM dx<sx');
    expect(out).toContain('NRS >5');
    expect((out.match(SIDE_RE) ?? []).map((w) => w.toLowerCase())).toEqual(['dx', 'sx', 'sx']);
  });

  it('"ROM dx<sx" + <span> a valle: il tag sparisce, la diagnosi con lato resta', () => {
    const out = sanitizeVerbatimOcr('ESAME OBIETTIVO\nROM dx<sx, dolore alla pressione.\nDIAGNOSI\nFrattura polso sx.\n<span>Prognosi</span> giorni 30.');
    expect(out).toContain('Frattura polso sx.');
    expect(out).toContain('Prognosi giorni 30.');
    expect(out).not.toContain('<span>');
  });

  it('un tag vero con attributi sulla stessa riga viene tolto; «PA <90 mmHg» e «T <38» restano', () => {
    const out = sanitizeVerbatimOcr('<p class="x">PA <90 mmHg, T <38.</p><br/>Frattura polso sx.');
    expect(out).toContain('PA <90 mmHg, T <38.');
    expect(out).toContain('Frattura polso sx.');
    expect(out).not.toMatch(/<p|<\/p>/);
  });
});
