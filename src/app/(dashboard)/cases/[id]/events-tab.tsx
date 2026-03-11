'use client';

import { useState, useCallback, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Loader2, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { addManualEvent, reorderEvent } from '../../actions';
import { EVENT_TYPES, SOURCE_TYPES } from '@/lib/constants';
import { EventCard } from './event-card';
import { BatchRetagDialog } from '@/components/batch-retag-dialog';
import type { EventRow } from './types';

// --- Add Event Dialog ---

function AddEventDialog({
  caseId, open, onOpenChange, onSuccess,
}: {
  caseId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [form, setForm] = useState({
    eventDate: '',
    datePrecision: 'giorno',
    eventType: 'altro',
    title: '',
    description: '',
    sourceType: 'altro',
    diagnosis: '',
    doctor: '',
    facility: '',
  });

  const handleSubmit = () => {
    if (!form.eventDate || !form.title || !form.description) return;
    startTransition(async () => {
      const result = await addManualEvent({
        caseId,
        eventDate: form.eventDate,
        datePrecision: form.datePrecision,
        eventType: form.eventType,
        title: form.title,
        description: form.description,
        sourceType: form.sourceType,
        diagnosis: form.diagnosis || null,
        doctor: form.doctor || null,
        facility: form.facility || null,
      });
      if (result?.error) {
        toast.error(result.error);
        return;
      }
      setForm({ eventDate: '', datePrecision: 'giorno', eventType: 'altro', title: '', description: '', sourceType: 'altro', diagnosis: '', doctor: '', facility: '' });
      onSuccess();
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Plus className="mr-1 h-3 w-3" />Aggiungi Evento
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Aggiungi Evento Manuale</DialogTitle>
          <DialogDescription>Aggiungi un evento non rilevato dal sistema.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label>Data *</Label>
              <Input type="date" value={form.eventDate} onChange={(e) => setForm({ ...form, eventDate: e.target.value })} />
            </div>
            <div>
              <Label>Precisione data</Label>
              <Select value={form.datePrecision} onValueChange={(v) => setForm({ ...form, datePrecision: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="giorno">Giorno</SelectItem>
                  <SelectItem value="mese">Mese</SelectItem>
                  <SelectItem value="anno">Anno</SelectItem>
                  <SelectItem value="sconosciuta">Sconosciuta</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Tipo evento *</Label>
              <Select value={form.eventType} onValueChange={(v) => setForm({ ...form, eventType: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {EVENT_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Fonte</Label>
              <Select value={form.sourceType} onValueChange={(v) => setForm({ ...form, sourceType: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SOURCE_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label>Titolo *</Label>
            <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Breve descrizione dell'evento" />
          </div>
          <div>
            <Label>Descrizione *</Label>
            <Textarea rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Descrizione completa..." />
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <Label>Diagnosi</Label>
              <Input value={form.diagnosis} onChange={(e) => setForm({ ...form, diagnosis: e.target.value })} />
            </div>
            <div>
              <Label>Medico</Label>
              <Input value={form.doctor} onChange={(e) => setForm({ ...form, doctor: e.target.value })} />
            </div>
            <div>
              <Label>Struttura</Label>
              <Input value={form.facility} onChange={(e) => setForm({ ...form, facility: e.target.value })} />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Annulla</Button>
          <Button onClick={handleSubmit} disabled={isPending || !form.eventDate || !form.title || !form.description}>
            {isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Plus className="mr-1 h-4 w-4" />}
            Aggiungi
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// --- Helpers ---

function isVerificationEvent(e: EventRow): boolean {
  return e.requires_verification || !e.event_date || e.event_date === '';
}

// --- Events Tab ---

export function EventsTab({
  caseId, events, eventImages, onImageClick,
  highlightedEventOrderNumber, onViewInReport,
}: {
  caseId: string;
  events: EventRow[];
  eventImages: Record<string, string[]>;
  onImageClick: (url: string) => void;
  highlightedEventOrderNumber?: number | null;
  onViewInReport?: (orderNumber: number) => void;
}) {
  const router = useRouter();
  const [expandedEvents, setExpandedEvents] = useState<Set<string>>(new Set());
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const [addEventOpen, setAddEventOpen] = useState(false);
  const [eventTypeFilter, setEventTypeFilter] = useState<string | null>(null);
  const [showOnlyVerification, setShowOnlyVerification] = useState(false);
  const [, startReorder] = useTransition();

  const toggleEvent = useCallback((eventId: string) => {
    setExpandedEvents((prev) => {
      const next = new Set(prev);
      if (next.has(eventId)) next.delete(eventId);
      else next.add(eventId);
      return next;
    });
  }, []);

  const handleMoveEvent = useCallback((eventId: string, direction: 'up' | 'down') => {
    startReorder(async () => {
      const result = await reorderEvent({ caseId, eventId, direction });
      if (result?.error) {
        toast.error(result.error);
        return;
      }
      router.refresh();
    });
  }, [caseId, router]);

  const altroEvents = events.filter((e) => e.event_type === 'altro');

  // Split events into verification group
  const verificationEvents = events.filter((e) => isVerificationEvent(e));

  const filteredEvents = events.filter((event) => {
    if (showOnlyVerification) return isVerificationEvent(event);
    if (eventTypeFilter) return event.event_type === eventTypeFilter;
    return true;
  });

  // When showing all or filtered by type, split into groups
  const displayNormal = showOnlyVerification
    ? []
    : filteredEvents.filter((e) => !isVerificationEvent(e));
  const displayVerification = showOnlyVerification
    ? filteredEvents
    : filteredEvents.filter((e) => isVerificationEvent(e));

  const renderEventCard = (event: EventRow, index: number, list: EventRow[]) => (
    <EventCard
      key={event.id}
      event={event}
      caseId={caseId}
      isExpanded={expandedEvents.has(event.id)}
      isEditing={editingEventId === event.id}
      onToggle={() => toggleEvent(event.id)}
      onStartEdit={() => { setEditingEventId(event.id); setExpandedEvents((p) => new Set(p).add(event.id)); }}
      onCancelEdit={() => setEditingEventId(null)}
      onSaved={() => { setEditingEventId(null); router.refresh(); }}
      onDeleted={() => router.refresh()}
      eventImages={eventImages}
      onImageClick={onImageClick}
      onMoveUp={() => handleMoveEvent(event.id, 'up')}
      onMoveDown={() => handleMoveEvent(event.id, 'down')}
      isFirst={index === 0}
      isLast={index === list.length - 1}
      isHighlighted={highlightedEventOrderNumber === event.order_number}
      onViewInReport={onViewInReport ? () => onViewInReport(event.order_number) : undefined}
    />
  );

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Eventi Clinici</CardTitle>
            <CardDescription>
              {events.length} eventi estratti
              {verificationEvents.length > 0 && (
                <span className="text-yellow-600"> ({verificationEvents.length} da verificare)</span>
              )}
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            {altroEvents.length > 0 && (
              <BatchRetagDialog
                caseId={caseId}
                events={altroEvents}
                onSaved={() => router.refresh()}
              />
            )}
            <AddEventDialog
              caseId={caseId}
              open={addEventOpen}
              onOpenChange={setAddEventOpen}
              onSuccess={() => { setAddEventOpen(false); router.refresh(); }}
            />
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {/* Filters */}
        {events.length > 0 && (
          <div className="mb-4 space-y-2">
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => { setEventTypeFilter(null); setShowOnlyVerification(false); }}
                className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                  !eventTypeFilter && !showOnlyVerification ? 'bg-primary text-primary-foreground' : 'bg-muted hover:bg-muted/80'
                }`}
              >
                Tutti ({events.length})
              </button>
              {EVENT_TYPES.map((t) => {
                const count = events.filter((e) => e.event_type === t.value).length;
                if (count === 0) return null;
                return (
                  <button
                    key={t.value}
                    type="button"
                    onClick={() => { setEventTypeFilter(eventTypeFilter === t.value ? null : t.value); setShowOnlyVerification(false); }}
                    className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                      eventTypeFilter === t.value ? 'bg-primary text-primary-foreground' : 'bg-muted hover:bg-muted/80'
                    }`}
                  >
                    {t.label} ({count})
                  </button>
                );
              })}
              {verificationEvents.length > 0 && (
                <button
                  type="button"
                  onClick={() => { setShowOnlyVerification(!showOnlyVerification); setEventTypeFilter(null); }}
                  className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                    showOnlyVerification ? 'bg-yellow-500 text-white' : 'bg-yellow-100 text-yellow-800 hover:bg-yellow-200'
                  }`}
                >
                  Da verificare ({verificationEvents.length})
                </button>
              )}
            </div>
          </div>
        )}
        <div className="space-y-2">
          {/* Normal events */}
          {displayNormal.map((event, index) => renderEventCard(event, index, displayNormal))}

          {/* Verification events separator */}
          {displayVerification.length > 0 && displayNormal.length > 0 && (
            <div className="flex items-center gap-2 py-3 mt-2">
              <div className="h-px flex-1 bg-yellow-300" />
              <div className="flex items-center gap-1.5 rounded-full bg-yellow-100 px-3 py-1 text-xs font-medium text-yellow-800">
                <AlertTriangle className="h-3.5 w-3.5" />
                Eventi da verificare ({displayVerification.length})
              </div>
              <div className="h-px flex-1 bg-yellow-300" />
            </div>
          )}

          {/* Verification events */}
          {displayVerification.map((event, index) => renderEventCard(event, index, displayVerification))}

          {events.length === 0 && (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Nessun evento estratto. Avvia l&apos;elaborazione dei documenti.
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
