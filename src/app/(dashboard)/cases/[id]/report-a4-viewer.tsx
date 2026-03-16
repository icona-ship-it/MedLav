'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { MarkdownPreview } from '@/components/markdown-preview';
import { LinkedReportViewer } from '@/components/linked-report-viewer';
import { SectionRegenerateButton } from '@/components/section-regenerate-button';
import { ReportRating } from '@/components/report-rating';
import { parseSections } from '@/lib/section-parser-client';
import type { ReportRow, EventRow } from './types';

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
              ? 'Il report non è ancora stato generato, ma gli eventi sono già disponibili nella tab Timeline.'
              : 'Nessuna sintesi generata. Avvia l\'elaborazione dei documenti.'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="report-page-container">
      <div className="report-a4-page">
        <div className="space-y-6">
          {sections.map((section) => (
            <div
              key={section.id}
              id={`section-${section.id}`}
              className={`group ${lastRegeneratedSection === section.id ? 'animate-highlight-flash' : ''}`}
            >
              {section.id !== 'preamble' && section.id !== 'full_report' && (
                <div className="flex items-center justify-between mb-2">
                  <h2 className="text-lg font-semibold">{section.title}</h2>
                  <SectionRegenerateButton
                    caseId={caseId}
                    sectionId={section.id}
                    sectionTitle={section.title}
                    disabled={regeneratingSection !== null}
                    onRegenerated={() => handleSectionRegenerated(section.id)}
                  />
                </div>
              )}
              <div className="prose prose-sm max-w-none">
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
          ))}
        </div>

        {/* Rating at bottom of A4 page for definitivo reports */}
        {report.report_status === 'definitivo' && (
          <div className="mt-8 pt-6 border-t">
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
    </div>
  );
}
