import { notFound } from 'next/navigation';

export const maxDuration = 30;
import { getCase, getCaseDocuments, getCaseEvents, getCaseAnomalies, getCaseMissingDocs, getCaseReport, getCaseEventImages } from '../../actions';
import { getSignedUrl } from '@/lib/supabase/storage';
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

  const [documents, events, anomalies, missingDocs, report, eventImagesMap] = await Promise.all([
    getCaseDocuments(id),
    getCaseEvents(id),
    getCaseAnomalies(id),
    getCaseMissingDocs(id),
    getCaseReport(id),
    getCaseEventImages(id),
  ]);

  // Generate signed URLs for event images (parallel)
  const eventImages: Record<string, string[]> = {};
  const entries = Object.entries(eventImagesMap);
  const urlResults = await Promise.all(
    entries.map(async ([eventId, paths]) => {
      const urls = await Promise.all(
        paths.map(async (path) => {
          try {
            return await getSignedUrl(path);
          } catch {
            return null;
          }
        }),
      );
      return { eventId, urls: urls.filter((u): u is string => u !== null) };
    }),
  );
  for (const { eventId, urls } of urlResults) {
    if (urls.length > 0) {
      eventImages[eventId] = urls;
    }
  }

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
        eventImages={eventImages}
      />
    </div>
  );
}
