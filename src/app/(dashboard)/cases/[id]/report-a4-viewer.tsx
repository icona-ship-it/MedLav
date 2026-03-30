'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { MarkdownPreview } from '@/components/markdown-preview';
import { LinkedReportViewer } from '@/components/linked-report-viewer';
import { SectionRegenerateButton } from '@/components/section-regenerate-button';
import { ReportRating } from '@/components/report-rating';
import { parseSections } from '@/lib/section-parser-client';
import type { ReportRow, EventRow } from './types';

const ReportSectionEditor = dynamic(
  () => import('./report-section-editor').then((m) => ({ default: m.ReportSectionEditor })),
  { loading: () => null },
);

const VersionCompare = dynamic(
  () => import('@/components/version-compare').then((m) => ({ default: m.VersionCompare })),
  { loading: () => null },
);

interface ReportA4ViewerProps {
  caseId: string;
  report: ReportRow;
  events: EventRow[];
  onEventClick?: (orderNumber: number) => void;
  regeneratingSection: string | null;
  onSectionRegenerated: (sectionId?: string) => void;
  lastRegeneratedSection: string | null;
  showVersionCompare: boolean;
  versions: ReportRow[];
}

export function ReportA4Viewer({
  caseId,
  report,
  events,
  onEventClick,
  regeneratingSection,
  onSectionRegenerated,
  lastRegeneratedSection,
  showVersionCompare,
  versions,
}: ReportA4ViewerProps) {
  const router = useRouter();
  const synthesis = report.synthesis ?? '';
  const sections = parseSections(synthesis);
  const eventRefs = events.map((e) => ({
    orderNumber: e.order_number,
    title: e.title,
    eventDate: e.event_date,
  }));

  // Section editing state
  const [editingSection, setEditingSection] = useState<{
    id: string;
    title: string;
    content: string;
  } | null>(null);

  // Rating state
  const [existingRating, setExistingRating] = useState<number | null>(null);
  const [existingComment, setExistingComment] = useState<string | null>(null);

  useEffect(() => {
    if (!report.id) return;
    fetch(`/api/report-ratings?reportId=${report.id}`)
      .then((r) => r.json())
      .then((result: { success: boolean; data?: { rating: number; comment: string | null } | null }) => {
        if (result.success && result.data) {
          setExistingRating(result.data.rating);
          setExistingComment(result.data.comment);
        }
      })
      .catch(() => { /* ignore */ });
  }, [report.id]);

  const handleSectionRegenerated = useCallback((sectionId?: string) => {
    onSectionRegenerated(sectionId);
    router.refresh();
  }, [onSectionRegenerated, router]);

  if (!synthesis) {
    return (
      <div className="report-page-container">
        <div className="report-a4-page">
          <p className="py-12 text-center text-sm text-muted-foreground">
            {events.length > 0
              ? 'Il report non \u00e8 ancora stato generato, ma gli eventi sono gi\u00e0 disponibili nella tab Timeline.'
              : 'Nessuna sintesi generata. Avvia l\'elaborazione dei documenti.'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="report-page-container">
      <div className="report-a4-page">
        {/* Legend — explains [Ev.N] and source categories */}
        <details className="mb-6 rounded-lg border border-border/50 bg-muted/20 text-xs">
          <summary className="cursor-pointer px-4 py-2.5 font-medium text-muted-foreground hover:text-foreground select-none">
            Legenda riferimenti del report
          </summary>
          <div className="px-4 pb-3 pt-1 space-y-2 text-muted-foreground">
            <div>
              <span className="font-semibold text-foreground">[Ev.N]</span> — Riferimento
              all&apos;evento N nella cronologia clinica (es. [Ev.3] = terzo evento in ordine cronologico).
              Clicca sul riferimento per vedere i dettagli dell&apos;evento.
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1">
              <div><span className="font-semibold text-foreground">(A)</span> Cartella clinica</div>
              <div><span className="font-semibold text-foreground">(B)</span> Referti e controlli medici</div>
              <div><span className="font-semibold text-foreground">(C)</span> Esami strumentali (RX, TAC, RM)</div>
              <div><span className="font-semibold text-foreground">(D)</span> Esami ematochimici</div>
            </div>
          </div>
        </details>

        {sections.map((section, index) => {
          const isPreamble = section.id === 'preamble';
          const isFullReport = section.id === 'full_report';
          const showRegenerate = !isPreamble && !isFullReport;
          const isFirst = index === 0;

          return (
            <div
              key={section.id}
              id={`section-${section.id}`}
              className={`group ${lastRegeneratedSection === section.id ? 'animate-highlight-flash' : ''}${!isFirst ? ' mt-10 pt-8 border-t border-border/40' : ''}`}
            >
              {/* Section heading with edit + regenerate buttons */}
              {showRegenerate && (
                <div className="flex items-start justify-between gap-4 mb-4">
                  <h2 className="text-xl font-bold tracking-tight leading-tight">
                    {section.title}
                  </h2>
                  <div className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0 mt-1 flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      title={`Modifica "${section.title}"`}
                      onClick={() => setEditingSection({
                        id: section.id,
                        title: section.title,
                        content: section.content,
                      })}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <SectionRegenerateButton
                      caseId={caseId}
                      sectionId={section.id}
                      sectionTitle={section.title}
                      disabled={regeneratingSection !== null}
                      onRegenerated={() => handleSectionRegenerated(section.id)}
                    />
                  </div>
                </div>
              )}

              {/* Preamble: render as formal header block */}
              {isPreamble && (
                <div className="mb-2 pb-6 border-b border-border/40 text-center">
                  <div className="prose max-w-none">
                    {eventRefs.length > 0 ? (
                      <LinkedReportViewer
                        content={section.content}
                        events={eventRefs}
                        onEventClick={onEventClick}
                        caseId={caseId}
                      />
                    ) : (
                      <MarkdownPreview content={section.content} caseId={caseId} />
                    )}
                  </div>
                </div>
              )}

              {/* Regular sections */}
              {!isPreamble && (
                <div className="prose max-w-none">
                  {eventRefs.length > 0 ? (
                    <LinkedReportViewer
                      content={section.content}
                      events={eventRefs}
                      onEventClick={onEventClick}
                      caseId={caseId}
                    />
                  ) : (
                    <MarkdownPreview content={section.content} caseId={caseId} />
                  )}
                </div>
              )}
            </div>
          );
        })}

        {/* Rating at bottom of A4 page for definitivo reports */}
        {report.report_status === 'definitivo' && (
          <div className="mt-10 pt-6 border-t border-border/40">
            <ReportRating
              reportId={report.id}
              existingRating={existingRating}
              existingComment={existingComment}
              onRated={() => router.refresh()}
            />
          </div>
        )}
      </div>

      {/* Version compare below A4 page */}
      {showVersionCompare && versions.length > 1 && (
        <div className="mt-6">
          <VersionCompare currentReport={report} versions={versions} />
        </div>
      )}

      {/* Section editor dialog */}
      <ReportSectionEditor
        open={editingSection !== null}
        onOpenChange={(open) => { if (!open) setEditingSection(null); }}
        caseId={caseId}
        reportId={report.id}
        sectionId={editingSection?.id ?? ''}
        sectionTitle={editingSection?.title ?? ''}
        sectionContent={editingSection?.content ?? ''}
        onSaved={() => {
          setEditingSection(null);
          router.refresh();
        }}
      />
    </div>
  );
}
