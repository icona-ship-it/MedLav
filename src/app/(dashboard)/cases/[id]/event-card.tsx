'use client';

/**
 * Event card — modalita' SOLO LETTURA.
 *
 * UX refactor Ondata 2 — principio P3 (lettura e modifica disambigui).
 * Il form di edit prima era inline dentro questa card e rompeva la scan
 * visiva della lista. Ora la modifica avviene esternamente in
 * <EventEditSheet> aperto dal parent. Questa card mostra solo dati
 * read-only ed espone bottoni quick-action (modifica, elimina, verifica).
 */

import { useState, useTransition } from 'react';
import Image from 'next/image';
import {
  ChevronDown, ChevronUp, Pencil, Trash2, ZoomIn,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  Dialog, DialogContent,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { updateEvent, deleteEvent } from '../../actions';
import { EVENT_TYPES, isClinicalEvent } from '@/lib/constants';
import {
  formatDate, confidenceColor, confidenceLabel,
} from '@/lib/format';
import { sourceLabels } from '@/lib/constants';
import type { EventRow } from './types';

// --- Source Text Section (collapsible) ---

function SourceTextSection({ sourceText, sourcePages }: { sourceText: string; sourcePages: string | null }) {
  const [isOpen, setIsOpen] = useState(false);

  const parsedPages: number[] = sourcePages ? (() => {
    try { return JSON.parse(sourcePages) as number[]; } catch { return []; }
  })() : [];

  return (
    <div className="pt-2 border-t">
      <button
        type="button"
        className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
        onClick={() => setIsOpen(!isOpen)}
      >
        {isOpen ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        Testo documento originale
        {parsedPages.length > 0 && (
          <span className="text-xs text-muted-foreground ml-1">
            (pag. {parsedPages.join(', ')})
          </span>
        )}
      </button>
      {isOpen && (
        <pre className="mt-2 rounded bg-muted p-3 text-xs whitespace-pre-wrap font-mono max-h-60 overflow-y-auto">
          {sourceText}
        </pre>
      )}
    </div>
  );
}

// --- Event Card Component (READ-ONLY + actions) ---

interface EventCardProps {
  event: EventRow;
  caseId: string;
  isExpanded: boolean;
  onToggle: () => void;
  /** Apre il Sheet di modifica per questo evento (gestito dal parent). */
  onStartEdit: () => void;
  /** Chiamato dopo eliminazione riuscita (parent fa router.refresh). */
  onDeleted: () => void;
  eventImages: Record<string, string[]>;
  isHighlighted?: boolean;
  documentName?: string;
}

export function EventCard({
  event, caseId, isExpanded, onToggle, onStartEdit, onDeleted,
  eventImages, isHighlighted, documentName,
}: EventCardProps) {
  const [isPending, startTransition] = useTransition();
  const [isVerifying, setIsVerifying] = useState(false);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  // Inclusione nella cronologia esportata (solo per eventi clinici: i non-clinici
  // sono comunque esclusi per categoria). Default incluso.
  const isClinical = isClinicalEvent(event.event_type);
  const [includeInChrono, setIncludeInChrono] = useState(event.is_relevant_for_chronology ?? true);

  const handleToggleChrono = () => {
    const next = !includeInChrono;
    setIncludeInChrono(next);
    startTransition(async () => {
      const result = await updateEvent({ eventId: event.id, caseId, isRelevantForChronology: next });
      if (result?.error) {
        setIncludeInChrono(!next); // revert su errore
        toast.error(result.error);
      } else {
        toast.success(next ? 'Evento incluso nella cronologia' : 'Evento escluso dalla cronologia');
      }
    });
  };

  const handleQuickVerify = () => {
    setIsVerifying(true);
    startTransition(async () => {
      const result = await updateEvent({
        eventId: event.id,
        caseId,
        requiresVerification: false,
      });
      if (result?.error) {
        toast.error(result.error);
      } else {
        toast.success('Evento segnato come verificato');
      }
      setIsVerifying(false);
    });
  };

  const handleDelete = () => {
    toast('Eliminare questo evento?', {
      description: "L'evento potrà essere recuperato.",
      action: {
        label: 'Elimina',
        onClick: () => {
          startTransition(async () => {
            const result = await deleteEvent({ eventId: event.id, caseId });
            if (result?.error) {
              toast.error(result.error);
              return;
            }
            onDeleted();
          });
        },
      },
      cancel: { label: 'Annulla', onClick: () => {} },
    });
  };

  const rawPaths = eventImages[event.id] ?? [];
  // Build proxy URLs from raw storage paths (avoids server-side signed URL generation)
  const images = rawPaths.map((path) =>
    `/api/cases/${caseId}/images?path=${encodeURIComponent(path)}`,
  );

  return (
    <div
      className={`rounded-md border p-3 transition-colors ${isHighlighted ? 'border-primary bg-primary/5 ring-1 ring-primary' : ''}`}
      id={`event-${event.order_number}`}
    >
      {/* Header row — always visible */}
      <div className="flex items-start justify-between">
        <button type="button" className="flex flex-1 items-start text-left" onClick={onToggle}>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-medium">
                {formatDate(event.event_date)}
              </span>
              <Badge variant="outline" className="text-xs">
                {EVENT_TYPES.find((t) => t.value === event.event_type)?.label ?? event.event_type}
              </Badge>
              {event.requires_verification && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleQuickVerify();
                  }}
                  disabled={isVerifying}
                  className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 text-yellow-700 dark:text-yellow-400 hover:text-green-700 dark:hover:text-green-400 transition-colors disabled:opacity-50"
                  title="Clicca per segnare come verificato"
                >
                  <span className="inline-block h-2 w-2 rounded-full bg-yellow-400 shrink-0" />
                  {isVerifying ? '...' : 'da valutare'}
                </button>
              )}
              {isClinical && !includeInChrono && (
                <Badge variant="secondary" className="text-xs">Fuori cronologia</Badge>
              )}
            </div>
            <p className="mt-1 text-sm font-medium">{event.title}</p>
          </div>
        </button>
        <div className="flex items-center gap-0.5 ml-2">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={(e) => { e.stopPropagation(); onStartEdit(); }}
            disabled={isPending}
            title="Modifica evento"
            aria-label="Modifica evento"
          >
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground hover:text-destructive"
            onClick={(e) => { e.stopPropagation(); handleDelete(); }}
            disabled={isPending}
            title="Elimina evento"
            aria-label="Elimina evento"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={onToggle}
            aria-label={isExpanded ? 'Chiudi dettagli' : 'Apri dettagli'}
            aria-expanded={isExpanded}
          >
            {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      {/* Expanded content — read-only details */}
      {isExpanded && (
        <div className="mt-3 space-y-2 border-t pt-3">
          <p className="text-sm whitespace-pre-wrap">{event.description}</p>
          {event.diagnosis && <p className="text-sm"><span className="font-medium">Diagnosi:</span> {event.diagnosis}</p>}
          {event.doctor && <p className="text-sm"><span className="font-medium">Medico:</span> {event.doctor}</p>}
          {event.facility && <p className="text-sm"><span className="font-medium">Struttura:</span> {event.facility}</p>}
          <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
            <span>Fonte: {sourceLabels[event.source_type] ?? event.source_type}</span>
            <span className={confidenceColor(event.confidence)}>{confidenceLabel(event.confidence)}</span>
            {documentName && (
              <span className="flex items-center gap-1">
                Doc: <span className="font-medium">{documentName}</span>
              </span>
            )}
          </div>
          {isClinical && (
            <label className="flex items-center gap-2 text-sm cursor-pointer pt-1">
              <input
                type="checkbox"
                checked={includeInChrono}
                onChange={handleToggleChrono}
                disabled={isPending}
                className="h-4 w-4 rounded border-input accent-primary"
              />
              <span>Includi nella cronologia esportata</span>
            </label>
          )}
          {event.reliability_notes && <p className="text-sm text-muted-foreground italic">{event.reliability_notes}</p>}
          {event.expert_notes && (
            <div className="rounded bg-muted p-2">
              <p className="text-sm"><span className="font-medium">Note perito:</span> {event.expert_notes}</p>
            </div>
          )}
          {event.source_text && (
            <SourceTextSection sourceText={event.source_text} sourcePages={event.source_pages} />
          )}
          {images.length > 0 && (
            <div className="pt-2 border-t">
              <p className="text-xs font-medium text-muted-foreground mb-2">Immagini associate</p>
              <div className="flex flex-wrap gap-2">
                {images.map((url, idx) => (
                  <button
                    key={url}
                    type="button"
                    className="group relative rounded border overflow-hidden hover:ring-2 hover:ring-primary transition-all"
                    onClick={() => setLightboxUrl(url)}
                    aria-label={`Ingrandisci immagine ${idx + 1}`}
                  >
                    <Image
                      src={url}
                      alt={`Immagine ${idx + 1}`}
                      width={80}
                      height={80}
                      className="h-20 w-20 object-cover"
                      unoptimized
                    />
                    <div className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/30 transition-colors">
                      <ZoomIn className="h-5 w-5 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                  </button>
                ))}
              </div>
              {/* Image lightbox */}
              <Dialog open={!!lightboxUrl} onOpenChange={() => setLightboxUrl(null)}>
                <DialogContent className="max-w-4xl max-h-[90vh] p-2">
                  {lightboxUrl && (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={lightboxUrl}
                      alt="Immagine ingrandita"
                      className="w-full h-auto max-h-[85vh] object-contain rounded"
                    />
                  )}
                </DialogContent>
              </Dialog>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
