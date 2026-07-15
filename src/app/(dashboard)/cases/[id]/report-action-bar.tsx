'use client';

import { useCallback, useTransition, useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
  Loader2, Download, Pencil, GitCompare, ShieldCheck,
  Eye, MoreHorizontal, RefreshCw, ShieldAlert, CheckCircle2,
  FileText, FileSearch,
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
import { updateReportStatus, getCaseReportVersions, getLastExport, attestAndApproveReport } from '../../actions';
import { QualityGateDialog } from './quality-gate-dialog';
import { getRequiredAttestationSections } from '@/lib/attestation-shared';
import type { ReportRow } from './types';

// --- Helpers ---

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
  onOpenOcrDrawer?: () => void;
  /** Counter shown in toolbar buttons (events count) */
  eventsCount?: number;
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
  onOpenOcrDrawer,
  eventsCount,
}: ReportActionBarProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [qualityGateOpen, setQualityGateOpen] = useState(false);
  const [isLoadingVersions, setIsLoadingVersions] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
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

  // Attestazione "verify before sign": approvazione = attestazione con hash
  // del contenuto. Le sezioni ad alto rischio presenti nel report richiedono
  // spunta esplicita nel dialog. useMemo: parseSections su ~100KB non deve
  // rigirare a ogni re-render della barra.
  const requiredSections = useMemo(
    () => getRequiredAttestationSections(report.synthesis),
    [report.synthesis],
  );
  const handleAttestAndApprove = useCallback((confirmedSectionIds: string[]) => {
    startTransition(async () => {
      const result = await attestAndApproveReport({ caseId, reportId: report.id, confirmedSectionIds });
      if (result && 'error' in result && result.error) {
        toast.error(result.error);
        return;
      }
      toast.success('Report approvato e attestato');
      router.refresh();
    });
  }, [caseId, report.id, router]);

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

  // Download robusto: fetch + toast sull'errore (review 2026-07-06). Prima i
  // link erano <a download>: un 400 (nome perito mancante) / 428 (attestazione)
  // veniva scaricato SILENZIOSAMENTE come finto file .docx invece di mostrare
  // il messaggio. Ora l'errore si vede; sul successo scarica il blob reale.
  const handleDownload = useCallback((url: string) => {
    setIsExporting(true);
    (async () => {
      try {
        const res = await fetch(url);
        if (!res.ok) {
          let msg = 'Esportazione non riuscita. Riprova tra poco.';
          try {
            const body = await res.json();
            if (body?.error) msg = body.error as string;
          } catch { /* corpo non-JSON: tieni il default */ }
          toast.error(msg);
          return;
        }
        const blob = await res.blob();
        const cd = res.headers.get('Content-Disposition') ?? '';
        const fileName = /filename="?([^"]+)"?/.exec(cd)?.[1] ?? 'perizia.docx';
        const objectUrl = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = objectUrl;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(objectUrl);
      } catch {
        toast.error('Esportazione non riuscita. Controlla la connessione e riprova.');
      } finally {
        setIsExporting(false);
      }
    })();
  }, []);

  return (
    <>
      <div className="sticky top-9 z-20 border-b bg-background/95 backdrop-blur-sm px-4 py-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          {/* Left: Status badge + last export */}
          <div className="flex items-center gap-2">
            {effectiveStatus === 'definitivo' ? (
              <Badge variant="success" className="text-xs">Pronto al deposito</Badge>
            ) : (
              <Badge variant="secondary" className="text-xs">Bozza</Badge>
            )}
            <span className="text-xs text-muted-foreground">v{report.version}</span>
            {lastExportInfo && (
              <span className="text-xs text-muted-foreground hidden sm:inline">
                · Ultimo export: {lastExportInfo.format.toUpperCase()},{' '}
                {formatTimeAgo(lastExportInfo.exportedAt)}
              </span>
            )}
          </div>

          {/* Right: Actions — gerarchia chiara per ridurre il rumore visivo:
              VISTE (ghost, discrete) · MODIFICA · [ESPORTA] · APPROVA (primaria) · ⋯ */}
          <div className="flex items-center gap-1.5">
            {/* Viste "peek" — pulsanti ghost, meno peso di azioni vere */}
            {onOpenEventsDrawer && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onOpenEventsDrawer}
                title="Eventi clinici della cronistoria (apre pannello laterale)"
              >
                <FileText className="mr-1 h-3.5 w-3.5" />
                <span className="hidden md:inline">Eventi</span>
                {typeof eventsCount === 'number' && eventsCount > 0 && (
                  <Badge variant="secondary" className="ml-1 text-xs px-1 py-0 leading-tight">
                    {eventsCount}
                  </Badge>
                )}
              </Button>
            )}
            {onOpenOcrDrawer && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onOpenOcrDrawer}
                title="Testo originale dei documenti (apre pannello laterale)"
              >
                <FileSearch className="mr-1 h-3.5 w-3.5" />
                <span className="hidden md:inline">Testo originale</span>
              </Button>
            )}

            {/* Separator prima delle azioni vere */}
            {(onOpenEventsDrawer || onOpenOcrDrawer) && (
              <span className="hidden sm:inline-block w-px h-5 bg-border mx-0.5" aria-hidden />
            )}

            {/* Modifica — azione secondaria, ghost */}
            <Button variant="ghost" size="sm" onClick={onEdit}>
              <Pencil className="mr-1 h-3.5 w-3.5" />
              <span className="hidden md:inline">Modifica</span>
            </Button>

            {/* Export dropdown — azione secondaria, outline */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm">
                  <Download className="mr-1 h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Esporta</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64">
                <DropdownMenuItem
                  onClick={() => window.open(`/api/cases/${caseId}/export/html?inline=true`, '_blank')}
                >
                  <Eye className="mr-2 h-3.5 w-3.5" />
                  <div>
                    <div>Anteprima nel browser</div>
                    <p className="text-xs text-muted-foreground font-normal">Apre la perizia in una nuova scheda</p>
                  </div>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  disabled={isExporting}
                  onSelect={() => handleDownload(`/api/cases/${caseId}/export/docx`)}
                >
                  <Download className="mr-2 h-3.5 w-3.5" />
                  <div>
                    <div>Scarica Word (.docx)</div>
                    <p className="text-xs text-muted-foreground font-normal">Perizia completa, pronta al deposito</p>
                  </div>
                </DropdownMenuItem>
                <DropdownMenuItem
                  disabled={isExporting}
                  onSelect={() => handleDownload(`/api/cases/${caseId}/export/docx?anonymize=true`)}
                >
                  <ShieldCheck className="mr-2 h-3.5 w-3.5" />
                  <div>
                    <div>Word senza dati personali</div>
                    <p className="text-xs text-muted-foreground font-normal">Versione anonimizzata per condivisione</p>
                  </div>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Approva — AZIONE PRIMARIA della schermata, sempre l'elemento più
                evidente (verde), label sempre visibile. */}
            {effectiveStatus === 'bozza' && (
              <Button
                variant="approve"
                size="sm"
                onClick={() => setQualityGateOpen(true)}
                disabled={isPending}
              >
                {isPending ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="mr-1 h-3.5 w-3.5" />}
                <span>Approva</span>
              </Button>
            )}

            {/* Overflow menu */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" title="Altre azioni" aria-label="Altre azioni">
                  <MoreHorizontal className="h-3.5 w-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                {/* Dettagli analisi / Qualità — spostato qui dalla toolbar (il
                    pannello "Da controllare" sotto mostra già gli avvisi; qui
                    restano le metriche: confidenza OCR, copertura documenti). */}
                {onOpenQualitySheet && (
                  <>
                    <DropdownMenuItem onClick={onOpenQualitySheet}>
                      <ShieldAlert className="mr-2 h-3.5 w-3.5" />
                      Dettagli analisi (qualità)
                      {alertCount > 0 && (
                        <Badge variant="destructive" className="ml-auto text-xs px-1.5 py-0 leading-tight">
                          {alertCount}
                        </Badge>
                      )}
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                  </>
                )}
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
        requiredSections={requiredSections}
        onConfirm={handleAttestAndApprove}
      />

    </>
  );
}
