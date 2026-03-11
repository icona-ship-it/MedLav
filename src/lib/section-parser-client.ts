/**
 * Client-safe section parser for splitting report markdown into sections.
 * Based on the same logic as services/synthesis/section-parser.ts but
 * without server-only dependencies.
 */

export interface ClientSection {
  id: string;
  title: string;
  content: string;
}

/**
 * Parse a markdown synthesis into sections using ## headings.
 */
export function parseSections(markdown: string): ClientSection[] {
  if (!markdown || !markdown.trim()) return [];

  const sections: ClientSection[] = [];
  const headingRegex = /^##\s+(.+)$/gm;
  const matches: Array<{ title: string; index: number }> = [];

  let match: RegExpExecArray | null;
  while ((match = headingRegex.exec(markdown)) !== null) {
    matches.push({ title: match[1].trim(), index: match.index });
  }

  if (matches.length === 0) {
    // No sections found — return entire content as single section
    return [{ id: 'full_report', title: 'Report', content: markdown.trim() }];
  }

  // Content before the first heading (preamble)
  const preamble = markdown.slice(0, matches[0].index).trim();
  if (preamble) {
    sections.push({ id: 'preamble', title: 'Intestazione', content: preamble });
  }

  for (let i = 0; i < matches.length; i++) {
    const startIndex = matches[i].index;
    const endIndex = i < matches.length - 1 ? matches[i + 1].index : markdown.length;
    const fullContent = markdown.slice(startIndex, endIndex).trim();
    const headingEndIndex = fullContent.indexOf('\n');
    const content = headingEndIndex >= 0 ? fullContent.slice(headingEndIndex + 1).trim() : '';

    const id = slugifyHeading(matches[i].title);

    sections.push({ id, title: matches[i].title, content });
  }

  return sections;
}

function slugifyHeading(heading: string): string {
  return heading
    .toLowerCase()
    .replace(/[^a-zà-ú0-9\s]/g, '')
    .replace(/\s+/g, '_')
    .slice(0, 40);
}
