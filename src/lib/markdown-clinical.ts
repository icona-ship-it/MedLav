/**
 * Protezioni MARKDOWN per il testo clinico (audit 2026-09-10, invarianti I7/I10):
 * il markdown di una perizia è testo del medico, non un documento tecnico.
 * - «> 38 °C» a inizio riga è un confronto clinico, non una citazione: senza
 *   protezione viewer ed export perdevano il segno «>» in silenzio.
 * - Righe separate da un solo a-capo (intestazione, blocchi per rubrica,
 *   riferimenti calcolati) devono restare una per riga anche nel viewer, che
 *   altrimenti le fonde in un paragrafo mentre l'export le tiene separate.
 * Pure, idempotenti.
 */

const TABLE_OR_BLOCK_RE = /^\s*(?:\||#{1,6}\s|[-*+]\s|\d+[.)]\s|-{3,}\s*$|\*{3,}\s*$|!\[|<)/;

/** Un «>» seguito da un numero a inizio riga non apre mai una citazione. */
export function escapeClinicalComparisons(markdown: string): string {
  return markdown.replace(/^(\s*)>(?=\s*[\d+-])/gm, '$1\\>');
}

/** Trasforma gli a-capo singoli fra righe di testo in interruzioni di riga
 * markdown (due spazi), lasciando intatti tabelle, elenchi, titoli e righe vuote. */
export function hardenSoftBreaks(markdown: string): string {
  const lines = markdown.split('\n');
  return lines
    .map((line, i) => {
      const next = lines[i + 1] ?? '';
      if (!line.trim() || !next.trim()) return line;
      if (TABLE_OR_BLOCK_RE.test(line) || TABLE_OR_BLOCK_RE.test(next)) return line;
      if (/ {2}$/.test(line) || /\\$/.test(line)) return line;
      return `${line}  `;
    })
    .join('\n');
}

/** Tutte le protezioni, nell'ordine giusto: da applicare PRIMA di qualunque parser. */
export function protectClinicalMarkdown(markdown: string): string {
  return hardenSoftBreaks(escapeClinicalComparisons(markdown));
}
