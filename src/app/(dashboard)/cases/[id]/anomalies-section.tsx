'use client';

import { useState, useCallback, useTransition, useRef, useMemo } from 'react';
import { AlertTriangle, FileWarning, Upload, Loader2, Eye, EyeOff, ShieldCheck, Archive, ThumbsUp, ChevronDown, ChevronRight, Pencil, Undo2, CheckCircle2, XCircle, FileText, Lightbulb } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
// Textarea removed — anomaly descriptions are read-only
import { anomalyTypeLabels } from '@/lib/constants';
import { dismissAnomaly, confirmAnomaly, saveDocumentMetadata, updateCaseDocumentCount, checkDuplicateDocument } from '../../actions';
import { revertAnomalyDecision } from '../../actions/anomaly-actions';
import { createClient } from '@/lib/supabase/client';
import { computeFileSha256 } from '@/lib/file-hash';
import type { AnomalyRow, MissingDocRow, EventRow, Document } from './types';

// --- Types ---

interface InvolvedEvent {
  orderNumber: number;
  title: string;
  date: string;
}

interface AnomaliesSectionProps {
  caseId: string;
  anomalies: AnomalyRow[];
  events?: EventRow[];
  documents?: Document[];
  onChanged?: (dismissedId?: string) => void;
}

interface MissingDocsSectionProps {
  missingDocs: MissingDocRow[];
  caseId?: string;
  onUploadComplete?: () => void;
}

// --- Helpers ---

function severityVariant(severity: string): 'destructive' | 'warning' | 'secondary' {
  switch (severity) {
    case 'critica': case 'alta': return 'destructive';
    case 'media': return 'warning';
    default: return 'secondary';
  }
}

interface GuidedQuestion {
  question: string;
  options: Array<{ label: string; action: 'confirm' | 'dismiss' }>;
}

interface AnomalyGuidanceEntry {
  meaning: string;
  howToResolve: string;
  questions: GuidedQuestion[];
}

