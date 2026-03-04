/**
 * Split guideline text into chunks for embedding.
 * Uses section-aware splitting to maintain semantic coherence.
 */

const DEFAULT_CHUNK_SIZE = 1500; // ~375 tokens at 4 chars/token
const DEFAULT_OVERLAP = 200;

export interface TextChunk {
  content: string;
  chunkIndex: number;
  sectionTitle: string | null;
  estimatedTokens: number;
}

/**
 * Split guideline text into semantically coherent chunks.
 * Tries to split on section headings first, then on paragraph breaks.
 */
export function chunkGuidelineText(
  text: string,
  chunkSize: number = DEFAULT_CHUNK_SIZE,
  overlap: number = DEFAULT_OVERLAP,
): TextChunk[] {
  const sections = splitIntoSections(text);
  const chunks: TextChunk[] = [];
  let chunkIndex = 0;

  for (const section of sections) {
    const sectionChunks = splitSectionIntoChunks(section.content, chunkSize, overlap);

    for (const chunkContent of sectionChunks) {
      // Prepend section title for context
      const contentWithContext = section.title
        ? `[${section.title}]\n${chunkContent}`
        : chunkContent;

      chunks.push({
        content: contentWithContext,
        chunkIndex,
        sectionTitle: section.title,
        estimatedTokens: Math.ceil(contentWithContext.length / 4),
      });
      chunkIndex++;
    }
  }

  return chunks;
}

interface Section {
  title: string | null;
  content: string;
}

/**
 * Split text into sections based on markdown headings (# or ##).
 */
function splitIntoSections(text: string): Section[] {
  const lines = text.split('\n');
  const sections: Section[] = [];
  let currentTitle: string | null = null;
  let currentContent: string[] = [];

  for (const line of lines) {
    const headingMatch = line.match(/^#{1,3}\s+(.+)/);

    if (headingMatch) {
      // Save previous section
      if (currentContent.length > 0) {
        sections.push({
          title: currentTitle,
          content: currentContent.join('\n').trim(),
        });
      }
      currentTitle = headingMatch[1].trim();
      currentContent = [];
    } else {
      currentContent.push(line);
    }
  }

  // Save last section
  if (currentContent.length > 0) {
    sections.push({
      title: currentTitle,
      content: currentContent.join('\n').trim(),
    });
  }

  // If no sections found, treat entire text as one section
  if (sections.length === 0 && text.trim().length > 0) {
    sections.push({ title: null, content: text.trim() });
  }

  return sections.filter((s) => s.content.length > 20);
}

/**
 * Split a section into chunks at paragraph boundaries.
 */
function splitSectionIntoChunks(
  text: string,
  maxChunkSize: number,
  overlap: number,
): string[] {
  if (text.length <= maxChunkSize) {
    return [text];
  }

  const chunks: string[] = [];
  let start = 0;

  while (start < text.length) {
    let end = Math.min(start + maxChunkSize, text.length);

    // Try to break at paragraph boundary
    if (end < text.length) {
      const searchStart = Math.max(end - 300, start);
      const searchText = text.slice(searchStart, end);
      const lastParagraph = searchText.lastIndexOf('\n\n');
      if (lastParagraph !== -1) {
        end = searchStart + lastParagraph + 2;
      } else {
        const lastNewline = searchText.lastIndexOf('\n');
        if (lastNewline !== -1) {
          end = searchStart + lastNewline + 1;
        }
      }
    }

    chunks.push(text.slice(start, end).trim());
    start = Math.max(end - overlap, start + 1);
    if (end >= text.length) break;
  }

  return chunks.filter((c) => c.length > 20);
}
