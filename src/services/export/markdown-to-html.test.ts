import { describe, it, expect } from 'vitest';
import { markdownToHtml } from './markdown-to-html';

describe('markdownToHtml', () => {
  describe('tables', () => {
    it('renders a standard pipe table with thead + tbody', () => {
      const md = ['| A | B |', '|---|---|', '| 1 | 2 |', '| 3 | 4 |'].join('\n');
      const html = markdownToHtml(md);
      expect(html).toContain('<thead>');
      expect(html).toContain('<th>A</th>');
      expect(html).toContain('<tbody>');
      expect(html).toContain('<td>1</td>');
      // balanced tbody
      expect((html.match(/<tbody>/g) ?? []).length).toBe((html.match(/<\/tbody>/g) ?? []).length);
    });

    it('does NOT emit an unbalanced </tbody> for a header-only table', () => {
      const md = ['| Solo header |', '|---|'].join('\n');
      const html = markdownToHtml(md);
      expect(html).toContain('<th>Solo header</th>');
      expect(html).not.toContain('</tbody>'); // no body → no tbody at all
      expect(html).toContain('</table>');
    });

    it('treats an escaped pipe as a literal cell character (not a column split)', () => {
      // formatITTITPTable escapes "ITT | 100" → "ITT \| 100"; the cell must stay intact.
      const md = ['| Periodo | Val |', '|---|---|', '| ITT \\| 100 | x |'].join('\n');
      const html = markdownToHtml(md);
      expect(html).toContain('<td>ITT | 100</td>'); // unescaped, single cell
      // exactly 2 cells in the body row (not 3)
      const bodyTds = (html.match(/<td>/g) ?? []).length;
      expect(bodyTds).toBe(2);
    });

    it('renders the A2 ITT/ITP table shape correctly', () => {
      const md = [
        '| Periodo | Dal | Al | Giorni | Invalidità |',
        '|---|---|---|---|---|',
        '| ITT al 100% | 10.01.2024 | 20.01.2024 | 10 | 100% |',
        '| **Totale giorni** | | | **10** | |',
      ].join('\n');
      const html = markdownToHtml(md);
      expect(html).toContain('<th>Periodo</th>');
      expect(html).toContain('<td>ITT al 100%</td>');
      expect(html).toContain('100%');
    });
  });

  describe('other markdown', () => {
    it('renders headings h1-h4', () => {
      expect(markdownToHtml('## Titolo')).toContain('<h2>Titolo</h2>');
    });

    it('renders bold and italic', () => {
      expect(markdownToHtml('Testo **grassetto** e *corsivo*')).toContain('<strong>grassetto</strong>');
    });

    it('renders unordered and ordered lists', () => {
      expect(markdownToHtml('- uno\n- due')).toContain('<ul>');
      expect(markdownToHtml('1. uno\n2. due')).toContain('<ol>');
    });

    it('escapes HTML in text (XSS-safe)', () => {
      const html = markdownToHtml('Testo con <script>alert(1)</script>');
      expect(html).not.toContain('<script>');
      expect(html).toContain('&lt;script&gt;');
    });

    it('blocks unsafe image URL schemes (rewrites src to #)', () => {
      const html = markdownToHtml('![x](javascript:alert)');
      expect(html).toContain('src="#"');
      expect(html).not.toContain('src="javascript:alert"');
    });

    it('allows safe image URL schemes', () => {
      const html = markdownToHtml('![Fig](/api/cases/1/images?path=a)');
      expect(html).toContain('/api/cases/1/images');
    });

    it('renders an image INLINE in un paragrafo (non markdown letterale nell\'atto)', () => {
      const html = markdownToHtml('Come da referto ![Fig.1](ocr-image:ocr-images/d/p1-f0.png) si osserva la frattura.');
      expect(html).toContain('<img src="ocr-image:ocr-images/d/p1-f0.png"');
      expect(html).not.toContain('![Fig.1]');
    });

    it('immagine inline con URL non sicuro → resta solo l\'alt, niente markdown grezzo', () => {
      const html = markdownToHtml('Vedi ![descrizione](javascript:alert) nel documento.');
      expect(html).not.toContain('javascript:alert');
      expect(html).not.toContain('![');
      expect(html).toContain('descrizione');
    });

    it('evidenzia il blocco-placeholder del perito come nel DOCX (parità export)', () => {
      const html = markdownToHtml('*[Il perito compilerà qui le considerazioni medico-legali.]*');
      expect(html).toContain('perito-placeholder');
      expect(html).toContain('Il perito compilerà qui le considerazioni medico-legali.');
      expect(html).not.toContain('*[');
    });

    it('blocco-placeholder multi-riga: chiude su "]*" e evidenzia tutte le righe', () => {
      const md = '*[Il perito ricostruirà:\nla dinamica del sinistro\ne il nesso causale.]*';
      const html = markdownToHtml(md);
      expect(html).toContain('perito-placeholder');
      expect(html).toContain('la dinamica del sinistro');
      expect(html).toContain('e il nesso causale.');
    });
  });
});