/** Per-type guidance: what it means, how to resolve, and guided questions */
const anomalyGuidance: Record<string, AnomalyGuidanceEntry> = {
  ritardo_diagnostico: {
    meaning: 'Tra il momento in cui i sintomi sono comparsi e la diagnosi è passato un tempo superiore alla norma.',
    howToResolve: 'Verifica se esistono documenti che giustifichino il ritardo (visite intermedie, esami in attesa). Se il ritardo è reale e rilevante, confermalo per includerlo nel report. Se hai documentazione che copre il periodo, caricala nello Step 1.',
    questions: [{
      question: 'Hai documentazione di visite o esami nel periodo del ritardo?',
      options: [
        { label: 'No, il ritardo diagnostico è reale e rilevante', action: 'confirm' },
        { label: 'Non è rilevante per questa perizia', action: 'dismiss' },
      ],
    }],
  },
  gap_post_chirurgico: {
    meaning: 'Dopo un intervento chirurgico non risulta documentazione di follow-up nel periodo atteso.',
    howToResolve: 'Controlla se esistono referti di visite post-operatorie o lettere di dimissione non ancora caricati. Se il follow-up è avvenuto ma manca la documentazione, caricala. Se il gap è reale, confermalo.',
    questions: [{
      question: 'Esistono referti di follow-up post-operatorio non ancora caricati?',
      options: [
        { label: 'No, il follow-up manca davvero', action: 'confirm' },
        { label: 'Il follow-up non è rilevante per il caso', action: 'dismiss' },
      ],
    }],
  },
  gap_documentale: {
    meaning: 'Nella timeline clinica c\'è un periodo significativo senza documentazione.',
    howToResolve: 'Verifica se mancano referti, visite o esami relativi a quel periodo. Puoi caricare la documentazione mancante nello Step 1, oppure ignorare se il gap non è rilevante per la perizia.',
    questions: [{
      question: 'Hai documentazione che copre questo periodo?',
      options: [
        { label: 'No, il gap nella documentazione è reale', action: 'confirm' },
        { label: 'Non è rilevante per questa perizia', action: 'dismiss' },
      ],
    }],
  },
  complicanza_non_gestita: {
    meaning: 'È stata rilevata una complicanza per la quale non risulta un trattamento o gestione documentata.',
    howToResolve: 'Controlla se esiste documentazione sulla gestione della complicanza non ancora caricata. Se la complicanza è stata gestita ma non documentata, annota nei tuoi appunti. Se è reale, confermala.',
    questions: [{
      question: 'La complicanza è stata gestita ma la documentazione non è stata caricata?',
      options: [
        { label: 'No, la complicanza non è stata gestita', action: 'confirm' },
        { label: 'È stata gestita, manca solo il documento', action: 'dismiss' },
      ],
    }],
  },
  consenso_non_documentato: {
    meaning: 'Per una procedura invasiva non risulta il consenso informato nella documentazione.',
    howToResolve: 'Verifica se il modulo di consenso informato è disponibile e caricalo. Se non esiste, confermalo come anomalia — è un elemento rilevante per la perizia.',
    questions: [{
      question: 'Il consenso informato esiste ma non è stato caricato?',
      options: [
        { label: 'No, il consenso informato manca', action: 'confirm' },
        { label: 'Il consenso c\'è, devo caricarlo', action: 'dismiss' },
      ],
    }],
  },
  diagnosi_contraddittoria: {
    meaning: 'Due o più documenti riportano diagnosi diverse o contrastanti per la stessa condizione.',
    howToResolve: 'Esamina i documenti coinvolti per capire se si tratta di un\'evoluzione diagnostica (normale) o di un errore. Se è un\'evoluzione, ignorala. Se è una contraddizione reale, confermala.',
    questions: [{
      question: 'Le diagnosi diverse rappresentano un\'evoluzione nel tempo o una contraddizione?',
      options: [
        { label: 'È una contraddizione reale', action: 'confirm' },
        { label: 'È una normale evoluzione diagnostica', action: 'dismiss' },
      ],
    }],
  },
  terapia_senza_followup: {
    meaning: 'È stata prescritta una terapia senza successivi controlli documentati per valutarne l\'efficacia.',
    howToResolve: 'Verifica se esistono referti di controllo non ancora caricati. Se il follow-up è avvenuto altrove, annotalo. Se manca davvero, confermalo come anomalia.',
    questions: [{
      question: 'Esistono referti di controllo sulla terapia non ancora caricati?',
      options: [
        { label: 'No, il follow-up terapeutico manca', action: 'confirm' },
        { label: 'Il follow-up è avvenuto, manca il documento', action: 'dismiss' },
      ],
    }],
  },
  valore_clinico_critico: {
    meaning: 'Un valore di laboratorio o parametro clinico risulta fuori range in modo significativo.',
    howToResolve: 'Verifica se il valore è stato gestito clinicamente (terapia aggiustata, ricovero, ecc.). Se la gestione è documentata altrove, carica il documento. Se il valore critico non è stato gestito, confermalo.',
    questions: [{
      question: 'Il valore critico è stato gestito clinicamente?',
      options: [
        { label: 'No, non risulta gestione documentata', action: 'confirm' },
        { label: 'Sì, ma la documentazione non è caricata', action: 'dismiss' },
      ],
    }],
  },
  sequenza_temporale_violata: {
    meaning: 'L\'ordine cronologico degli eventi clinici presenta incongruenze (es. referto datato prima della visita).',
    howToResolve: 'Spesso si tratta di errori di data nei documenti. Verifica le date reali. Se è un errore di trascrizione, ignorala. Se la sequenza è effettivamente anomala, confermala.',
    questions: [{
      question: 'L\'incongruenza temporale è un errore di data o un\'anomalia reale?',
      options: [
        { label: 'È un\'anomalia reale nella sequenza clinica', action: 'confirm' },
        { label: 'È solo un errore di data/trascrizione', action: 'dismiss' },
      ],
    }],
  },
};

function parseInvolvedEvents(involvedEventsJson: string | null): InvolvedEvent[] {
  if (!involvedEventsJson) return [];
  try {
    const parsed = JSON.parse(involvedEventsJson) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.map((e: Record<string, unknown>) => ({
      orderNumber: typeof e.orderNumber === 'number' ? e.orderNumber : 0,
      title: typeof e.title === 'string' ? e.title : '',
      date: typeof e.date === 'string' ? e.date : '',
    }));
  } catch {
    return [];
  }
}

