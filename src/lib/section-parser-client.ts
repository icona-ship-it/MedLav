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

/**
 * Replace the content of a specific section in the full markdown,
 * preserving the heading and all other sections unchanged.
 */
export function replaceSectionContent(
  markdown: string,
  sectionId: string,
  newContent: string,
): string {
  if (!markdown || !sectionId) return markdown;

  const headingRegex = /^##\s+(.+)$/gm;
  const matches: Array<{ title: string; index: number }> = [];

  let match: RegExpExecArray | null;
  while ((match = headingRegex.exec(markdown)) !== null) {
    matches.push({ title: match[1].trim(), index: match.index });
  }

  // Handle preamble
  if (sectionId === 'preamble' && matches.length > 0) {
    return newContent.trim() + '\n\n' + markdown.slice(matches[0].index);
  }

  // Handle full_report (no headings)
  if (sectionId === 'full_report' && matches.length === 0) {
    return newContent.trim();
  }

  // Find the target section by slug
  for (let i = 0; i < matches.length; i++) {
    const id = slugifyHeading(matches[i].title);
    if (id !== sectionId) continue;

    const headingLine = `## ${matches[i].title}`;
    const sectionStart = matches[i].index;
    const sectionEnd = i < matches.length - 1 ? matches[i + 1].index : markdown.length;

    const before = markdown.slice(0, sectionStart);
    const after = markdown.slice(sectionEnd);

    return before + headingLine + '\n\n' + newContent.trim() + '\n\n' + after;
  }

  // Section not found — return unchanged
  return markdown;
}

function slugifyHeading(heading: string): string {
  return heading
    .toLowerCase()
    .replace(/[^a-zà-ú0-9\s]/g, '')
    .replace(/\s+/g, '_')
    .slice(0, 40);
}
