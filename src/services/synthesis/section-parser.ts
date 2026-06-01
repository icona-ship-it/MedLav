import { logger } from '@/lib/logger';
// identifySectionId / SECTION_ID_MAP live in the client-safe parser so that
// client and server derive the SAME canonical id (the per-section state key).
import { identifySectionId } from '@/lib/section-parser-client';

export { identifySectionId };

export interface ParsedSection {
  id: string;
  title: string;
  content: string;
  startIndex: number;
  endIndex: number;
}

/**
 * Parse a synthesis markdown text into individual sections.
 * Uses ## headings as section boundaries.
 */
export function parseSynthesisSections(synthesis: string): ParsedSection[] {
  const sections: ParsedSection[] = [];
  const headingRegex = /^##\s+(.+)$/gm;
  const matches: Array<{ title: string; index: number }> = [];

  let match: RegExpExecArray | null;
  while ((match = headingRegex.exec(synthesis)) !== null) {
    matches.push({ title: match[1].trim(), index: match.index });
  }

  for (let i = 0; i < matches.length; i++) {
    const startIndex = matches[i].index;
    const endIndex = i < matches.length - 1 ? matches[i + 1].index : synthesis.length;
    const fullContent = synthesis.slice(startIndex, endIndex).trim();
    // Content without the heading line
    const headingEndIndex = fullContent.indexOf('\n');
    const content = headingEndIndex >= 0 ? fullContent.slice(headingEndIndex + 1).trim() : '';

    sections.push({
      id: identifySectionId(matches[i].title),
      title: matches[i].title,
      content,
      startIndex,
      endIndex,
    });
  }

  return sections;
}

/**
 * Replace a single section's content in the synthesis text.
 * Returns a new string (immutable). The heading is preserved.
 */
export function replaceSectionContent(
  synthesis: string,
  sectionId: string,
  newContent: string,
): string {
  const sections = parseSynthesisSections(synthesis);
  const target = sections.find((s) => s.id === sectionId);

  if (!target) {
    logger.warn('section-parser', `Section not found, appending at end`, { sectionId });
    return synthesis + '\n\n' + newContent;
  }

  const before = synthesis.slice(0, target.startIndex);
  const after = synthesis.slice(target.endIndex);
  const heading = `## ${target.title}`;

  return `${before}${heading}\n\n${newContent.trim()}\n\n${after}`.replace(/\n{3,}/g, '\n\n').trim();
}
