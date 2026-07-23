'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  Play, Loader2, XCircle, RotateCcw, AlertTriangle, Sparkles,
  FileSearch, BrainCircuit, ShieldCheck, ShieldOff, FileText, CheckCircle2, Clock,
} from 'lucide-react';
import { toast } from 'sonner';
import { notifyCreditsChanged } from '@/lib/credits-events';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { ProcessingProgress, computeWeightedProgress } from '@/components/processing-progress';
// Classification review removed — now handled by Document Organizer (Pro) or skipped
import { csrfHeaders } from '@/lib/csrf-client';
import { toUserMessage } from '@/lib/user-error-messages';
import { getElaborationCost, getElaborationLabel } from '@/services/credits/credit-costs';
import { getReportSectionOptions, updateReportSectionExclusions, updateReportSectionOrder } from '../../actions';
import { estimateAnalysisTime } from '@/lib/analysis-time-estimate';
import { stallNotice } from '@/lib/processing-stall';
import { ReportSectionsPicker, type ReportSectionOption } from './report-sections-picker';
import type { Document } from './types';

// --- Types ---

interface ProcessingSectionProps {
  caseId: string;
  documents: Document[];
  hasProcessingDocs: boolean;
  hasUploadedDocs: boolean;
  processingStage?: string;
  lastError?: string;
  pipelineMode?: string;
  initialExcludedSections?: string[];
  /** Timestamp REALE di avvio elaborazione (perizia_metadata.processingStartedAt).
   * Passato a ProcessingProgress per far partire il timer dall'invio a Inngest,
   * non dall'ora di upload dei documenti. */
  processingStartedAt?: string;
  /** Notifica il parent che l'avvio è riuscito → attiva il polling di kickoff
   * (stesso pattern di onClassificationStarted). Senza, la transizione alla vista
   * di progresso dipendeva da un singolo router.refresh(): se tornava stantio, il
   * bottone restava congelato su "Avvio in corso…" mentre la pipeline correva. */
  onProcessingStarted?: () => void;
  /** True se esistono già eventi/report per questo caso: riavviare li CANCELLA,
   * quindi va chiesta conferma anche in stato 'errore' (audit 2026-07-16). */
  hasExistingResults?: boolean;
  /** Eventi estratti finora (dal polling della pagina): segno di vita durante
   * l'estrazione, la fase più lunga, in cui % e contatore documenti restano
   * fermi per decine di minuti sui fascicoli grandi (caso 226, 117 pagine). */
  extractedEventsCount?: number;
  /** Porta al passo dei risultati (Report/Cronistoria/Spese). Senza, il passo
   * Elaborazione a caso finito era un vicolo cieco: "Tutti i documenti sono
   * già stati elaborati." e basta (collaudo live 2026-07-17). */
  onGoToResults?: () => void;
}

// --- Pipeline steps preview ---

const PIPELINE_STEPS = [
  { icon: FileSearch, label: 'Lettura documenti', desc: 'Acquisizione testo dai documenti caricati' },
  { icon: BrainCircuit, label: 'Analisi clinica', desc: 'Estrazione eventi e dati clinici' },
  { icon: ShieldCheck, label: 'Verifica completezza', desc: 'Controllo anomalie e coerenza documentale' },
  { icon: FileText, label: 'Generazione report', desc: 'Report medico-legale strutturato' },
];

// --- Component ---

