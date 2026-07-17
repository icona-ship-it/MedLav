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
  Check, ChevronDown, ChevronUp, ExternalLink, Pencil, Trash2, ZoomIn,
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

/** Traduce le note tecniche della pipeline in italiano piano per il perito
 * (founder 2026-07-17: "è chiaro al 100% PERCHÉ viene segnalato?"). Le note
 * sono salvate nel DB col wording interno; la traduzione avviene in display
 * così copre anche gli eventi già estratti. Segmenti sconosciuti (note libere
 * dell'AI, es. deduzione dell'imposta di bollo) passano com'erano: sono già
 * scritte per l'utente. */
function translateReliabilityNote(segment: string): string {
  const s = segment.trim();
  if (/testo sorgente non riscontrato/i.test(s) || /citazione sorgente non riscontrata/i.test(s)) {
    return 'La citazione estratta non coincide alla lettera col testo del documento: controlla che date, diagnosi e lateralità corrispondano al documento originale.';
  }
  if (/testo sorgente assente/i.test(s) || /citazione sorgente assente/i.test(s)) {
    return 'L\'AI non ha indicato il punto esatto del documento da cui ha preso questi dati: verificali sul documento originale.';
  }
  if (/diagnosi discordanti/i.test(s)) {
    return 'I documenti riportano diagnosi tra loro discordanti: decidi tu quale prevale.';
  }
  if (/inferit/i.test(s)) {
    return 'La data non è scritta nel documento: l\'AI l\'ha dedotta dal contesto. Confermala o correggila.';
  }
  return s;
}

/** Spiegazione completa del flag "da verificare" per il riquadro dedicato. */
function verificationReasons(event: EventRow): string[] {
  const reasons: string[] = [];
  if (!event.event_date) {
    reasons.push('L\'evento non ha una data certa: assegnala o confermala.');
  }
  const segments = (event.reliability_notes ?? '').split('; ').filter((s) => s.trim().length > 0);
  for (const seg of segments) {
    reasons.push(translateReliabilityNote(seg));
  }
  if (reasons.length === 0) {
    reasons.push('L\'AI chiede una tua conferma su questo evento: controlla i dati principali contro il documento.');
  }
  // Dedup: due note diverse possono tradursi nella stessa spiegazione.
  return [...new Set(reasons)];
}

/** Il testo OCR salvato contiene segnaposto ([tbl-0.html]) e tabelle in HTML
 * grezzo: per il perito sono rumore. Le celle diventano testo leggibile
 * ("Data e ora di accesso · 13/09/2025 11:08"), una riga per riga di tabella. */
