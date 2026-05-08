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
 * Deduplicates slugs by appending _2, _3, etc. to collisions.
 */
export function parseSections(markdown: string): ClientSection[] {
  if (!markdown || typeof markdown !== 'string' || !markdown.trim()) return [];

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

  const slugCounts = new Map<string, number>();

  for (let i = 0; i < matches.length; i++) {
    const startIndex = matches[i].index;
    const endIndex = i < matches.length - 1 ? matches[i + 1].index : markdown.length;
    const fullContent = markdown.slice(startIndex, endIndex).trim();
    const headingEndIndex = fullContent.indexOf('\n');
    const content = headingEndIndex >= 0 ? fullContent.slice(headingEndIndex + 1).trim() : '';

    const baseSlug = slugifyHeading(matches[i].title);
    const count = (slugCounts.get(baseSlug) ?? 0) + 1;
    slugCounts.set(baseSlug, count);
    const id = count > 1 ? `${baseSlug}_${count}` : baseSlug;

    sections.push({ id, title: matches[i].title, content });
  }

  return sections;
}

/**
 * Replace the content of a specific section in the full markdown,
 * preserving the heading and all other sections unchanged.
 * Uses the same dedup logic as parseSections to match section IDs.
 */
export function replaceSectionContent(
  markdown: string,
  sectionId: string,
  newContent: string,
): string {
  if (!markdown || typeof markdown !== 'string' || !sectionId) return markdown ?? '';

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

  // Find the target section by slug (with dedup logic matching parseSections)
  const slugCounts = new Map<string, number>();

  for (let i = 0; i < matches.length; i++) {
    const baseSlug = slugifyHeading(matches[i].title);
    const count = (slugCounts.get(baseSlug) ?? 0) + 1;
    slugCounts.set(baseSlug, count);
    const id = count > 1 ? `${baseSlug}_${count}` : baseSlug;

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
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .replace(/\s+/g, '_')
    .slice(0, 40);
}