function resolveEventReferences(
  involvedEvents: InvolvedEvent[],
  events?: EventRow[],
  documents?: Document[],
): string[] {
  if (!events || involvedEvents.length === 0) return [];

  return involvedEvents.map((ie) => {
    const matchedEvent = events.find((e) => e.order_number === ie.orderNumber);
    if (!matchedEvent) return `Evento #${ie.orderNumber}: ${ie.title}`;

    const docName = matchedEvent.document_id && documents
      ? documents.find((d) => d.id === matchedEvent.document_id)?.file_name
      : null;

    let sourcePages = '';
    if (matchedEvent.source_pages) {
      try {
        const parsed = JSON.parse(matchedEvent.source_pages) as unknown;
        if (Array.isArray(parsed) && parsed.length > 0) {
          const pageNumbers = parsed.filter((p): p is number => typeof p === 'number');
          if (pageNumbers.length > 0) {
            sourcePages = `, pag. ${pageNumbers.join(', ')}`;
          }
        }
      } catch {
        // Not JSON — use as plain string, stripping brackets if present
        const clean = matchedEvent.source_pages.replace(/^\[|\]$/g, '').trim();
        if (clean) {
          sourcePages = `, pag. ${clean}`;
        }
      }
    }

    const docRef = docName ? ` — Doc: ${docName}${sourcePages}` : '';
    return `Evento #${ie.orderNumber}: ${ie.title}${docRef}`;
  });
}

// --- Anomaly Card ---
//
// Three distinct layouts based on status:
//   - actionable (detected | llm_confirmed): full layout with description,
//     references, "Cosa devi decidere" (always visible), note textarea, action buttons
//   - confirmed (user_confirmed): compact summary with note + Modifica/Annulla
//   - dismissed (user_dismissed): compact summary with Annulla esclusione
//   - resolved (llm_resolved): minimal — title + badge, in collapsed parent section

function AnomalyCard({
  anomaly,
  events,
  documents,
  caseId,
  onChanged,
}: {
  anomaly: AnomalyRow;
  events?: EventRow[];
  documents?: Document[];
  caseId: string;
  onChanged?: (dismissedId?: string) => void;
}) {
  const involvedEvents = parseInvolvedEvents(anomaly.involved_events);
  const references = resolveEventReferences(involvedEvents, events, documents);
  const guidance = anomalyGuidance[anomaly.anomaly_type];
  const typeLabel = anomalyTypeLabels[anomaly.anomaly_type] ?? anomaly.anomaly_type;

  const status = anomaly.status;

  if (status === 'user_confirmed') {
    return (
      <ConfirmedAnomalyCard
        anomaly={anomaly}
        typeLabel={typeLabel}
        caseId={caseId}
        onChanged={onChanged}
      />
    );
  }

  if (status === 'user_dismissed') {
    return (
      <DismissedAnomalyCard
        anomaly={anomaly}
        typeLabel={typeLabel}
        caseId={caseId}
        onChanged={onChanged}
      />
    );
  }

  if (status === 'llm_resolved') {
    return (
      <ResolvedAnomalyCard anomaly={anomaly} typeLabel={typeLabel} />
    );
  }

  // Actionable: detected | llm_confirmed
  return (
    <ActionableAnomalyCard
      anomaly={anomaly}
      typeLabel={typeLabel}
      references={references}
      guidance={guidance}
      caseId={caseId}
      onChanged={onChanged}
    />
  );
}

// --- Layout: actionable anomaly (detected | llm_confirmed) ---

