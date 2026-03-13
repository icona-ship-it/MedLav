import { notFound } from 'next/navigation';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;
import { getCase, getCaseDocuments, getCaseEvents, getCaseAnomalies, getCaseMissingDocs, getCaseReport, getCaseEventImages, getCaseDocumentPages } from '../../actions';
import { createClient } from '@/lib/supabase/server';
import { logAccess } from '@/lib/audit';
import { CaseDetailClient } from './client';
import { processingLabels } from '@/lib/constants';

export default async function CaseDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const caseData = await getCase(id);

  if (!caseData) {
    notFound();
  }

  // Audit log: fire-and-forget, does not block page load
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  logAccess({
    userId: user?.id ?? null,
    action: 'case.viewed',
    entityType: 'case',
    entityId: id,
  });

  // Skip heavy queries (event images, document pages, signed URLs) only during
  // active pipeline stages. Keep them for user-facing stages (revisione_anomalie
  // needs documentPages, errore needs full data for debugging).
  const activelyProcessingStages = ['elaborazione', 'revisione_classificazione', 'generazione_report'];
  const isActivelyProcessing = activelyProcessingStages.includes(caseData.processing_stage as string);

  const [documents, events, anomalies, missingDocs, report, eventImagesMap, documentPages] = await Promise.all([
    getCaseDocuments(id),
    getCaseEvents(id),
    getCaseAnomalies(id),
    getCaseMissingDocs(id),
    getCaseReport(id),
    isActivelyProcessing ? Promise.resolve({} as Record<string, string[]>) : getCaseEventImages(id),
    isActivelyProcessing ? Promise.resolve([] as Awaited<ReturnType<typeof getCaseDocumentPages>>) : getCaseDocumentPages(id),
  ]);

  // Pass raw storage paths to client — images are loaded via proxy API on demand
  // (avoids N signed URL API calls that cause timeout on large cases)

  return (
    <div className="space-y-6">
      <CaseDetailClient
        caseId={id}
        caseData={caseData}
        documents={documents}
        events={events}
        anomalies={anomalies}
        missingDocs={missingDocs}
        report={report}
        processingLabels={processingLabels}
        eventImages={eventImagesMap}
        documentPages={documentPages}
      />
    </div>
  );
}
