import { notFound } from 'next/navigation';
import { FileText, AlertTriangle, Clock } from 'lucide-react';

export const maxDuration = 30;
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Documenti</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-muted-foreground" />
              <span className="text-2xl font-bold">{documents.length}</span>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Eventi Estratti</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <span className="text-2xl font-bold">{events.length}</span>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Anomalie</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-yellow-500" />
              <span className="text-2xl font-bold">{anomalies.length}</span>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Doc. Mancanti</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-destructive" />
              <span className="text-2xl font-bold">{missingDocs.length}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Client-side interactive sections (includes header) */}
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