function ActionableAnomalyCard({
  anomaly,
  typeLabel,
  references,
  guidance,
  caseId,
  onChanged,
}: {
  anomaly: AnomalyRow;
  typeLabel: string;
  references: string[];
  guidance: AnomalyGuidanceEntry | undefined;
  caseId: string;
  onChanged?: (dismissedId?: string) => void;
}) {
  // Textarea ALWAYS starts empty — the perito writes from scratch.
  const [expertNote, setExpertNote] = useState('');
  const [isDismissing, startDismiss] = useTransition();
  const [isConfirming, startConfirm] = useTransition();

  const handleDismiss = useCallback(() => {
    startDismiss(async () => {
      const result = await dismissAnomaly({
        anomalyId: anomaly.id, caseId,
        resolutionNote: expertNote.trim() || null,
      });
      if (result.error) { toast.error(result.error); return; }
      toast.success('Anomalia esclusa dal report');
      onChanged?.(anomaly.id);
    });
  }, [anomaly.id, caseId, expertNote, onChanged]);

  const handleConfirm = useCallback(() => {
    startConfirm(async () => {
      const result = await confirmAnomaly({
        anomalyId: anomaly.id, caseId,
        resolutionNote: expertNote.trim() || null,
      });
      if (result.error) { toast.error(result.error); return; }
      toast.success('Anomalia segnalata nel report');
      onChanged?.();
    });
  }, [anomaly.id, caseId, expertNote, onChanged]);

  return (
    <div className="rounded-md border border-orange-200 dark:border-orange-900/50 bg-orange-50/50 dark:bg-orange-950/10 p-3">
      {/* Header */}
      <div className="flex items-center gap-2 flex-wrap mb-2">
        <Badge variant={severityVariant(anomaly.severity)}>{anomaly.severity.toUpperCase()}</Badge>
        <Badge variant="outline" className="text-xs border-orange-500 text-orange-700 dark:text-orange-400 bg-white dark:bg-orange-950/30">
          Da valutare
        </Badge>
        <span className="text-sm font-semibold">{typeLabel}</span>
      </div>

      {/* Description */}
      <p className="text-sm">{anomaly.description}</p>

      {/* References */}
      {references.length > 0 && (
        <div className="mt-2 space-y-0.5">
          {references.map((ref) => (
            <p key={ref} className="text-xs text-muted-foreground flex items-start gap-1">
              <FileText className="h-3 w-3 mt-0.5 shrink-0" />
              {ref}
            </p>
          ))}
        </div>
      )}

      {/* "Cosa devi decidere" — always visible, no toggle */}
      {guidance && (
        <div className="mt-3 rounded-md bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 p-3 space-y-2">
          <p className="text-xs font-semibold text-blue-900 dark:text-blue-300 flex items-center gap-1.5">
            <Lightbulb className="h-3.5 w-3.5" />
            Cosa devi decidere
          </p>
          <div>
            <p className="text-xs font-medium text-blue-900 dark:text-blue-300">Cosa significa</p>
            <p className="text-xs text-blue-800 dark:text-blue-400">{guidance.meaning}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-blue-900 dark:text-blue-300">Cosa fare</p>
            <p className="text-xs text-blue-800 dark:text-blue-400">{guidance.howToResolve}</p>
          </div>
        </div>
      )}

      {/* Note + actions */}
      <div className="mt-3 pt-3 border-t border-dashed border-orange-200 dark:border-orange-900/50 space-y-2.5">
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-foreground flex items-center gap-1">
            <Pencil className="h-3 w-3" />
            La tua nota nel report (opzionale)
          </label>
          <textarea
            className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm min-h-[60px] resize-y"
            placeholder='Es: "Il trattamento risulta documentato in relazione successiva non inclusa nel fascicolo"'
            value={expertNote}
            onChange={(e) => setExpertNote(e.target.value)}
          />
          <p className="text-[11px] text-muted-foreground">
            Quello che scrivi qui sarà integrato nel report finale.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="default"
            size="sm"
            className="h-8 text-xs"
            onClick={handleConfirm}
            disabled={isConfirming || isDismissing}
          >
            {isConfirming ? (
              <Loader2 className="mr-1 h-3 w-3 animate-spin" />
            ) : (
              <ThumbsUp className="mr-1 h-3 w-3" />
            )}
            Includi nel report
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs"
            onClick={handleDismiss}
            disabled={isConfirming || isDismissing}
          >
            {isDismissing ? (
              <Loader2 className="mr-1 h-3 w-3 animate-spin" />
            ) : (
              <Archive className="mr-1 h-3 w-3" />
            )}
            Non includere
          </Button>
        </div>
      </div>
    </div>
  );
}

// --- Layout: confirmed by perito (user_confirmed) ---

