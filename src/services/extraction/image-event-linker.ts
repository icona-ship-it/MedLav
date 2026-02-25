/**
 * Link images to events based on shared page numbers.
 * An event's sourcePages tells us which pages it came from;
 * pages with images can be matched to events by page number + document.
 */

interface PageWithImage {
  pageId: string;
  documentId: string;
  pageNumber: number;
  imagePath: string; // semicolon-separated paths
}

interface EventWithSource {
  eventId: string;
  documentId: string | null;
  sourcePages: number[]; // parsed from JSON string
}

export interface EventImageLink {
  eventId: string;
  pageId: string;
  imagePath: string;
  pageNumber: number;
}

/**
 * Build event-image links by matching event sourcePages with page image data.
 * Returns flat array of links ready to insert into event_images table.
 */
export function linkImagesToEvents(
  events: EventWithSource[],
  pagesWithImages: PageWithImage[],
): EventImageLink[] {
  const links: EventImageLink[] = [];

  // Index pages by documentId + pageNumber for fast lookup
  const pageIndex = new Map<string, PageWithImage[]>();
  for (const page of pagesWithImages) {
    const key = `${page.documentId}:${page.pageNumber}`;
    const existing = pageIndex.get(key) ?? [];
    existing.push(page);
    pageIndex.set(key, existing);
  }

  for (const event of events) {
    if (!event.documentId || event.sourcePages.length === 0) continue;

    for (const pageNum of event.sourcePages) {
      const key = `${event.documentId}:${pageNum}`;
      const matchingPages = pageIndex.get(key) ?? [];

      for (const page of matchingPages) {
        // Split semicolon-separated paths into individual links
        const paths = page.imagePath.split(';').filter(Boolean);
        for (const path of paths) {
          links.push({
            eventId: event.eventId,
            pageId: page.pageId,
            imagePath: path,
            pageNumber: page.pageNumber,
          });
        }
      }
    }
  }

  return links;
}