export function ProcessingSection({
  caseId,
  documents,
  hasProcessingDocs,
  hasUploadedDocs,
  processingStage,
  lastError,
  pipelineMode = 'full',
  initialExcludedSections = [],
  processingStartedAt,
  onProcessingStarted,
  hasExistingResults = false,
  extractedEventsCount = 0,
  onGoToResults,
}: ProcessingSectionProps) {
  const creditCost = getElaborationCost(pipelineMode);
  const creditLabel = getElaborationLabel(pipelineMode);
  const router = useRouter();
  const [isStartingProcessing, setIsStartingProcessing] = useState(false);
  const [processingError, setProcessingError] = useState<string | null>(null);
  // Crediti insufficienti (402): mostrato come banner dedicato con saldo e CTA
  // acquisto, non come errore generico senza via d'uscita.
  const [insufficientCredits, setInsufficientCredits] = useState<{ needed: number; available: number } | null>(null);
  const [isCancelling, setIsCancelling] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  // 2.4-A2: sblocco manuale per i casi bloccati dal validatore di qualità
  const [isUnlocking, setIsUnlocking] = useState(false);
  const [showUnlockDialog, setShowUnlockDialog] = useState(false);
  // Re-running a COMPLETED case wipes events (incl. perito review), anomaly
  // decisions and ALL report versions server-side — never on a single click.
  const [showReprocessDialog, setShowReprocessDialog] = useState(false);
  const processingStartRef = useRef<number | null>(null);
  // Consapevolezza delle PAUSE di estrazione (CASO-2026-235: silenzi da
  // rate-limit di 15-20 min → sembrava bloccato → annullato a 2/3): traccia
  // l'ultimo cambio del contatore eventi e un tick da 30s tiene aggiornato il
  // "minuti fa" anche senza nuovi poll.
  const lastEventChangeRef = useRef<{ count: number; at: number }>({ count: extractedEventsCount, at: Date.now() });
  const [, setStallTick] = useState(0);
  useEffect(() => {
    if (extractedEventsCount !== lastEventChangeRef.current.count) {
      lastEventChangeRef.current = { count: extractedEventsCount, at: Date.now() };
    }
  }, [extractedEventsCount]);
  useEffect(() => {
    if (!hasProcessingDocs) return;
    const id = setInterval(() => setStallTick((t) => t + 1), 30_000);
    return () => clearInterval(id);
  }, [hasProcessingDocs]);
  const stallMinutes = Math.floor((Date.now() - lastEventChangeRef.current.at) / 60_000);
  const stall = stallNotice(stallMinutes);

  // Il caso è morto su un blocco del VALIDATORE (non un errore tecnico): il
  // messaggio salvato da assemble-and-save-report inizia con "Report non valido".
  // Solo in questo caso offriamo lo sblocco "ignora i controlli di qualità".
  const isValidationBlock = (lastError ?? '').includes('Report non valido');

  // Selettore "Sezioni del report" — solo per le analisi che producono un report
  // completo (non cronistoria/spese/anonimizzazione). Reso visibile QUI, sopra il
  // pulsante di avvio, perche' lo step "Info Perizia" e' facoltativo e veniva saltato.
  const showSectionPicker = pipelineMode === 'full';
  const [sectionOptions, setSectionOptions] = useState<ReportSectionOption[]>([]);
  const [excludedSections, setExcludedSections] = useState<string[]>(initialExcludedSections);
  const sectionsHydratedRef = useRef(false);

  useEffect(() => {
    if (!showSectionPicker) return;
    let active = true;
    void getReportSectionOptions(caseId).then((res) => {
      if (active && res.sections) setSectionOptions(res.sections);
    });
    return () => {
      active = false;
    };
  }, [caseId, showSectionPicker]);

  // Persiste la scelta (merge server-side) a ogni modifica, dopo l'idratazione iniziale.
  useEffect(() => {
    if (!showSectionPicker) return;
    if (!sectionsHydratedRef.current) {
      sectionsHydratedRef.current = true;
      return;
    }
    let active = true;
    void updateReportSectionExclusions(caseId, excludedSections).then((res) => {
      if (active && !res.success) toast.error(res.error ?? 'Errore nel salvataggio delle sezioni');
    });
    return () => {
      active = false;
    };
  }, [excludedSections, caseId, showSectionPicker]);

  const enabledSectionCount = sectionOptions.filter(
    (o) => o.mandatory || !excludedSections.includes(o.id),
  ).length;

  const handleToggleSection = useCallback((sectionId: string, include: boolean) => {
    setExcludedSections((prev) =>
      include ? prev.filter((x) => x !== sectionId) : [...prev, sectionId],
    );
  }, []);

  // Ordine capitoli (feedback beta 2026-07-20): il picker riordina localmente e
  // persiste subito; l'ordine si applica alla prossima (ri)generazione.
  const handleReorderSections = useCallback((orderedIds: string[]) => {
    setSectionOptions((prev) => {
      const byId = new Map(prev.map((o) => [o.id, o]));
      const next = orderedIds
        .map((id) => byId.get(id))
        .filter((o): o is ReportSectionOption => o !== undefined);
      return next.length === prev.length ? next : prev;
    });
    void updateReportSectionOrder(caseId, orderedIds).then((res) => {
      if (!res.success) toast.error(res.error ?? 'Errore nel salvataggio dell\'ordine delle sezioni');
    });
  }, [caseId]);

  // Count failed documents (excluding warning-only)
  const failedDocs = documents.filter((d) => {
    if (d.processing_status !== 'errore') return false;
    const err = (d.processing_error ?? '').toLowerCase();
    return !err.includes('nessun evento');
  });

  const uploadedCount = documents.filter((d) => d.processing_status === 'caricato').length;

  // Documenti senza categoria ("altro") al momento dell'avvio → estrazione con
  // istruzioni generiche E (QA 2026-06-11) TUTTO finisce riprodotto nella
  // sezione Documentazione Sanitaria, atti legali e tabelle inclusi. Soglia
  // abbassata da "tutti" a >50%: nel test reale l'avviso non scattò abbastanza.
  // Avviso NON bloccante: la categorizzazione resta facoltativa.
  const uncategorizedCount = documents.filter((d) => (d.document_type ?? 'altro') === 'altro').length;
  const allDocsUncategorized =
    (pipelineMode === 'full' || pipelineMode === 'extraction_only') &&
    documents.length > 0 &&
    uncategorizedCount > documents.length / 2;

  // Track processing start time
  useEffect(() => {
    if (hasProcessingDocs) {
      if (!processingStartRef.current) {
        processingStartRef.current = Date.now();
      }
    } else {
      processingStartRef.current = null;
    }
  }, [hasProcessingDocs]);

  const handleStartProcessing = useCallback(async () => {
    setIsStartingProcessing(true);
    setProcessingError(null);
    setInsufficientCredits(null);
    try {
      const response = await fetch('/api/processing/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...csrfHeaders() },
        body: JSON.stringify({ caseId }),
      });
      const result = await response.json() as {
        success: boolean; error?: string; creditsNeeded?: number; creditsAvailable?: number;
      };
      if (!result.success) {
        // 402 con saldo: banner dedicato con CTA acquisto (prima: testo nudo senza uscita).
        if (typeof result.creditsNeeded === 'number' && typeof result.creditsAvailable === 'number') {
          setInsufficientCredits({ needed: result.creditsNeeded, available: result.creditsAvailable });
        } else {
          setProcessingError(result.error ?? 'Errore sconosciuto');
        }
        setIsStartingProcessing(false);
        return;
      }
      // Avvio riuscito: attiva il polling di kickoff nel parent PRIMA del refresh —
      // la transizione alla vista di progresso non dipende più da un singolo
      // refresh (bug "Avvio in corso…" congelato, smoke test 2026-07-14).
      onProcessingStarted?.();
      notifyCreditsChanged();
      router.refresh();
    } catch {
      setProcessingError('Errore di rete. Verifica la connessione.');
      setIsStartingProcessing(false);
    }
  }, [caseId, router, onProcessingStarted]);

  useEffect(() => {
    if (isStartingProcessing && hasProcessingDocs) {
      setIsStartingProcessing(false);
    }
  }, [isStartingProcessing, hasProcessingDocs]);

  const handleCancel = useCallback(async () => {
    setIsCancelling(true);
    setShowCancelDialog(false);
    try {
      const response = await fetch('/api/processing/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...csrfHeaders() },
        body: JSON.stringify({ caseId }),
      });
      const result = await response.json() as { success: boolean; error?: string; data?: { creditsRefunded?: number } };
      if (!result.success) {
        toast.error(result.error ?? 'Errore durante l\'annullamento');
      } else {
        const refunded = result.data?.creditsRefunded ?? 0;
        toast.success(refunded > 0
          ? `Elaborazione annullata — ${refunded} crediti rimborsati`
          : 'Elaborazione annullata');
        if (refunded > 0) notifyCreditsChanged();
      }
      router.refresh();
    } catch {
      toast.error('Errore di rete. Verifica la connessione.');
    } finally {
      setIsCancelling(false);
    }
  }, [caseId, router]);

  // 2.4-A2: rigenera il report ignorando i blocchi di QUALITÀ del validatore
  // (i controlli di sicurezza/GDPR restano sempre bloccanti lato server).
  const handleRegenerateIgnoringValidation = useCallback(async () => {
    setIsUnlocking(true);
    setShowUnlockDialog(false);
    try {
      const response = await fetch('/api/processing/regenerate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...csrfHeaders() },
        body: JSON.stringify({ caseId, ignoreValidation: true }),
      });
      const result = await response.json() as { success: boolean; error?: string };
      if (!result.success) {
        toast.error(result.error ?? 'Errore avvio rigenerazione');
      } else {
        toast.success('Rigenerazione avviata: i controlli di qualità verranno ignorati. Verifica il report con attenzione.');
      }
      router.refresh();
    } catch {
      toast.error('Errore di rete. Verifica la connessione.');
    } finally {
      setIsUnlocking(false);
    }
  }, [caseId, router]);

  const handleRetryFailed = useCallback(async () => {
    setIsRetrying(true);
    try {
      const response = await fetch('/api/processing/retry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...csrfHeaders() },
        body: JSON.stringify({ caseId }),
      });
      const result = await response.json() as { success: boolean; error?: string; data?: { retriedCount: number } };
      if (!result.success) {
        toast.error(result.error ?? 'Errore durante il retry');
      } else {
        toast.success(`${result.data?.retriedCount ?? 0} documenti rimessi in coda`);
      }
      router.refresh();
    } catch {
      toast.error('Errore di rete. Verifica la connessione.');
    } finally {
      setIsRetrying(false);
    }
  }, [caseId, router]);

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="pt-6">
          {hasProcessingDocs ? (
            <div className="space-y-4">
              {/* Big progress indicator */}
              {(() => {
                const processingDocs = documents.filter((d) => !['caricato'].includes(d.processing_status));
                const completedCount = processingDocs.filter((d) => d.processing_status === 'completato' || d.processing_status === 'errore').length;
                const totalCount = processingDocs.length;
                // Weighted by pipeline step: moves smoothly from the first
                // minutes instead of sitting at 0/47 and then jumping.
                const pct = computeWeightedProgress(processingDocs.map((d) => d.processing_status));
                return (
                  <div className="space-y-3">
                    <p className="text-base font-semibold text-center">
                      Elaborazione in corso — {pct}% ({completedCount}/{totalCount} documenti completati)
                    </p>
                    <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full rounded-full bg-primary transition-all duration-500"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    {/* Segno di vita durante l'estrazione: % e contatore documenti
                        restano fermi per decine di minuti sui fascicoli grandi,
                        ma gli eventi salvati crescono a ogni blocco analizzato. */}
                    {extractedEventsCount > 0 && (
                      <p className="text-center text-sm text-muted-foreground">
                        <span className="font-medium tabular-nums">{extractedEventsCount}</span>{' '}
                        eventi clinici individuati finora — il numero cresce man mano che l&apos;analisi procede
                        {stallMinutes >= 2 && stall.tone === 'none' && (
                          <span className="text-xs"> (ultimo avanzamento: {stallMinutes} min fa)</span>
                        )}
                      </p>
                    )}
                    {extractedEventsCount > 0 && stall.tone !== 'none' && (
                      <div className={`mx-auto max-w-xl rounded-lg border p-3 text-sm ${
                        stall.tone === 'warn'
                          ? 'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200'
                          : 'border-border bg-muted/40 text-muted-foreground'
                      }`}>
                        {stall.text}
                      </div>
                    )}
                  </div>
                );
              })()}

              <ProcessingProgress
                documents={documents.filter((d) => !['caricato'].includes(d.processing_status))}
                processingStartedAt={processingStartedAt}
              />

              {/* Rassicurazione unica (prima erano tre messaggi sovrapposti che
                  dicevano la stessa cosa): auto-refresh + puoi chiudere + email. */}
              <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50/80 dark:border-green-800 dark:bg-green-950/30 p-3">
                <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400 shrink-0" />
                <p className="text-sm text-green-700 dark:text-green-400">
                  L&apos;analisi prosegue sul server anche se chiudi questa pagina: si aggiorna da sola
                  e riceverai un&apos;email al completamento.
                </p>
              </div>

              {/* Cancel link — at bottom, text-only, requires confirmation */}
              <div className="pt-2 border-t text-center">
                <button
                  type="button"
                  className="text-xs text-muted-foreground hover:text-destructive underline transition-colors"
                  onClick={() => setShowCancelDialog(true)}
                  disabled={isCancelling}
                >
                  {isCancelling ? 'Annullamento in corso...' : 'Annulla elaborazione'}
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {hasUploadedDocs ? (
                <>

                  {failedDocs.length > 0 && (
                    <div className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm">
                      <AlertTriangle className="h-4 w-4 shrink-0 text-destructive" />
                      <span className="text-destructive">{failedDocs.length} documenti non elaborati</span>
                      <Button
                        variant="outline"
                        size="sm"
                        className="ml-auto shrink-0"
                        onClick={handleRetryFailed}
                        disabled={isRetrying}
                      >
                        {isRetrying ? (
                          <><Loader2 className="mr-1 h-3 w-3 animate-spin" />Riprovo...</>
                        ) : (
                          <>
                            <RotateCcw className="mr-1 h-3 w-3" />Riprova documenti falliti
                            {/* Il retry rilancia l'analisi completa: dichiara il costo. */}
                            <Badge variant="secondary" className="ml-1.5 text-xs px-1.5 py-0">{creditCost} crediti</Badge>
                          </>
                        )}
                      </Button>
                    </div>
                  )}

                  {/* Pipeline preview — visual stepper */}
                  <div className="space-y-3">
                    <p className="text-sm font-medium text-center">
                      Cosa farà l&apos;analisi AI
                    </p>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      {PIPELINE_STEPS.map((step, i) => (
                        <div key={step.label} className="flex flex-col items-center gap-2 rounded-lg border border-muted p-3 text-center">
                          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
                            <step.icon className="h-5 w-5 text-muted-foreground" />
                          </div>
                          <div>
                            <p className="text-xs font-medium">{i + 1}. {step.label}</p>
                            <p className="text-xs text-muted-foreground mt-0.5">{step.desc}</p>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Prominent time estimate + doc count. La stima scala col
                        numero di documenti (vedi estimateAnalysisTime): il vecchio
                        "5–15 minuti" fisso era irreale sui fascicoli grandi. */}
                    <div className="flex flex-col items-center gap-1.5">
                      <div className="flex items-center justify-center gap-4 flex-wrap">
                        <Badge variant="secondary" className="text-sm px-3 py-1">
                          {uploadedCount} {uploadedCount === 1 ? 'documento' : 'documenti'}
                        </Badge>
                        <Badge variant="outline" className="text-sm px-3 py-1">
                          <Clock className="mr-1.5 h-3.5 w-3.5" />
                          Tempo stimato: {estimateAnalysisTime(uploadedCount, documents.reduce((sum, d) => sum + (d.file_size ?? 0), 0))}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground text-center">
                        Stima indicativa: dipende dal numero e dalla dimensione dei documenti.
                        Puoi chiudere la pagina, l&apos;analisi prosegue sul server.
                      </p>
                    </div>
                  </div>

                  {/* Suggerimento documenti senza categoria — non bloccante, tono informativo */}
                  {allDocsUncategorized && (
                    <div className="flex items-start gap-2 rounded-md border bg-primary/5 p-3">
                      <Sparkles className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                      <p className="text-sm text-foreground">
                        <strong>Suggerimento:</strong> i documenti non hanno ancora una categoria. Puoi
                        avviare comunque — ma con le categorie assegnate l&apos;AI capisce meglio cosa sta
                        leggendo e il report viene più preciso e ordinato. Se vuoi, torna al passaggio
                        {' '}<strong>Documenti</strong> e premi &quot;Categorizza tutti con AI&quot;: ci pensa
                        lei in meno di un minuto.
                      </p>
                    </div>
                  )}

                  {/* Selettore sezioni del report — evidente, subito sopra il pulsante */}
                  {showSectionPicker && sectionOptions.length > 0 && (
                    <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 space-y-3">
                      <div>
                        <p className="text-sm font-semibold">Quali sezioni vuoi nel report, e in che ordine?</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Le obbligatorie ci sono sempre. Spegni quelle che non ti servono e usa le frecce per
                          ordinare i capitoli come preferisci (intestazione ed epicrisi restano agli estremi).
                        </p>
                      </div>
                      <ReportSectionsPicker
                        options={sectionOptions}
                        excluded={excludedSections}
                        onToggle={handleToggleSection}
                        onReorder={handleReorderSections}
                        disabled={isStartingProcessing}
                      />
                      <p className="text-xs font-medium text-muted-foreground">
                        {enabledSectionCount} {enabledSectionCount === 1 ? 'sezione verrà generata' : 'sezioni verranno generate'}.
                      </p>
                    </div>
                  )}

                  {/* Errori d'avvio VICINO al bottone (prima erano in cima, lontani dal click) */}
                  {insufficientCredits && (
                    <div className="rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/30 p-4 space-y-2">
                      <p className="text-sm text-amber-900 dark:text-amber-200">
                        <span className="font-medium">Ti servono più crediti per questa analisi:</span>{' '}
                        ne richiede {insufficientCredits.needed}, ne hai {insufficientCredits.available}.
                      </p>
                      <Button variant="outline" size="sm" asChild>
                        <a href="/settings">Vai ai crediti</a>
                      </Button>
                    </div>
                  )}
                  {processingError && (
                    <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm">
                      <AlertTriangle className="h-4 w-4 shrink-0 text-destructive" />
                      <span className="text-destructive">{processingError}</span>
                    </div>
                  )}

                  {/* Sticky action bar */}
                  <div className="sticky bottom-0 z-20 bg-background/95 backdrop-blur-sm border-t px-4 py-3 mt-6 -mx-4">
                    <Button
                      size="lg"
                      variant="approve"
                      className="w-full text-base py-6"
                      onClick={() => {
                        // Conferma se riavviare CANCELLEREBBE lavoro esistente
                        // (caso completato, o in 'errore' ma con eventi/report già
                        // prodotti — es. è fallita solo la stesura del report).
                        if (processingStage === 'completato' || hasExistingResults) {
                          setShowReprocessDialog(true);
                        } else {
                          handleStartProcessing();
                        }
                      }}
                      disabled={isStartingProcessing || !hasUploadedDocs}
                    >
                      {isStartingProcessing ? (
                        <><Loader2 className="mr-2 h-5 w-5 animate-spin" />Avvio in corso — tra pochi secondi vedrai l&apos;avanzamento…</>
                      ) : (
                        <>
                          <Play className="mr-2 h-5 w-5" />
                          Avvia Elaborazione
                          <Badge variant="secondary" className="ml-2 text-sm px-2 py-0.5 bg-white/20 text-white border-0">
                            {creditCost} crediti
                          </Badge>
                        </>
                      )}
                    </Button>
                    <p className="text-xs text-muted-foreground text-center mt-2">
                      {creditLabel} — {creditCost} crediti scalati all&apos;avvio. Poi puoi chiudere la pagina: l&apos;analisi prosegue da sola.
                    </p>
                  </div>
                </>
              ) : documents.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  Nessun documento caricato. Torna al passaggio 1 per caricare i documenti.
                </p>
              ) : failedDocs.length > 0 || processingStage === 'errore' ? (
                <div className="space-y-3">
                  {/* Pipeline-level error message */}
                  {processingStage === 'errore' && (
                    <div className="rounded-md border border-destructive/30 bg-destructive/5 p-4">
                      <div className="flex items-start gap-2">
                        <XCircle className="h-5 w-5 shrink-0 text-destructive mt-0.5" />
                        <div className="space-y-1">
                          <p className="text-sm font-medium text-destructive">Elaborazione non riuscita</p>
                          <p className="text-sm text-muted-foreground">
                            {lastError ? toUserMessage(lastError) : 'Si è verificato un errore durante l\'elaborazione. Riprova.'}
                          </p>
                          <p className="text-xs text-muted-foreground mt-2">
                            Se il problema persiste, prova a rimuovere eventuali documenti corrotti o protetti da password e riavvia l&apos;analisi.
                          </p>
                          {/* 2.4-A2: sblocco manuale — solo per blocchi del validatore qualità */}
                          {isValidationBlock && (
                            <div className="pt-2">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setShowUnlockDialog(true)}
                                disabled={isUnlocking}
                              >
                                {isUnlocking ? (
                                  <><Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />Avvio in corso...</>
                                ) : (
                                  <><ShieldOff className="mr-1 h-3.5 w-3.5" />Rigenera ignorando i controlli di qualità</>
                                )}
                              </Button>
                            </div>
                          )}
                          {/* Via d'uscita SEMPRE presente su errore: senza questo, un
                              caso in 'errore' senza documenti falliti né blocco
                              validatore restava un vicolo cieco (nessun modo di riavviare). */}
                          {!isValidationBlock && (
                            <div className="pt-2">
                              <Button
                                size="sm"
                                onClick={handleStartProcessing}
                                disabled={isStartingProcessing}
                              >
                                {isStartingProcessing ? (
                                  <><Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />Riavvio in corso...</>
                                ) : (
                                  <><RotateCcw className="mr-1 h-3.5 w-3.5" />Riavvia elaborazione</>
                                )}
                              </Button>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Failed documents detail */}
                  {failedDocs.length > 0 && (
                    <div className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm">
                      <AlertTriangle className="h-4 w-4 shrink-0 text-destructive" />
                      <span className="text-destructive">{failedDocs.length} {failedDocs.length === 1 ? 'documento non elaborato' : 'documenti non elaborati'}</span>
                      <Button
                        variant="outline"
                        size="sm"
                        className="ml-auto shrink-0"
                        onClick={handleRetryFailed}
                        disabled={isRetrying}
                      >
                        {isRetrying ? (
                          <><Loader2 className="mr-1 h-3 w-3 animate-spin" />Riprovo...</>
                        ) : (
                          <>
                            <RotateCcw className="mr-1 h-3 w-3" />Riprova
                            <Badge variant="secondary" className="ml-1.5 text-xs px-1.5 py-0">{creditCost} crediti</Badge>
                          </>
                        )}
                      </Button>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex flex-col items-center gap-3 py-4">
                  <p className="text-sm text-muted-foreground text-center">
                    Elaborazione completata: {pipelineMode === 'full' ? 'il report è pronto.' : 'i risultati sono pronti.'}
                  </p>
                  {onGoToResults && (
                    <Button variant="outline" size="sm" onClick={onGoToResults}>
                      {pipelineMode === 'full' ? 'Vai al Report' : 'Vai ai risultati'}
                    </Button>
                  )}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* 2.4-A2: conferma sblocco "ignora i controlli di qualità" */}
      <AlertDialog open={showReprocessDialog} onOpenChange={setShowReprocessDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Rielaborare il caso da capo?</AlertDialogTitle>
            <AlertDialogDescription>
              Il caso è già stato elaborato. Rielaborandolo da capo verranno eliminati:
              gli eventi estratti (incluse le tue verifiche e modifiche), le decisioni
              sulle anomalie e il report con tutte le sue versioni (incluse le modifiche
              manuali). L&apos;operazione non è reversibile e costa {creditCost} crediti.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setShowReprocessDialog(false);
                handleStartProcessing();
              }}
            >
              Rielabora da capo
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showUnlockDialog} onOpenChange={setShowUnlockDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Rigenerare ignorando i controlli di qualità?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm">
                <p>
                  Il report è stato bloccato dai controlli automatici di qualità (es. sezioni
                  ritenute incomplete o pochi eventi citati). Se ritieni che sia un falso allarme,
                  puoi rigenerare salvando comunque il report.
                </p>
                <p className="font-medium text-destructive">
                  Attenzione: il report potrebbe contenere difetti reali. Verificalo con
                  particolare attenzione prima del deposito.
                </p>
                <p>
                  I controlli di sicurezza sui dati (nomi copiati dagli esempi, dati fabbricati)
                  restano sempre attivi e bloccanti. L&apos;operazione viene registrata nel registro
                  attività e consuma i crediti di una rigenerazione report.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction onClick={handleRegenerateIgnoringValidation}>
              <ShieldOff className="mr-1 h-4 w-4" />
              Rigenera comunque
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Cancel confirmation dialog */}
      <AlertDialog open={showCancelDialog} onOpenChange={setShowCancelDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Annullare l&apos;elaborazione?</AlertDialogTitle>
            <AlertDialogDescription>
              L&apos;elaborazione è in corso. Se annulli, i risultati parziali andranno persi e dovrai riavviare l&apos;analisi.{' '}
              <span className="font-medium text-foreground">I crediti dell&apos;elaborazione ti verranno rimborsati.</span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Continua elaborazione</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleCancel}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              <XCircle className="mr-1 h-4 w-4" />
              Annulla elaborazione
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