function ConfirmedAnomalyCard({
  anomaly,
  typeLabel,
  caseId,
  onChanged,
}: {
  anomaly: AnomalyRow;
  typeLabel: string;
  caseId: string;
  onChanged?: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draftNote, setDraftNote] = useState(anomaly.resolution_note ?? '');
  const [isSaving, startSave] = useTransition();
  const [isReverting, startRevert] = useTransition();

  const handleSaveNote = useCallback(() => {
    startSave(async () => {
      // Re-confirm with new note. Action requires actionable status, so we
      // revert first, then re-confirm. This keeps the audit trail clean.
      const revertRes = await revertAnomalyDecision({ anomalyId: anomaly.id, caseId });
      if (revertRes.error) { toast.error(revertRes.error); return; }
      const confirmRes = await confirmAnomaly({
        anomalyId: anomaly.id, caseId,
        resolutionNote: draftNote.trim() || null,
      });
      if (confirmRes.error) { toast.error(confirmRes.error); return; }
      toast.success('Nota aggiornata');
      setEditing(false);
      onChanged?.();
    });
  }, [anomaly.id, caseId, draftNote, onChanged]);

  const handleRevert = useCallback(() => {
    startRevert(async () => {
      const result = await revertAnomalyDecision({ anomalyId: anomaly.id, caseId });
      if (result.error) { toast.error(result.error); return; }
      toast.success('Anomalia riportata in revisione');
      onChanged?.();
    });
  }, [anomaly.id, caseId, onChanged]);

  return (
    <div className="rounded-md border border-emerald-200 dark:border-emerald-900/50 bg-emerald-50/40 dark:bg-emerald-950/10 p-3">
      <div className="flex items-center gap-2 flex-wrap mb-2">
        <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
        <span className="text-sm font-semibold">{typeLabel}</span>
        <Badge variant="outline" className="text-xs border-emerald-500 text-emerald-700 dark:text-emerald-400 bg-white dark:bg-emerald-950/30">
          Sarà inclusa nel report
        </Badge>
      </div>

      {!editing ? (
        <>
          <p className="text-xs text-muted-foreground">
            <span className="font-medium text-foreground">Tua nota:</span>{' '}
            {anomaly.resolution_note
              ? <>&ldquo;{anomaly.resolution_note}&rdquo;</>
              : <span className="italic">nessuna nota aggiunta</span>}
          </p>
          <div className="mt-2.5 flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              onClick={() => { setDraftNote(anomaly.resolution_note ?? ''); setEditing(true); }}
              disabled={isReverting}
            >
              <Pencil className="mr-1 h-3 w-3" />
              Modifica nota
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs text-muted-foreground"
              onClick={handleRevert}
              disabled={isReverting}
            >
              {isReverting ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Undo2 className="mr-1 h-3 w-3" />}
              Annulla conferma
            </Button>
          </div>
        </>
      ) : (
        <div className="space-y-2">
          <textarea
            className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm min-h-[60px] resize-y"
            placeholder='Es: "Il trattamento risulta documentato in relazione successiva..."'
            value={draftNote}
            onChange={(e) => setDraftNote(e.target.value)}
          />
          <div className="flex items-center gap-2">
            <Button size="sm" className="h-7 text-xs" onClick={handleSaveNote} disabled={isSaving}>
              {isSaving ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <CheckCircle2 className="mr-1 h-3 w-3" />}
              Salva
            </Button>
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setEditing(false)} disabled={isSaving}>
              Annulla
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// --- Layout: dismissed by perito (user_dismissed) ---

function DismissedAnomalyCard({
  anomaly,
  typeLabel,
  caseId,
  onChanged,
}: {
  anomaly: AnomalyRow;
  typeLabel: string;
  caseId: string;
  onChanged?: () => void;
}) {
  const [isReverting, startRevert] = useTransition();

  const handleRevert = useCallback(() => {
    startRevert(async () => {
      const result = await revertAnomalyDecision({ anomalyId: anomaly.id, caseId });
      if (result.error) { toast.error(result.error); return; }
      toast.success('Anomalia riportata in revisione');
      onChanged?.();
    });
  }, [anomaly.id, caseId, onChanged]);

  return (
    <div className="rounded-md border border-muted-foreground/20 bg-muted/30 p-3 opacity-75">
      <div className="flex items-center gap-2 flex-wrap mb-1">
        <XCircle className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-semibold">{typeLabel}</span>
        <Badge variant="outline" className="text-xs border-gray-400 text-gray-600 dark:text-gray-400">
          Esclusa dal report
        </Badge>
      </div>
      <Button
        variant="ghost"
        size="sm"
        className="h-7 text-xs text-muted-foreground"
        onClick={handleRevert}
        disabled={isReverting}
      >
        {isReverting ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Undo2 className="mr-1 h-3 w-3" />}
        Annulla esclusione
      </Button>
    </div>
  );
}

// --- Layout: auto-resolved by AI (llm_resolved) ---

function ResolvedAnomalyCard({
  anomaly,
  typeLabel,
}: {
  anomaly: AnomalyRow;
  typeLabel: string;
}) {
  return (
    <div className="rounded-md border border-green-200 dark:border-green-900/50 bg-green-50/40 dark:bg-green-950/10 p-3 opacity-80">
      <div className="flex items-center gap-2 flex-wrap mb-1">
        <ShieldCheck className="h-4 w-4 text-green-600 dark:text-green-400" />
        <span className="text-sm font-semibold">{typeLabel}</span>
        <Badge variant="outline" className="text-xs border-green-500 text-green-700 dark:text-green-400 bg-white dark:bg-green-950/30">
          Risolta automaticamente
        </Badge>
      </div>
      <p className="text-xs text-muted-foreground">{anomaly.description}</p>
    </div>
  );
}

// --- Anomalies Component ---

export function AnomaliesSection({ anomalies, events, documents, caseId, onChanged }: AnomaliesSectionProps) {
  const [showAutoResolved, setShowAutoResolved] = useState(false);

  // Anomalies that need user action (detected + llm_confirmed)
  const actionable = useMemo(
    () => anomalies.filter((a) => a.status === 'detected' || a.status === 'llm_confirmed'),
    [anomalies],
  );

  // Anomalies already acted on by user (confirmed or dismissed)
  const userActioned = useMemo(
    () => anomalies.filter((a) => a.status === 'user_confirmed' || a.status === 'user_dismissed'),
    [anomalies],
  );

  // Auto-resolved by AI (no user action needed)
  const autoResolved = useMemo(
    () => anomalies.filter((a) => a.status === 'llm_resolved'),
    [anomalies],
  );

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-yellow-500" />
            Anomalie Rilevate
            {actionable.length > 0 && (
              <Badge variant="warning" className="text-xs ml-1">
                {actionable.length} da revisionare
              </Badge>
            )}
          </CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        {anomalies.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Nessuna anomalia rilevata.</p>
        ) : (
          <div className="space-y-3">
            {/* Actionable anomalies first */}
            {actionable.map((a) => (
              <AnomalyCard
                key={a.id}
                anomaly={a}
                events={events}
                documents={documents}
                caseId={caseId}
                onChanged={onChanged}
              />
            ))}

            {/* User-actioned anomalies */}
            {userActioned.map((a) => (
              <AnomalyCard
                key={a.id}
                anomaly={a}
                events={events}
                documents={documents}
                caseId={caseId}
                onChanged={onChanged}
              />
            ))}

            {/* Auto-resolved section (collapsed by default) */}
            {autoResolved.length > 0 && (
              <div className="pt-2 border-t">
                <button
                  type="button"
                  className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground w-full"
                  onClick={() => setShowAutoResolved(!showAutoResolved)}
                >
                  {showAutoResolved ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                  {showAutoResolved ? (
                    <><EyeOff className="mr-0.5 h-3 w-3" />Nascondi risolte ({autoResolved.length})</>
                  ) : (
                    <><Eye className="mr-0.5 h-3 w-3" />Mostra risolte ({autoResolved.length})</>
                  )}
                </button>
                {showAutoResolved && (
                  <div className="mt-2 space-y-3">
                    {autoResolved.map((a) => (
                      <AnomalyCard
                        key={a.id}
                        anomaly={a}
                        events={events}
                        documents={documents}
                        caseId={caseId}
                        onChanged={onChanged}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}

            {actionable.length === 0 && userActioned.length === 0 && autoResolved.length > 0 && !showAutoResolved && (
              <p className="text-center text-sm text-muted-foreground py-4">
                Tutte le anomalie sono state risolte.
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// --- Missing Doc Upload Button ---

function MissingDocUploadButton({
  docName,
  caseId,
  onUploadComplete,
}: {
  docName: string;
  caseId: string;
  onUploadComplete?: () => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);

  const handleFileSelected = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.error('Non autenticato');
        return;
      }

      // Pre-upload dedup check via SHA-256 (Wave D.2).
      const contentHash = await computeFileSha256(file);
      if (contentHash) {
        const dupCheck = await checkDuplicateDocument({ caseId, contentHash });
        if (dupCheck?.duplicate) {
          toast.error(`Già caricato come "${dupCheck.existingFileName}". Non duplicato.`);
          return;
        }
      }

      const ext = file.name.split('.').pop() ?? 'bin';
      const storagePath = `${user.id}/${caseId}/${crypto.randomUUID()}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from('documents')
        .upload(storagePath, file, {
          contentType: file.type,
          upsert: false,
        });

      if (uploadError) {
        toast.error(`Errore upload: ${uploadError.message}`);
        return;
      }

      const result = await saveDocumentMetadata({
        caseId,
        fileName: file.name,
        fileType: file.type,
        fileSize: file.size,
        storagePath,
        documentType: 'altro',
        contentHash: contentHash ?? undefined,
      });

      if (result?.error) {
        toast.error(result.error);
        return;
      }

      await updateCaseDocumentCount(caseId);
      toast.success(`"${file.name}" caricato come "${docName}"`);
      onUploadComplete?.();
    } catch {
      toast.error('Errore di rete durante il caricamento');
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  }, [caseId, docName, onUploadComplete]);

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="h-7 px-2 text-xs mt-2"
        onClick={() => fileInputRef.current?.click()}
        disabled={isUploading}
      >
        {isUploading ? (
          <Loader2 className="mr-1 h-3 w-3 animate-spin" />
        ) : (
          <Upload className="mr-1 h-3 w-3" />
        )}
        {isUploading ? 'Caricamento...' : 'Carica documento'}
      </Button>
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,.jpg,.jpeg,.png,.tiff,.tif,.doc,.docx,.xls,.xlsx"
        className="hidden"
        onChange={handleFileSelected}
        aria-label={`Carica documento per ${docName}`}
      />
    </>
  );
}

// --- Missing Docs Component ---

export function MissingDocsSection({ missingDocs, caseId, onUploadComplete }: MissingDocsSectionProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileWarning className="h-5 w-5 text-destructive" />
          Documentazione Mancante
        </CardTitle>
        {missingDocs.length > 0 && (() => {
          const checklistItems = missingDocs.filter((d) => (d.document_name as string).startsWith('[CHECKLIST]'));
          const totalChecklist = missingDocs.filter((d) => (d.document_name as string).startsWith('[CHECKLIST]')).length;
          const standardItems = missingDocs.length - totalChecklist;
          return (
            <CardDescription>
              {standardItems > 0 && <span>{standardItems} documenti mancanti</span>}
              {standardItems > 0 && checklistItems.length > 0 && <span> · </span>}
              {checklistItems.length > 0 && <span>{checklistItems.length} item checklist</span>}
            </CardDescription>
          );
        })()}
      </CardHeader>
      <CardContent>
        {missingDocs.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Nessuna documentazione mancante.</p>
        ) : (
          <div className="space-y-3">
            {missingDocs.map((d) => {
              const isChecklist = (d.document_name as string).startsWith('[CHECKLIST]');
              const displayName = isChecklist
                ? (d.document_name as string).replace('[CHECKLIST] ', '')
                : d.document_name;
              return (
                <div key={d.id} className={`rounded-md border p-3 ${isChecklist ? 'border-dashed border-yellow-500/50 bg-yellow-50/50 dark:bg-yellow-950/20' : ''}`}>
                  <div className="flex items-center gap-2">
                    {isChecklist && <Badge variant="outline" className="text-xs">Checklist</Badge>}
                    <p className="text-sm font-medium">{displayName}</p>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">{d.reason}</p>
                  {d.related_event && (
                    <p className="mt-1 text-xs text-muted-foreground">Evento correlato: {d.related_event}</p>
                  )}
                  {caseId && (
                    <MissingDocUploadButton
                      docName={displayName}
                      caseId={caseId}
                      onUploadComplete={onUploadComplete}
                    />
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
