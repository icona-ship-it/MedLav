'use client';

import { useMemo, useCallback } from 'react';
import { MarkdownPreview } from '@/components/markdown-preview';
import { Badge } from '@/components/ui/badge';

interface EventRef {
  orderNumber: number;
  title: string;
  eventDate: string;
}

interface LinkedReportViewerProps {
  content: string;
  events: EventRef[];
  onEventClick?: (orderNumber: number) => void;
}

/**
 * Enhanced markdown viewer that makes [Ev.N] references clickable.
 * Falls back to standard MarkdownPreview for sections without references.
 */
export function LinkedReportViewer({ content, events, onEventClick }: LinkedReportViewerProps) {
  const eventMap = useMemo(() => {
    const map = new Map<number, EventRef>();
    for (const event of events) {
      map.set(event.orderNumber, event);
    }
    return map;
  }, [events]);

  const hasReferences = useMemo(() => /\[Ev\.\d+\]/.test(content), [content]);

  const handleClick = useCallback((orderNumber: number) => {
    onEventClick?.(orderNumber);
  }, [onEventClick]);

  if (!hasReferences) {
    return <MarkdownPreview content={content} />;
  }

  // Split content by [Ev.N] references and render with clickable badges
  const parts = content.split(/(\[Ev\.\d+\])/g);

  return (
    <div className="prose prose-sm dark:prose-invert max-w-none">
      {parts.map((part, i) => {
        const match = part.match(/^\[Ev\.(\d+)\]$/);
        if (match) {
          const orderNumber = parseInt(match[1], 10);
          const event = eventMap.get(orderNumber);
          return (
            <EventReferenceBadge
              key={i}
              orderNumber={orderNumber}
              title={event?.title ?? `Evento ${orderNumber}`}
              date={event?.eventDate}
              onClick={() => handleClick(orderNumber)}
            />
          );
        }
        // Render regular markdown content
        if (part.trim()) {
          return <MarkdownPreview key={i} content={part} />;
        }
        return null;
      })}
    </div>
  );
}

function EventReferenceBadge({
  orderNumber, title, date, onClick,
}: {
  orderNumber: number;
  title: string;
  date?: string;
  onClick: () => void;
}) {
  const formattedDate = date ? new Date(date).toLocaleDateString('it-IT') : '';

  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center mx-0.5 align-baseline"
      title={`${title}${formattedDate ? ` (${formattedDate})` : ''} — Clicca per vedere l'evento`}
    >
      <Badge
        variant="outline"
        className="text-xs cursor-pointer hover:bg-primary/10 transition-colors font-mono"
      >
        Ev.{orderNumber}
      </Badge>
    </button>
  );
}
