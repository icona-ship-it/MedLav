'use client';

import { useState, useTransition } from 'react';
import Image from 'next/image';
import {
  ChevronDown, ChevronUp, Pencil, Trash2, Save, X, Loader2, FileSearch,
} from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { updateEvent, deleteEvent } from '../../actions';
import { EVENT_TYPES } from '@/lib/constants';
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
        Testo OCR originale
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

// --- Event Card Component ---

export function EventCard({
  event, caseId, isExpanded, isEditing, onToggle, onStartEdit, onCancelEdit, onSaved, onDeleted,
  eventImages, onImageClick, onMoveUp, onMoveDown, isFirst, isLast,
  isHighlighted, onViewInReport,
}: {
  event: EventRow;
  caseId: string;
  isExpanded: boolean;
  isEditing: boolean;
  onToggle: () => void;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSaved: () => void;
  onDeleted: () => void;
  eventImages: Record<string, string[]>;
  onImageClick: (url: string) => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  isFirst?: boolean;
  isLast?: boolean;
  isHighlighted?: boolean;
  onViewInReport?: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [editForm, setEditForm] = useState({
    title: event.title,
    description: event.description,
    eventType: event.event_type,
    eventDate: event.event_date,
    diagnosis: event.diagnosis ?? '',
    doctor: event.doctor ?? '',
    facility: event.facility ?? '',
    expertNotes: event.expert_notes ?? '',
  });

  const handleSave = () => {
    startTransition(async () => {
      const result = await updateEvent({
        eventId: event.id,
        caseId,
        title: editForm.title,
        description: editForm.description,
        eventType: editForm.eventType,
        eventDate: editForm.eventDate,
        diagnosis: editForm.diagnosis || null,
        doctor: editForm.doctor || null,
        facility: editForm.facility || null,
        expertNotes: editForm.expertNotes || null,
      });
      if (result?.error) {
        toast.error(result.error);
        return;
      }
      onSaved();
    });
  };

  const handleDelete = () => {
    toast('Eliminare questo evento?', {
      description: 'L\'evento potrà essere recuperato.',
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
    `/api/cases/${caseId}/images?path=${encodeURIComponent(path)}`
  );

  return (
    <div
      className={`rounded-md border p-3 transition-colors ${isHighlighted ? 'border-primary bg-primary/5 ring-1 ring-primary' : ''}`}
      id={`event-${event.order_number}`}
    >
      {/* Header row - always visible */}
      <div className="flex items-start justify-between">
        <button type="button" className="flex flex-1 items-start text-left" onClick={onToggle}>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-medium">
                {formatDate(event.event_date)}
              </span>
              <Badge variant="outline" className="text-xs">{EVENT_TYPES.find((t) => t.value === event.event_type)?.label ?? event.event_type}</Badge>
              {event.requires_verification && <Badge variant="warning" className="text-xs">Da verificare</Badge>}
            </div>
            <p className="mt-1 text-sm font-medium">{event.title}</p>
          </div>
        </button>
        <div className="flex items-center gap-1 ml-2">
          {onMoveUp && !isFirst && (
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onMoveUp} title="Sposta su" aria-label="Sposta evento su">
              <ChevronUp className="h-3 w-3" />
            </Button>
          )}
          {onMoveDown && !isLast && (
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onMoveDown} title="Sposta giù" aria-label="Sposta evento giù">
              <ChevronDown className="h-3 w-3" />
            </Button>
          )}
          {onViewInReport && (
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onViewInReport} title="Vedi nel report" aria-label="Vedi nel report">
              <FileSearch className="h-3 w-3" />
            </Button>
          )}
          {!isEditing && (
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onStartEdit} title="Modifica" aria-label="Modifica evento">
              <Pencil className="h-3 w-3" />
            </Button>
          )}
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onToggle} aria-label={isExpanded ? 'Chiudi dettagli' : 'Apri dettagli'} aria-expanded={isExpanded}>
            {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      {/* Expanded content */}
      {isExpanded && !isEditing && (
        <div className="mt-3 space-y-2 border-t pt-3">
          <p className="text-sm whitespace-pre-wrap">{event.description}</p>
          {event.diagnosis && <p className="text-sm"><span className="font-medium">Diagnosi:</span> {event.diagnosis}</p>}
          {event.doctor && <p className="text-sm"><span className="font-medium">Medico:</span> {event.doctor}</p>}
          {event.facility && <p className="text-sm"><span className="font-medium">Struttura:</span> {event.facility}</p>}
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span>Fonte: {sourceLabels[event.source_type] ?? event.source_type}</span>
            <span className={confidenceColor(event.confidence)}>{confidenceLabel(event.confidence)}</span>
          </div>
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
                    className="rounded border overflow-hidden hover:ring-2 hover:ring-primary transition-all"
                    onClick={() => onImageClick(url)}
                    aria-label={`Visualizza immagine ${idx + 1}`}
                  >
                    <Image
                      src={url}
                      alt={`Immagine ${idx + 1}`}
                      width={80}
                      height={80}
                      className="h-20 w-20 object-cover"
                      unoptimized
                    />
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Edit form */}
      {isExpanded && isEditing && (
        <div className="mt-3 space-y-3 border-t pt-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label>Titolo</Label>
              <Input value={editForm.title} onChange={(e) => setEditForm({ ...editForm, title: e.target.value })} />
            </div>
            <div>
              <Label>Data</Label>
              <Input type="date" value={editForm.eventDate} onChange={(e) => setEditForm({ ...editForm, eventDate: e.target.value })} />
            </div>
            <div>
              <Label>Tipo evento</Label>
              <Select value={editForm.eventType} onValueChange={(v) => setEditForm({ ...editForm, eventType: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {EVENT_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Diagnosi</Label>
              <Input value={editForm.diagnosis} onChange={(e) => setEditForm({ ...editForm, diagnosis: e.target.value })} />
            </div>
            <div>
              <Label>Medico</Label>
              <Input value={editForm.doctor} onChange={(e) => setEditForm({ ...editForm, doctor: e.target.value })} />
            </div>
            <div>
              <Label>Struttura</Label>
              <Input value={editForm.facility} onChange={(e) => setEditForm({ ...editForm, facility: e.target.value })} />
            </div>
          </div>
          <div>
            <Label>Descrizione</Label>
            <Textarea rows={4} value={editForm.description} onChange={(e) => setEditForm({ ...editForm, description: e.target.value })} />
          </div>
          <div>
            <Label>Note perito</Label>
            <Textarea rows={2} value={editForm.expertNotes} onChange={(e) => setEditForm({ ...editForm, expertNotes: e.target.value })} placeholder="Annotazioni del perito..." />
          </div>
          <div className="flex items-center justify-between">
            <Button variant="destructive" size="sm" onClick={handleDelete} disabled={isPending}>
              <Trash2 className="mr-1 h-3 w-3" />Elimina
            </Button>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={onCancelEdit} disabled={isPending}>
                <X className="mr-1 h-3 w-3" />Annulla
              </Button>
              <Button size="sm" onClick={handleSave} disabled={isPending}>
                {isPending ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Save className="mr-1 h-3 w-3" />}
                Salva
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
