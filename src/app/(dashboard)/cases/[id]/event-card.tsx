'use client';

import { useState, useTransition } from 'react';
import Image from 'next/image';
import {
  ChevronDown, ChevronUp, Pencil, Trash2, Save, X, Loader2, ZoomIn,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  Dialog, DialogContent,
} from '@/components/ui/dialog';
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
import { DictationButton } from '@/components/dictation-button';

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

// --- Event Card Component ---

export function EventCard({
  event, caseId, isExpanded, isEditing, onToggle, onStartEdit, onCancelEdit, onSaved, onDeleted,
  eventImages,
  isHighlighted, documentName,
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
  isHighlighted?: boolean;
  documentName?: string;
}) {
  const [isPending, startTransition] = useTransition();
  const [isVerifying, setIsVerifying] = useState(false);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

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
              {event.requires_verification && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleQuickVerify();
                    toast.success('Evento verificato');
                  }}
                  className="inline-flex items-center gap-1 text-[11px] text-yellow-700 dark:text-yellow-400 hover:text-green-700 dark:hover:text-green-400 transition-colors"
                  title="Clicca per segnare come verificato"
                >
                  <span className="inline-block h-2 w-2 rounded-full bg-yellow-400 shrink-0" />
                  {isVerifying ? '...' : 'da verificare'}
                </button>
              )}
            </div>
            <p className="mt-1 text-sm font-medium">{event.title}</p>
          </div>
        </button>
        <div className="flex items-center gap-0.5 ml-2">
          {!isEditing && (
            <>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onStartEdit} title="Modifica evento" aria-label="Modifica evento">
                <Pencil className="h-3.5 w-3.5" />
              </Button>
              <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={(e) => { e.stopPropagation(); handleDelete(); }} title="Elimina evento" aria-label="Elimina evento">
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </>
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
          <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
            <span>Fonte: {sourceLabels[event.source_type] ?? event.source_type}</span>
            <span className={confidenceColor(event.confidence)}>{confidenceLabel(event.confidence)}</span>
            {documentName && (
              <span className="flex items-center gap-1">
                Doc: <span className="font-medium">{documentName}</span>
              </span>
            )}
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
            <div className="flex items-center justify-between">
              <Label>Descrizione</Label>
              <DictationButton
                size="icon"
                variant="icon-only"
                caseId={caseId}
                contextHint={`evento clinico ${event.event_type ?? ''}, ${editForm.diagnosis ?? ''}`}
                onTranscript={(text) => {
                  const sep = editForm.description.length > 0 && !editForm.description.endsWith(' ') ? ' ' : '';
                  setEditForm({ ...editForm, description: `${editForm.description}${sep}${text}` });
                }}
                className="h-7 w-7"
              />
            </div>
            <Textarea rows={4} value={editForm.description} onChange={(e) => setEditForm({ ...editForm, description: e.target.value })} />
          </div>
          <div>
            <div className="flex items-center justify-between">
              <Label>Note perito</Label>
              <DictationButton
                size="icon"
                variant="icon-only"
                caseId={caseId}
                contextHint="annotazione perito medico-legale"
                onTranscript={(text) => {
                  const sep = editForm.expertNotes.length > 0 && !editForm.expertNotes.endsWith(' ') ? ' ' : '';
                  setEditForm({ ...editForm, expertNotes: `${editForm.expertNotes}${sep}${text}` });
                }}
                className="h-7 w-7"
              />
            </div>
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
