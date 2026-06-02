'use client';

import { useCallback, useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { Pencil, Lock, LockOpen } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { MarkdownPreview } from '@/components/markdown-preview';
import { LinkedReportViewer } from '@/components/linked-report-viewer';
import { SectionRegenerateButton } from '@/components/section-regenerate-button';
import { ReportRating } from '@/components/report-rating';
import { parseSections } from '@/lib/section-parser-client';
import { expandDeterministicBlocks, hasDeterministicMarkers, type DeterministicDoc } from '@/services/calculations/deterministic-tables';
import { getSectionStatus } from '@/lib/section-state';
import { setSectionLock } from '../../actions';
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
  docs?: DeterministicDoc[];
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
  docs,
  onEventClick,
  regeneratingSection,
  onSectionRegenerated,
  lastRegeneratedSection,
  showVersionCompare,
  versions,
}: ReportA4ViewerProps) {
  const router = useRouter();
  // Expand deterministic factual blocks (ITT/ITP, spese, cronologia) from the
  // CURRENT events at read time → always in sync, no LLM, no regeneration.
  // No-op on legacy reports (no sentinel markers).
  const rawSynthesis = report.synthesis ?? '';
  const synthesis = expandDeterministicBlocks(rawSynthesis, events, docs);
  const sections = parseSections(synthesis);
  // The editor must operate on the RAW content (preserving the sentinel marker),
  // never on the expanded table — otherwise a save would freeze the table.
  const rawContentById = new Map(parseSections(rawSynthesis).map((s) => [s.canonicalId, s.content]));
  const eventRefs = events.map((e) => ({
    orderNumber: e.order_number,
    title: e.title,
    eventDate: e.event_date,
  }));

  // Section editing state
  const [editingSection, setEditingSection] = useState<{
    id: string;
    canonicalId: string;
    title: string;
    content: string;
  } | null>(null);

  // Lock/unlock per-section
  const [isLocking, startLock] = useTransition();
  const handleToggleLock = useCallback((canonicalId: string, currentlyLocked: boolean) => {
    startLock(async () => {
      const result = await setSectionLock({
        caseId,
        reportId: report.id,
        sectionCanonicalId: canonicalId,
        locked: !currentlyLocked,
        expectedUpdatedAt: report.updated_at,
      });
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(currentlyLocked ? 'Sezione sbloccata' : 'Sezione confermata');
      router.refresh();
    });
  }, [caseId, report.id, report.updated_at, router]);

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
        {sections.map((section, index) => {
          const isPreamble = section.id === 'preamble';
          const isFullReport = section.id === 'full_report';
          const showRegenerate = !isPreamble && !isFullReport;
          const isFirst = index === 0;
          const status = getSectionStatus(report.generation_metadata, section.canonicalId);
          const isLocked = status === 'locked';
          // A section that embeds a deterministic block (e.g. the ITT/ITP table)
          // must NOT be LLM-regenerated — that would discard the live sentinel.
          // The factual table is always in sync; correct it by editing the events.
          const rawSectionContent = rawContentById.get(section.canonicalId) ?? '';
          const hasDeterministic = hasDeterministicMarkers(rawSectionContent);
          // documentazione_sanitaria is a VERBATIM block (not an auto-table): the
          // perito may MATERIALIZE it on edit (final-phase manual override). The
          // ITT/ITP/spese/crono tables, instead, must stay auto (correct via events).
          const isDocSanitaria = rawSectionContent.includes('MEDLAV:DOC_SANITARIA');

          return (
            <div
              key={section.id}
              id={`section-${section.id}`}
              className={`group ${lastRegeneratedSection === section.id ? 'animate-highlight-flash' : ''}${!isFirst ? ' mt-10 pt-8 border-t border-border/40' : ''}`}
            >
              {/* Section heading with state badge + edit/lock/regenerate buttons */}
              {showRegenerate && (
                <div className="flex items-start justify-between gap-4 mb-4">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="text-xl font-bold tracking-tight leading-tight">
                      {section.title}
                    </h2>
                    {status === 'edited' && (
                      <Badge variant="info" title="Modificata a mano — la rigenerazione chiederà conferma prima di sovrascrivere">Modificata</Badge>
                    )}
                    {isLocked && (
                      <Badge variant="success" title="Confermata — protetta dalla rigenerazione"><Lock className="mr-1 h-3 w-3" />Confermata</Badge>
                    )}
                    {hasDeterministic && !isDocSanitaria && (
                      <Badge variant="info" title="Contiene una tabella calcolata automaticamente dai dati. Per correggerla, modifica gli eventi nella Timeline.">Tabella automatica</Badge>
                    )}
                    {isDocSanitaria && (
                      <Badge variant="info" title="Documentazione riprodotta verbatim dall'OCR (nessuna modifica AI). Puoi modificarla a mano in fase finale: l'edit la rende testo tuo.">Trascrizione automatica</Badge>
                    )}
                  </div>
                  <div className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0 mt-1 flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      title={`Modifica "${section.title}"`}
                      onClick={() => setEditingSection({
                        id: section.id,
                        canonicalId: section.canonicalId,
                        title: section.title,
                        // documentazione_sanitaria: open the MATERIALIZED verbatim
                        // (section.content = expanded), so saving replaces the
                        // sentinel with the perito's editable text. Only when the
                        // OCR docs are actually loaded — otherwise we'd capture the
                        // empty fallback; fall back to the raw marker. Other
                        // deterministic sections keep the raw marker (stay auto).
                        content: (isDocSanitaria && docs && docs.length > 0)
                          ? section.content
                          : (rawContentById.get(section.canonicalId) ?? section.content),
                      })}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      disabled={isLocking}
                      title={isLocked ? `Sblocca "${section.title}"` : `Conferma "${section.title}" (protegge dalla rigenerazione)`}
                      onClick={() => handleToggleLock(section.canonicalId, isLocked)}
                    >
                      {isLocked ? <Lock className="h-3.5 w-3.5 text-success" /> : <LockOpen className="h-3.5 w-3.5" />}
                    </Button>
                    {/* No LLM regeneration for sections with a deterministic
                        block — it would discard the live table. */}
                    {!hasDeterministic && (
                      <SectionRegenerateButton
                        caseId={caseId}
                        sectionId={section.canonicalId}
                        sectionTitle={section.title}
                        reportVersion={report.version}
                        disabled={regeneratingSection !== null}
                        onRegenerated={() => handleSectionRegenerated(section.id)}
                      />
                    )}
                    {/* documentazione_sanitaria: deterministic by default, but the
                        perito can ask for the LLM-elaborated variant (translation,
                        lab tables, grouping). */}
                    {isDocSanitaria && (
                      <SectionRegenerateButton
                        caseId={caseId}
                        sectionId={section.canonicalId}
                        sectionTitle={section.title}
                        reportVersion={report.version}
                        disabled={regeneratingSection !== null}
                        onRegenerated={() => handleSectionRegenerated(section.id)}
                        elaborated
                        label="Versione AI"
                      />
                    )}
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
          <VersionCompare currentReport={report} versions={versions} events={events} docs={docs} />
        </div>
      )}

      {/* Section editor dialog */}
      <ReportSectionEditor
        open={editingSection !== null}
        onOpenChange={(open) => { if (!open) setEditingSection(null); }}
        caseId={caseId}
        reportId={report.id}
        sectionId={editingSection?.id ?? ''}
        sectionCanonicalId={editingSection?.canonicalId}
        sectionTitle={editingSection?.title ?? ''}
        sectionContent={editingSection?.content ?? ''}
        reportUpdatedAt={report.updated_at}
        onSaved={() => {
          setEditingSection(null);
          router.refresh();
        }}
      />
    </div>
  );
}
