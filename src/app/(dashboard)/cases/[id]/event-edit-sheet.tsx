'use client';

/**
 * Sheet drawer per la modifica di un singolo evento clinico.
 *
 * Sostituisce il pattern "form inline che crepa la lista eventi" che era
 * nel vecchio EventCard. Ora la lista resta sempre leggibile e l'edit
 * avviene in un pannello laterale dedicato a destra.
 *
 * Pattern UX refactor Ondata 2 — principio P3:
 *   "Lettura e modifica visivamente disambigui".
 */

import { useState, useTransition, useRef, useEffect, useCallback } from 'react';
import { Loader2, Save, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import {
  Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { TEMPORAL_SCOPES, TEMPORAL_SCOPE_LABELS, normalizeTemporalScope } from '@/lib/temporal-scope';
import { Textarea } from '@/components/ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { updateEvent, deleteEvent } from '../../actions';
import { EVENT_TYPES } from '@/lib/constants';
import { formatDate } from '@/lib/format';
import type { EventRow } from './types';

interface EventEditSheetProps {
  /** L'evento da modificare. Quando null, il Sheet e' chiuso. */
  event: EventRow | null;
  caseId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Chiamato dopo un salvataggio riuscito. */
  onSaved: () => void;
  /** Chiamato dopo eliminazione riuscita. */
  onDeleted: () => void;
}

interface EditFormState {
  title: string;
  description: string;
  eventType: string;
  eventDate: string;
  diagnosis: string;
  doctor: string;
  facility: string;
  expertNotes: string;
  /** Ambito temporale (0034): correggibile dal perito perché pilota calcoli e resa. */
  temporalScope: string;
}

function buildFormState(event: EventRow): EditFormState {
  return {
    title: event.title,
    description: event.description,
    eventType: event.event_type,
    eventDate: event.event_date,
    diagnosis: event.diagnosis ?? '',
    doctor: event.doctor ?? '',
    facility: event.facility ?? '',
    expertNotes: event.expert_notes ?? '',
    temporalScope: normalizeTemporalScope(event.temporal_scope),
  };
}

export function EventEditSheet({
  event, caseId, open, onOpenChange, onSaved, onDeleted,
}: EventEditSheetProps) {
  // Il form interno segnala qui se è "sporco" (campi modificati): così la chiusura
  // — backdrop, Esc o 'Annulla', che passano tutti da onOpenChange — può chiedere
  // conferma invece di scartare in silenzio il lavoro del perito.
  const dirtyRef = useRef(false);

  const handleOpenChange = useCallback((next: boolean) => {
    if (!next && dirtyRef.current
      && !window.confirm('Ci sono modifiche non salvate a questo evento. Chiudere senza salvarle?')) {
      return;
    }
    onOpenChange(next);
  }, [onOpenChange]);

  const setDirty = useCallback((d: boolean) => { dirtyRef.current = d; }, []);

  if (!event) {
    // Render nothing when no event selected. The parent passes `key={event.id}`
    // so the inner form is recreated (and state reset) for each distinct event.
    return null;
  }

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-xl overflow-y-auto">
        <EventEditForm
          event={event}
          caseId={caseId}
          onClose={() => handleOpenChange(false)}
          onDirtyChange={setDirty}
          onSaved={onSaved}
          onDeleted={onDeleted}
        />
      </SheetContent>
    </Sheet>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Inner form — split out so it can use `useState` initialized from
// `event` props on first render. Parent passes `key={event.id}` so
// React unmounts/remounts when a different event is opened, resetting
// the form to the new event's data without useEffect.
// ─────────────────────────────────────────────────────────────────────

interface EventEditFormProps {
  event: EventRow;
  caseId: string;
  onClose: () => void;
  onDirtyChange: (dirty: boolean) => void;
  onSaved: () => void;
  onDeleted: () => void;
}

function EventEditForm({ event, caseId, onClose, onDirtyChange, onSaved, onDeleted }: EventEditFormProps) {
  const [isPending, startTransition] = useTransition();
  const [initial] = useState<EditFormState>(() => buildFormState(event));
  const [form, setForm] = useState<EditFormState>(initial);

  // "Sporco" = form diverso dallo stato iniziale. Riportato al wrapper così la
  // chiusura può chiedere conferma. (Confronto JSON: gli oggetti sono piccoli e piatti.)
  const isDirty = JSON.stringify(form) !== JSON.stringify(initial);
  useEffect(() => { onDirtyChange(isDirty); }, [isDirty, onDirtyChange]);

  const handleSave = () => {
    if (!form) return;
    startTransition(async () => {
      const result = await updateEvent({
        eventId: event.id,
        caseId,
        title: form.title,
        description: form.description,
        eventType: form.eventType,
        eventDate: form.eventDate,
        diagnosis: form.diagnosis || null,
        doctor: form.doctor || null,
        facility: form.facility || null,
        expertNotes: form.expertNotes || null,
        temporalScope: form.temporalScope,
      });
      if (result?.error) {
        toast.error(result.error);
        return;
      }
      onDirtyChange(false); // salvato → non più sporco: la chiusura non deve chiedere conferma
      toast.success('Evento salvato');
      onSaved();
    });
  };

  const handleDelete = () => {
    if (!event) return;
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
            onDirtyChange(false); // eliminato → la chiusura non deve chiedere conferma
            onDeleted();
          });
        },
      },
      cancel: { label: 'Annulla', onClick: () => {} },
    });
  };

  return (
    <>
      <SheetHeader className="pb-4 border-b">
        <SheetTitle>Modifica evento</SheetTitle>
        <SheetDescription>
          {formatDate(event.event_date)} — {event.title}
        </SheetDescription>
      </SheetHeader>

      <div className="space-y-4 py-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label>Titolo</Label>
              <Input
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
              />
            </div>
            <div>
              <Label>Data</Label>
              <Input
                type="date"
                value={form.eventDate}
                onChange={(e) => setForm({ ...form, eventDate: e.target.value })}
              />
            </div>
            <div>
              <Label>Tipo evento</Label>
              <Select value={form.eventType} onValueChange={(v) => setForm({ ...form, eventType: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {EVENT_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Ambito temporale</Label>
              <Select value={form.temporalScope} onValueChange={(v) => setForm({ ...form, temporalScope: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TEMPORAL_SCOPES.map((s) => (
                    <SelectItem key={s} value={s}>{TEMPORAL_SCOPE_LABELS[s]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="mt-1 text-xs text-muted-foreground">
                «Riferito» = il documento lo cita come già avvenuto (anamnesi); «Programmato» = previsto, non conta nei calcoli.
              </p>
            </div>
            <div>
              <Label>Diagnosi</Label>
              <Input
                value={form.diagnosis}
                onChange={(e) => setForm({ ...form, diagnosis: e.target.value })}
              />
            </div>
            <div>
              <Label>Medico</Label>
              <Input
                value={form.doctor}
                onChange={(e) => setForm({ ...form, doctor: e.target.value })}
              />
            </div>
            <div>
              <Label>Struttura</Label>
              <Input
                value={form.facility}
                onChange={(e) => setForm({ ...form, facility: e.target.value })}
              />
            </div>
          </div>

          <div>
            <Label>Descrizione</Label>
            <Textarea
              rows={5}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </div>

          <div>
            <Label>Note perito</Label>
            <Textarea
              rows={3}
              value={form.expertNotes}
              onChange={(e) => setForm({ ...form, expertNotes: e.target.value })}
              placeholder="Annotazioni del perito..."
            />
          </div>
        </div>

        {/* Sticky footer with actions — Salva on the right (primary), Elimina far-left (destructive) */}
        <div className="sticky bottom-0 -mx-6 px-6 pt-4 pb-2 border-t bg-background flex items-center justify-between">
          <Button
            variant="destructive"
            size="sm"
            onClick={handleDelete}
            disabled={isPending}
          >
            <Trash2 className="mr-1 h-3.5 w-3.5" />
            Elimina
          </Button>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={onClose}
              disabled={isPending}
            >
              <X className="mr-1 h-3.5 w-3.5" />
              Annulla
            </Button>
            <Button
              variant="approve"
              size="sm"
              onClick={handleSave}
              disabled={isPending}
            >
              {isPending ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Save className="mr-1 h-3.5 w-3.5" />}
              Salva
            </Button>
          </div>
        </div>
    </>
  );
}
