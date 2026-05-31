'use client';

import { useState, useCallback, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Loader2, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader } from '@/components/ui/card';
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
import { addManualEvent, bulkVerifyEvents, bulkDeleteVerificationEvents } from '../../actions';
import { EVENT_TYPES, SOURCE_TYPES } from '@/lib/constants';
import { formatDate } from '@/lib/format';
import { sortEventsChrono } from '@/lib/event-order';
import { CheckCheck, Trash2 } from 'lucide-react';
import { EventCard } from './event-card';
import { EventEditSheet } from './event-edit-sheet';
import { IttItpSummary } from './itt-itp-summary';
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

type VerificationSubFilter = 'all' | 'date' | 'data' | 'other';
type EventViewTab = 'clinical' | 'admin' | 'all';

const NON_CLINICAL_TYPES = new Set(['documento_amministrativo', 'spesa_medica', 'certificato']);

function getVerificationType(e: EventRow): VerificationSubFilter {
  if (!e.event_date || e.event_date === '' || e.date_precision === 'sconosciuta') return 'date';
  if ((e.confidence as number) < 50 || ((e.reliability_notes ?? '') as string).toLowerCase().includes('ocr')) return 'data';
  return 'other';
}

// --- Events Tab ---

export function EventsTab({
  caseId, events, eventImages,
  highlightedEventOrderNumber, documents,
  onEventMutated,
}: {
  caseId: string;
  events: EventRow[];
  eventImages: Record<string, string[]>;
  highlightedEventOrderNumber?: number | null;
  /** Deprecated, kept for backward compat with parent passing it. */
  patientInitials?: string | null;
  /** Deprecated, kept for backward compat with parent passing it. */
  caseCode?: string;
  documents?: Array<{ id: string; file_name: string }>;
  /** UX Ondata 3-IA Fase D: chiamato dopo save/delete evento dal drawer.
      Permette al parent (report-step) di mostrare banner "rigenera sezione?". */
  onEventMutated?: () => void;
}) {
  const router = useRouter();
  const [expandedEvents, setExpandedEvents] = useState<Set<string>>(new Set());
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const [addEventOpen, setAddEventOpen] = useState(false);
  const docNameMap = new Map((documents ?? []).map((d) => [d.id, d.file_name]));
  const [eventViewTab, setEventViewTab] = useState<EventViewTab>('clinical');
  const [eventTypeFilter, setEventTypeFilter] = useState<string | null>(null);
  const [showOnlyVerification, setShowOnlyVerification] = useState(false);
  const [verificationSubFilter, setVerificationSubFilter] = useState<VerificationSubFilter>('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [searchText, setSearchText] = useState('');
  const [visibleCount, setVisibleCount] = useState(20);


  const toggleEvent = useCallback((eventId: string) => {
    setExpandedEvents((prev) => {
      const next = new Set(prev);
      if (next.has(eventId)) next.delete(eventId);
      else next.add(eventId);
      return next;
    });
  }, []);

  // Display the cronistoria in true chronological order (undated last), robust to
  // a misaligned persisted order_number (bug Lavini "ordine non cronologico").
  const altroEvents = sortEventsChrono(events.filter((e) => e.event_type === 'altro'));
  const clinicalEvents = sortEventsChrono(events.filter((e) => !NON_CLINICAL_TYPES.has(e.event_type)));
  const adminEvents = sortEventsChrono(events.filter((e) => NON_CLINICAL_TYPES.has(e.event_type)));

  // Split events into verification group
  const verificationEvents = events.filter((e) => isVerificationEvent(e));

  // Date range from real min/max (NOT array position — order_number may be misaligned).
  const realDates = events
    .map((e) => e.event_date)
    .filter((d): d is string => Boolean(d) && d !== '' && d !== '1900-01-01')
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const dateRange = realDates.length > 0
    ? { from: realDates[0], to: realDates[realDates.length - 1] }
    : null;

  // Tab-based base events
  const tabEvents = eventViewTab === 'clinical' ? clinicalEvents
    : eventViewTab === 'admin' ? adminEvents
    : events;

  const filteredEvents = tabEvents.filter((event) => {
    if (showOnlyVerification) {
      if (!isVerificationEvent(event)) return false;
      if (verificationSubFilter !== 'all' && getVerificationType(event) !== verificationSubFilter) return false;
    }
    if (eventTypeFilter && event.event_type !== eventTypeFilter) return false;
    if (dateFrom && event.event_date < dateFrom) return false;
    if (dateTo && event.event_date > dateTo) return false;
    if (searchText) {
      const q = searchText.toLowerCase();
      const haystack = `${event.title} ${event.description} ${event.doctor ?? ''} ${event.facility ?? ''} ${event.diagnosis ?? ''}`.toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  });

  // When showing all or filtered by type, split into groups
  const displayNormal = showOnlyVerification
    ? []
    : filteredEvents.filter((e) => !isVerificationEvent(e));
  const displayVerification = showOnlyVerification
    ? filteredEvents
    : filteredEvents.filter((e) => isVerificationEvent(e));

  const renderEventCard = (event: EventRow) => (
    <EventCard
      key={event.id}
      event={event}
      caseId={caseId}
      isExpanded={expandedEvents.has(event.id)}
      onToggle={() => toggleEvent(event.id)}
      onStartEdit={() => setEditingEventId(event.id)}
      onDeleted={() => router.refresh()}
      eventImages={eventImages}
      isHighlighted={highlightedEventOrderNumber === event.order_number}
      documentName={event.document_id ? docNameMap.get(event.document_id) : undefined}
    />
  );

  // UX Ondata 2: trova l'evento attualmente in editing per passarlo al Sheet.
  const editingEvent = editingEventId
    ? filteredEvents.find((e) => e.id === editingEventId) ?? null
    : null;

  return (
    <Card>
      <CardHeader>
        {/* Summary line — compact, single row (UX refactor Ondata 1) */}
        {events.length > 0 && (
          <div className="mb-3 text-sm text-muted-foreground">
            <strong className="text-foreground">{events.length}</strong> eventi
            {' '}({clinicalEvents.length} clinici
            {adminEvents.length > 0 ? `, ${adminEvents.length} documenti/spese` : ''}
            {verificationEvents.length > 0 ? (
              <>
                ,{' '}
                <span className="text-warning font-medium">
                  {verificationEvents.length} da valutare
                </span>
              </>
            ) : ''})
            {dateRange && (
              <span className="ml-1 hidden sm:inline">
                · {formatDate(dateRange.from)}—{formatDate(dateRange.to)}
              </span>
            )}
          </div>
        )}

        <div className="flex items-center justify-between">
          <div>
            {/* Clinical / Admin / All tabs (filtri preset rapidi) */}
            <div className="flex items-center gap-1 mb-1">
              <button type="button" onClick={() => { setEventViewTab('clinical'); setEventTypeFilter(null); setShowOnlyVerification(false); }}
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${eventViewTab === 'clinical' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'}`}>
                Cronistoria ({clinicalEvents.length})
              </button>
              {adminEvents.length > 0 && (
                <button type="button" onClick={() => { setEventViewTab('admin'); setEventTypeFilter(null); setShowOnlyVerification(false); }}
                  className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${eventViewTab === 'admin' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'}`}>
                  Documenti ({adminEvents.length})
                </button>
              )}
              <button type="button" onClick={() => { setEventViewTab('all'); setEventTypeFilter(null); setShowOnlyVerification(false); }}
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${eventViewTab === 'all' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'}`}>
                Tutti ({events.length})
              </button>
            </div>
              <CardDescription>
                {filteredEvents.length < tabEvents.length
                  ? `${filteredEvents.length} di ${tabEvents.length} eventi`
                  : `${tabEvents.length} eventi`}
                {displayNormal.length + displayVerification.length > visibleCount && (
                  <span className="text-muted-foreground"> — mostrando {Math.min(visibleCount, displayNormal.length + displayVerification.length)}</span>
                )}
              </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            {/* UX Ondata 3-IA Fase E: toggle Schede/Anteprima Perizia rimosso.
                L'anteprima A4 ora e' il Report stesso (vista principale).
                EventsTab e' solo vista "schede" per modifica eventi. */}
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
        <>
        {/* A2: graduated ITT/ITP summary (clinical / all views only) */}
        {eventViewTab !== 'admin' && <IttItpSummary events={events} />}
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
                <>
                  <button
                    type="button"
                    onClick={() => { setShowOnlyVerification(!showOnlyVerification); setVerificationSubFilter('all'); setEventTypeFilter(null); }}
                    className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                      showOnlyVerification && verificationSubFilter === 'all' ? 'bg-yellow-500 text-white' : 'bg-yellow-100 text-yellow-800 hover:bg-yellow-200'
                    }`}
                  >
                    Da verificare ({verificationEvents.length})
                  </button>
                  {showOnlyVerification && (() => {
                    const dateCount = verificationEvents.filter((e) => getVerificationType(e) === 'date').length;
                    const dataCount = verificationEvents.filter((e) => getVerificationType(e) === 'data').length;
                    const otherCount = verificationEvents.filter((e) => getVerificationType(e) === 'other').length;
                    return (
                      <>
                        {dateCount > 0 && (
                          <button type="button" onClick={() => setVerificationSubFilter(verificationSubFilter === 'date' ? 'all' : 'date')}
                            className={`rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors ${verificationSubFilter === 'date' ? 'bg-yellow-400 text-yellow-900' : 'bg-yellow-50 text-yellow-700 border border-yellow-300 hover:bg-yellow-100'}`}>
                            Data incerta ({dateCount})
                          </button>
                        )}
                        {dataCount > 0 && (
                          <button type="button" onClick={() => setVerificationSubFilter(verificationSubFilter === 'data' ? 'all' : 'data')}
                            className={`rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors ${verificationSubFilter === 'data' ? 'bg-orange-400 text-orange-900' : 'bg-orange-50 text-orange-700 border border-orange-300 hover:bg-orange-100'}`}>
                            Dati incerti ({dataCount})
                          </button>
                        )}
                        {otherCount > 0 && (
                          <button type="button" onClick={() => setVerificationSubFilter(verificationSubFilter === 'other' ? 'all' : 'other')}
                            className={`rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors ${verificationSubFilter === 'other' ? 'bg-red-400 text-red-900' : 'bg-red-50 text-red-700 border border-red-300 hover:bg-red-100'}`}>
                            Da verificare ({otherCount})
                          </button>
                        )}
                      </>
                    );
                  })()}
                </>
              )}
            </div>
            {/* Date range + text search filters */}
            <div className="flex flex-wrap gap-2 items-end">
              <div className="flex items-center gap-1.5">
                <label className="text-xs text-muted-foreground whitespace-nowrap">Da:</label>
                <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="h-7 rounded border px-2 text-xs bg-background" />
              </div>
              <div className="flex items-center gap-1.5">
                <label className="text-xs text-muted-foreground whitespace-nowrap">A:</label>
                <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="h-7 rounded border px-2 text-xs bg-background" />
              </div>
              <input
                type="text"
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                placeholder="Cerca medico, struttura, diagnosi..."
                className="h-7 rounded border px-2 text-xs bg-background flex-1 min-w-[180px]"
              />
              {(dateFrom || dateTo || searchText) && (
                <button
                  type="button"
                  onClick={() => { setDateFrom(''); setDateTo(''); setSearchText(''); }}
                  className="text-xs text-muted-foreground hover:text-foreground underline"
                >
                  Azzera filtri
                </button>
              )}
            </div>
          </div>
        )}
        <div className="space-y-2">
          {/* Normal events (lazy-loaded) */}
          {displayNormal.slice(0, visibleCount).map((event) => renderEventCard(event))}

          {/* Verification events separator */}
          {displayVerification.length > 0 && displayNormal.length > 0 && visibleCount >= displayNormal.length && (
            <div className="mt-2 space-y-2">
              <div className="flex items-center gap-2 py-3">
                <div className="h-px flex-1 bg-yellow-300" />
                <div className="flex items-center gap-1.5 rounded-full bg-yellow-100 px-3 py-1 text-xs font-medium text-yellow-800">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  Eventi da verificare ({displayVerification.length})
                </div>
                <div className="h-px flex-1 bg-yellow-300" />
              </div>
              <div className="flex items-center justify-between px-1">
                <p className="text-xs text-muted-foreground">
                  Questi eventi potrebbero richiedere una tua verifica.
                </p>
                <div className="flex items-center gap-1.5">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => {
                      toast('Verificare tutti gli eventi?', {
                        description: `${verificationEvents.length} eventi saranno segnati come verificati.`,
                        action: {
                          label: 'Verifica tutti',
                          onClick: async () => {
                            const result = await bulkVerifyEvents(caseId);
                            if (result.error) { toast.error(result.error); return; }
                            toast.success(`${result.count} eventi verificati`);
                            router.refresh();
                          },
                        },
                        cancel: { label: 'Annulla', onClick: () => {} },
                      });
                    }}
                  >
                    <CheckCheck className="mr-1 h-3 w-3" />
                    Verifica tutti
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs text-destructive hover:text-destructive"
                    onClick={() => {
                      toast('Eliminare tutti gli eventi da verificare?', {
                        description: `${verificationEvents.length} eventi saranno rimossi dalla cronistoria.`,
                        action: {
                          label: 'Elimina tutti',
                          onClick: async () => {
                            const result = await bulkDeleteVerificationEvents(caseId);
                            if (result.error) { toast.error(result.error); return; }
                            toast.success(`${result.count} eventi eliminati`);
                            router.refresh();
                          },
                        },
                        cancel: { label: 'Annulla', onClick: () => {} },
                      });
                    }}
                  >
                    <Trash2 className="mr-1 h-3 w-3" />
                    Elimina tutti
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* Verification events (shown after all normal are visible) */}
          {visibleCount >= displayNormal.length && (
            displayVerification.slice(0, Math.max(0, visibleCount - displayNormal.length)).map((event) =>
              renderEventCard(event)
            )
          )}

          {/* Show more button */}
          {visibleCount < displayNormal.length + displayVerification.length && (
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={() => setVisibleCount((prev) => prev + 20)}
            >
              Mostra altri 20 ({displayNormal.length + displayVerification.length - visibleCount} rimanenti)
            </Button>
          )}

          {events.length === 0 && (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Nessun evento estratto. Avvia l&apos;elaborazione dei documenti.
            </p>
          )}
        </div>
        </>
      </CardContent>

      {/* UX Ondata 2: edit di un evento avviene in Sheet laterale,
          non piu' inline dentro la card. Mantiene la lista leggibile. */}
      <EventEditSheet
        key={editingEventId ?? 'closed'}
        event={editingEvent}
        caseId={caseId}
        open={editingEventId !== null}
        onOpenChange={(open) => { if (!open) setEditingEventId(null); }}
        onSaved={() => { setEditingEventId(null); router.refresh(); onEventMutated?.(); }}
        onDeleted={() => { setEditingEventId(null); router.refresh(); onEventMutated?.(); }}
      />
    </Card>
  );
}
