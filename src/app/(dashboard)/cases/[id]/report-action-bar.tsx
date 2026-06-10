'use client';

import { useCallback, useTransition, useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  Loader2, Download, Pencil, Printer, GitCompare, ShieldCheck,
  FileCode, Eye, MoreHorizontal, RefreshCw, ShieldAlert, CheckCircle2,
  FileText, BookOpen, FileSearch,
} from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { updateReportStatus, getCaseReportVersions, getLastExport } from '../../actions';
import { getCitationReliabilityDisplay } from '@/lib/hrs-display';
import { QualityGateDialog } from './quality-gate-dialog';
import type { ReportRow } from './types';

// --- Helpers ---

/**
 * 2.4-B: badge discreto "Affidabilità citazioni" (HRS reso visibile al perito).
 * Tooltip nativo (title) con la spiegazione in italiano — niente jargon tecnico.
 */
function CitationReliabilityBadge({ hrs }: { hrs: number }) {
  const display = getCitationReliabilityDisplay(hrs);
  return (
    <Badge
      variant="outline"
      className={`text-xs cursor-help ${display.colorClass}`}
      title={display.description}
      aria-label={display.description}
    >
      Affidabilità citazioni: {display.label}
    </Badge>
  );
}

function formatTimeAgo(isoDate: string): string {
  const diff = Date.now() - new Date(isoDate).getTime();
  if (Number.isNaN(diff) || diff < 0) return 'adesso';
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return 'adesso';
  if (minutes < 60) return `${minutes} min fa`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} ${hours === 1 ? 'ora' : 'ore'} fa`;
  const days = Math.floor(hours / 24);
  return `${days} ${days === 1 ? 'giorno' : 'giorni'} fa`;
}

// --- Types ---

interface ReportActionBarProps {
  caseId: string;
  report: ReportRow;
  anomalyCount: number;
  missingDocsCount: number;
  isRegenerating: boolean;
  onRegenerate: () => void;
  onEdit: () => void;
  onVersionsToggle: (versions: ReportRow[]) => void;
  alertCount?: number;
  onOpenQualitySheet?: () => void;
  // UX Ondata 3-IA: support panels open via drawer from the right.
  // Optional callbacks — when omitted the toolbar button is hidden.
  onOpenEventsDrawer?: () => void;
  onOpenPubmedDrawer?: () => void;
  onOpenOcrDrawer?: () => void;
  /** Counters shown in toolbar buttons (events count / pubmed refs count) */
  eventsCount?: number;
  pubmedCount?: number;
}

// --- Component ---

export function ReportActionBar({
  caseId,
  report,
  anomalyCount,
  missingDocsCount,
  isRegenerating,
  onRegenerate,
  onEdit,
  onVersionsToggle,
  alertCount = 0,
  onOpenQualitySheet,
  onOpenEventsDrawer,
  onOpenPubmedDrawer,
  onOpenOcrDrawer,
  eventsCount,
  pubmedCount,
}: ReportActionBarProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [qualityGateOpen, setQualityGateOpen] = useState(false);
  const [isLoadingVersions, setIsLoadingVersions] = useState(false);
  const [lastExportInfo, setLastExportInfo] = useState<{ format: string; exportedAt: string } | null>(null);
  // Treat legacy "in_revisione" as "bozza"
  const effectiveStatus = report.report_status === 'in_revisione' ? 'bozza' : report.report_status;

  // Fetch last export info
  useEffect(() => {
    getLastExport(caseId).then((info) => setLastExportInfo(info)).catch(() => {});
  }, [caseId]);

  const handleStatusChange = useCallback((newStatus: string) => {
    startTransition(async () => {
      await updateReportStatus({ caseId, reportId: report.id, newStatus });
      router.refresh();
    });
  }, [caseId, report.id, router]);

  const handlePdfExport = useCallback(() => {
    const printWindow = window.open(`/api/cases/${caseId}/export/html?inline=true`, '_blank');
    if (printWindow) {
      printWindow.addEventListener('load', () => {
        printWindow.print();
      });
    }
  }, [caseId]);

  const handleLoadVersions = useCallback(async () => {
    setIsLoadingVersions(true);
    try {
      const result = await getCaseReportVersions(caseId);
      onVersionsToggle(result);
    } catch {
      toast.error('Errore caricamento versioni');
    } finally {
      setIsLoadingVersions(false);
    }
  }, [caseId, onVersionsToggle]);

  return (
    <>
      <div className="sticky bottom-0 z-20 border-t bg-background/95 backdrop-blur-sm px-4 py-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          {/* Left: Status badge + last export */}
          <div className="flex items-center gap-2">
            {effectiveStatus === 'definitivo' ? (
              <Badge variant="success" className="text-xs">Pronto al deposito</Badge>
            ) : (
              <Badge variant="secondary" className="text-xs">Bozza</Badge>
            )}
            <span className="text-xs text-muted-foreground">v{report.version}</span>
            {/* 2.4-B: indice di affidabilità citazioni (HRS) — calcolato dalla
                pipeline e salvato in generation_metadata, prima invisibile. */}
            {typeof report.generation_metadata?.hrs === 'number' && (
              <CitationReliabilityBadge hrs={report.generation_metadata.hrs} />
            )}
            {lastExportInfo && (
              <span className="text-xs text-muted-foreground hidden sm:inline">
                · Ultimo export: {lastExportInfo.format.toUpperCase()},{' '}
                {formatTimeAgo(lastExportInfo.exportedAt)}
              </span>
            )}
          </div>

          {/* Right: Actions */}
          <div className="flex items-center gap-2">
            {/* UX Ondata 3-IA: Support panel buttons (drawer da destra) — eventi/pubmed/ocr */}
            {onOpenEventsDrawer && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onOpenEventsDrawer}
                title="Eventi clinici della cronistoria (apre pannello laterale)"
              >
                <FileText className="mr-1 h-3.5 w-3.5" />
                <span className="hidden sm:inline">Eventi</span>
                {typeof eventsCount === 'number' && eventsCount > 0 && (
                  <Badge variant="secondary" className="ml-1 text-[10px] px-1 py-0 leading-tight">
                    {eventsCount}
                  </Badge>
                )}
              </Button>
            )}
            {onOpenPubmedDrawer && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onOpenPubmedDrawer}
                title="Riferimenti scientifici PubMed (apre pannello laterale)"
              >
                <BookOpen className="mr-1 h-3.5 w-3.5" />
                <span className="hidden sm:inline">PubMed</span>
                {typeof pubmedCount === 'number' && pubmedCount > 0 && (
                  <Badge variant="secondary" className="ml-1 text-[10px] px-1 py-0 leading-tight">
                    {pubmedCount}
                  </Badge>
                )}
              </Button>
            )}
            {onOpenOcrDrawer && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onOpenOcrDrawer}
                title="Testo OCR originale dei documenti (apre pannello laterale)"
              >
                <FileSearch className="mr-1 h-3.5 w-3.5" />
                <span className="hidden sm:inline">OCR</span>
              </Button>
            )}

            {/* Separator before primary actions (only visible if any drawer button rendered) */}
            {(onOpenEventsDrawer || onOpenPubmedDrawer || onOpenOcrDrawer) && (
              <span className="hidden sm:inline-block w-px h-5 bg-border" aria-hidden />
            )}

            {/* Mobile: Quality button with badge */}
            {onOpenQualitySheet && (
              <Button
                variant="outline"
                size="sm"
                className="lg:hidden"
                onClick={onOpenQualitySheet}
              >
                <ShieldAlert className="mr-1 h-3.5 w-3.5" />
                Qualità
                {alertCount > 0 && (
                  <Badge variant="destructive" className="ml-1 text-[10px] px-1 py-0 leading-tight">
                    {alertCount}
                  </Badge>
                )}
              </Button>
            )}

            {/* Edit button */}
            <Button variant="outline" size="sm" onClick={onEdit}>
              <Pencil className="mr-1 h-3.5 w-3.5" />
              <span className="hidden sm:inline">Modifica</span>
            </Button>

            {/* Approve button — visible for drafts (primary action of this screen) */}
            {effectiveStatus === 'bozza' && (
              <Button
                variant="approve"
                size="sm"
                onClick={() => setQualityGateOpen(true)}
                disabled={isPending}
              >
                {isPending ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="mr-1 h-3.5 w-3.5" />}
                <span className="hidden sm:inline">Approva</span>
              </Button>
            )}

            {/* Export dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm">
                  <Download className="mr-1 h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Esporta</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuItem
                  onClick={() => window.open(`/api/cases/${caseId}/export/html?inline=true`, '_blank')}
                >
                  <Eye className="mr-2 h-3.5 w-3.5" />
                  <div>
                    <div>Visualizza nel browser</div>
                    <p className="text-xs text-muted-foreground font-normal">Apre anteprima in una nuova scheda</p>
                  </div>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <a href={`/api/cases/${caseId}/export/docx`} download>
                    <Download className="mr-2 h-3.5 w-3.5" />
                    <div>
                      <div>Esporta DOCX</div>
                      <p className="text-xs text-muted-foreground font-normal">Documento Word — per stampare o inviare</p>
                    </div>
                  </a>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <a href={`/api/cases/${caseId}/export/html`} download>
                    <Download className="mr-2 h-3.5 w-3.5" />
                    <div>
                      <div>Esporta HTML</div>
                      <p className="text-xs text-muted-foreground font-normal">Pagina web — per archiviare o condividere</p>
                    </div>
                  </a>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <a href={`/api/cases/${caseId}/export/pdf`} download>
                    <Download className="mr-2 h-3.5 w-3.5" />
                    <div>
                      <div>Esporta PDF</div>
                      <p className="text-xs text-muted-foreground font-normal">File PDF formato A4 — pronto per il deposito</p>
                    </div>
                  </a>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handlePdfExport}>
                  <Printer className="mr-2 h-3.5 w-3.5" />
                  <div>
                    <div>Stampa dal browser</div>
                    <p className="text-xs text-muted-foreground font-normal">Apre l&apos;anteprima di stampa</p>
                  </div>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <a href={`/api/cases/${caseId}/export/html?anonymize=true`} download>
                    <ShieldCheck className="mr-2 h-3.5 w-3.5" />
                    <div>
                      <div>Esporta senza dati personali</div>
                      <p className="text-xs text-muted-foreground font-normal">Versione anonimizzata per condivisione</p>
                    </div>
                  </a>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Overflow menu */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm">
                  <MoreHorizontal className="h-3.5 w-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                {/* Regenerate — with confirmation dialog */}
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <DropdownMenuItem
                      disabled={isRegenerating}
                      onSelect={(e) => e.preventDefault()}
                    >
                      {isRegenerating ? (
                        <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <RefreshCw className="mr-2 h-3.5 w-3.5" />
                      )}
                      {isRegenerating ? 'Riscrittura in corso…' : 'Riscrivi tutto il report'}
                    </DropdownMenuItem>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Riscrivi tutto il report</AlertDialogTitle>
                      <AlertDialogDescription>
                        Sei sicuro? Il report verr&agrave; rigenerato da capo. <strong>Le modifiche manuali andranno perse.</strong>
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Annulla</AlertDialogCancel>
                      <AlertDialogAction onClick={onRegenerate}>
                        Riscrivi tutto
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>

                {/* Versions */}
                {report.version > 1 && (
                  <DropdownMenuItem onClick={handleLoadVersions} disabled={isLoadingVersions}>
                    {isLoadingVersions ? (
                      <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <GitCompare className="mr-2 h-3.5 w-3.5" />
                    )}
                    Confronta con versione precedente
                  </DropdownMenuItem>
                )}

                <DropdownMenuSeparator />

                {/* Export extras */}
                <DropdownMenuItem asChild>
                  <a href={`/api/cases/${caseId}/export/csv`} download>
                    <Download className="mr-2 h-3.5 w-3.5" />
                    <div>
                      <div>Esporta CSV</div>
                      <p className="text-xs text-muted-foreground font-normal">Tabella dati — per Excel</p>
                    </div>
                  </a>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <a href={`/api/cases/${caseId}/export/pct`} download>
                    <FileCode className="mr-2 h-3.5 w-3.5" />
                    <div>
                      <div>Esporta PCT</div>
                      <p className="text-xs text-muted-foreground font-normal">Formato tribunale</p>
                    </div>
                  </a>
                </DropdownMenuItem>

                {effectiveStatus === 'definitivo' && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => handleStatusChange('bozza')} disabled={isPending}>
                      {isPending ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : null}
                      Torna a modifica
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>

      {/* Dialogs */}
      <QualityGateDialog
        open={qualityGateOpen}
        onOpenChange={setQualityGateOpen}
        anomalyCount={anomalyCount}
        missingDocsCount={missingDocsCount}
        onConfirm={() => handleStatusChange('definitivo')}
      />

    </>
  );
}
