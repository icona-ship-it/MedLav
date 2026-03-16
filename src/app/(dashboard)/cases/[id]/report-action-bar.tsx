'use client';

import { useCallback, useTransition, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Loader2, Download, Pencil, Printer, GitCompare, ShieldCheck,
  FileCode, Eye, MoreHorizontal, RefreshCw, ShieldAlert,
} from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { updateReportStatus, getCaseReportVersions } from '../../actions';
import { QualityGateDialog } from './quality-gate-dialog';
import type { ReportRow } from './types';

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
}: ReportActionBarProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [qualityGateOpen, setQualityGateOpen] = useState(false);
  const [isLoadingVersions, setIsLoadingVersions] = useState(false);
  // Treat legacy "in_revisione" as "bozza"
  const effectiveStatus = report.report_status === 'in_revisione' ? 'bozza' : report.report_status;

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
          {/* Left: Status badge */}
          <div className="flex items-center gap-2">
            {effectiveStatus === 'definitivo' ? (
              <Badge variant="success" className="text-xs">Definitivo</Badge>
            ) : (
              <Badge variant="secondary" className="text-xs">Bozza</Badge>
            )}
            <span className="text-xs text-muted-foreground">v{report.version}</span>
          </div>

          {/* Right: Actions */}
          <div className="flex items-center gap-2">
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
                  Anteprima Report
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <a href={`/api/cases/${caseId}/export/html`} download>
                    <Download className="mr-2 h-3.5 w-3.5" />
                    Esporta HTML
                  </a>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <a href={`/api/cases/${caseId}/export/docx`} download>
                    <Download className="mr-2 h-3.5 w-3.5" />
                    Esporta DOCX
                  </a>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handlePdfExport}>
                  <Printer className="mr-2 h-3.5 w-3.5" />
                  Stampa PDF
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
                {/* Regenerate */}
                <DropdownMenuItem
                  onClick={onRegenerate}
                  disabled={isRegenerating}
                >
                  {isRegenerating ? (
                    <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <RefreshCw className="mr-2 h-3.5 w-3.5" />
                  )}
                  {isRegenerating ? 'Rigenerazione...' : 'Rigenera Report'}
                </DropdownMenuItem>

                {/* Versions */}
                {report.version > 1 && (
                  <DropdownMenuItem onClick={handleLoadVersions} disabled={isLoadingVersions}>
                    {isLoadingVersions ? (
                      <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <GitCompare className="mr-2 h-3.5 w-3.5" />
                    )}
                    Confronta versioni
                  </DropdownMenuItem>
                )}

                <DropdownMenuSeparator />

                {/* Export extras */}
                <DropdownMenuItem asChild>
                  <a href={`/api/cases/${caseId}/export/csv`} download>
                    <Download className="mr-2 h-3.5 w-3.5" />
                    Esporta CSV
                  </a>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <a href={`/api/cases/${caseId}/export/pct`} download>
                    <FileCode className="mr-2 h-3.5 w-3.5" />
                    Esporta PCT
                  </a>
                </DropdownMenuItem>

                <DropdownMenuSeparator />

                {/* Anonymize */}
                <DropdownMenuItem asChild>
                  <a href={`/api/cases/${caseId}/export/html?anonymize=true`} download>
                    <ShieldCheck className="mr-2 h-3.5 w-3.5" />
                    Esporta HTML anonimizzato
                  </a>
                </DropdownMenuItem>

                <DropdownMenuSeparator />

                {/* Approve / Revert */}
                {effectiveStatus === 'bozza' && (
                  <DropdownMenuItem onClick={() => setQualityGateOpen(true)} disabled={isPending}>
                    {isPending ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : null}
                    Approva come Definitivo
                  </DropdownMenuItem>
                )}
                {effectiveStatus === 'definitivo' && (
                  <DropdownMenuItem onClick={() => handleStatusChange('bozza')} disabled={isPending}>
                    {isPending ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : null}
                    Riporta a Bozza
                  </DropdownMenuItem>
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