function cleanOcrForDisplay(text: string): string {
  return text
    .replace(/\[tbl-\d+\.html\]\(tbl-\d+\.html\)/g, '')
    .replace(/\[TABLE_HTML_(?:START|END)\]/g, '')
    .replace(/<\/tr>/gi, '\n')
    .replace(/<\/t[dh]>/gi, ' · ')
    .replace(/<\/?[a-z][a-z0-9]*(?:\s[^>]*)?\/?>/gi, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function SourceTextSection({
  sourceText, sourcePages, fullPageText, viewDocumentUrl, defaultOpen = false,
}: {
  sourceText: string | null;
  sourcePages: string | null;
  /** Testo OCR COMPLETO delle pagine sorgente (founder 2026-07-17: per
   * verificare serve la pagina intera in un box scrollabile, non solo la
   * citazione estratta). Null se le pagine non sono disponibili nel contesto. */
  fullPageText: string | null;
  /** Link che apre il file originale caricato (route /view, nuova scheda). */
  viewDocumentUrl: string | null;
  defaultOpen?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  const parsedPages: number[] = sourcePages ? (() => {
    try { return JSON.parse(sourcePages) as number[]; } catch { return []; }
  })() : [];

  const boxText = fullPageText ?? sourceText;
  if (!boxText && !viewDocumentUrl) return null;

  return (
    <div className="pt-2 border-t">
      <div className="flex items-center justify-between gap-2">
        {/* Niente chevron se non c'è testo da mostrare (toggle morto, audit
            2026-07-17): resta solo il link al file. */}
        {boxText ? (
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
        ) : (
          <span className="text-xs text-muted-foreground">Testo non disponibile in questa vista</span>
        )}
        {viewDocumentUrl && (
          <a
            href={viewDocumentUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline shrink-0"
            title="Apre il file caricato in una nuova scheda"
          >
            <ExternalLink className="h-3 w-3" />
            Apri documento originale
          </a>
        )}
      </div>
      {isOpen && boxText && (
        <pre className="mt-2 rounded bg-muted p-3 text-xs whitespace-pre-wrap font-mono max-h-64 overflow-y-auto">
          {boxText}
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
  /** Chiamato dopo «Segna verificato» riuscito (parent fa router.refresh):
   * senza, badge/contatori/coda restavano fermi finché non si faceva altro
   * (audit 2026-07-17). */
  onVerified?: () => void;
  eventImages: Record<string, string[]>;
  isHighlighted?: boolean;
  documentName?: string;
  /** Pagine OCR del caso (per mostrare il testo COMPLETO della pagina sorgente
   * nel box di verifica). Tipizzato strutturale: basta ciò che serve qui. */
  documentPages?: Array<{ document_id: string; page_number: number; ocr_text: string | null }>;
}

export function EventCard({
  event, caseId, isExpanded, onToggle, onStartEdit, onDeleted, onVerified,
  eventImages, isHighlighted, documentName, documentPages,
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
        onVerified?.();
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
                <span
                  className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 text-yellow-700 dark:text-yellow-400"
                  title="L'AI chiede una tua conferma su questo evento: controllalo e premi «Segna verificato»"
                >
                  <span className="inline-block h-2 w-2 rounded-full bg-yellow-400 shrink-0" />
                  da verificare
                </span>
              )}
              {isClinical && !includeInChrono && (
                <Badge variant="secondary" className="text-xs">Fuori cronologia</Badge>
              )}
            </div>
            <p className="mt-1 text-sm font-medium">{event.title}</p>
          </div>
        </button>
        <div className="flex items-center gap-0.5 ml-2">
          {/* Bottone di verifica ESPLICITO (founder 2026-07-17): prima l'unica via
              era il badge cliccabile — sembrava un'etichetta, nessuno lo scopriva. */}
          {/* Azione, non etichetta (founder 2026-07-17): "Verificato" sembrava
              uno STATO già raggiunto — il verbo dice cosa succede al click. */}
          {event.requires_verification && (
            <Button
              size="sm"
              className="h-7 text-xs bg-green-600 text-white hover:bg-green-700 dark:bg-green-700 dark:hover:bg-green-600 mr-1"
              onClick={(e) => { e.stopPropagation(); handleQuickVerify(); }}
              disabled={isPending || isVerifying}
              title="Confermi di aver controllato questo evento: esce dalla coda «da verificare»"
            >
              <Check className="mr-1 h-3.5 w-3.5" />
              {isVerifying ? 'Confermo…' : 'Segna verificato'}
            </Button>
          )}
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
          {/* PERCHÉ è da verificare — riquadro esplicito (founder 2026-07-17): il
              motivo era una riga in corsivo grigio col wording interno della
              pipeline; il perito deve leggere il perché e il cosa fare. */}
          {event.requires_verification ? (
            <div className="rounded-md border border-amber-200 bg-amber-50 p-2.5 dark:border-amber-800 dark:bg-amber-950/30">
              <p className="text-sm font-medium text-amber-800 dark:text-amber-300">Perché è da verificare</p>
              <ul className="mt-1 space-y-0.5">
                {verificationReasons(event).map((r) => (
                  <li key={r} className="text-sm text-amber-800/90 dark:text-amber-200/90">{r}</li>
                ))}
              </ul>
            </div>
          ) : (
            event.reliability_notes && (
              <p className="text-sm text-muted-foreground italic">
                {(event.reliability_notes.split('; ')).map(translateReliabilityNote).join(' ')}
              </p>
            )
          )}
          {event.expert_notes && (
            <div className="rounded bg-muted p-2">
              <p className="text-sm"><span className="font-medium">Note perito:</span> {event.expert_notes}</p>
            </div>
          )}
          {(event.source_text || event.document_id) && (() => {
            // Testo completo delle pagine sorgente (se disponibili nel contesto):
            // per la verifica serve leggere la pagina vera, non solo la citazione.
            const parsedPages: number[] = event.source_pages ? (() => {
              try { return JSON.parse(event.source_pages) as number[]; } catch { return []; }
            })() : [];
            const pageTexts = (documentPages ?? [])
              .filter((p) => p.document_id === event.document_id
                && (parsedPages.length === 0 || parsedPages.includes(p.page_number))
                && p.ocr_text)
              .sort((a, b) => a.page_number - b.page_number);
            const fullPageText = pageTexts.length > 0
              ? pageTexts.map((p) => `— pag. ${p.page_number} —\n${cleanOcrForDisplay(p.ocr_text ?? '')}`).join('\n\n')
              : null;
            return (
              <SourceTextSection
                sourceText={event.source_text}
                sourcePages={event.source_pages}
                fullPageText={fullPageText}
                viewDocumentUrl={event.document_id ? `/api/cases/${caseId}/documents/${event.document_id}/view` : null}
                defaultOpen={event.requires_verification}
              />
            );
          })()}
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
