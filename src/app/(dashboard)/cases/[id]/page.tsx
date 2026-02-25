import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, FileText, AlertTriangle, Clock, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { getCase, getCaseDocuments, getCaseEvents, getCaseAnomalies, getCaseMissingDocs, getCaseReport } from '../../actions';
import { CaseDetailClient } from './client';

const statusConfig: Record<string, { label: string; variant: 'secondary' | 'warning' | 'success' | 'outline' }> = {
  bozza: { label: 'Bozza', variant: 'secondary' },
  in_revisione: { label: 'In Revisione', variant: 'warning' },
  definitivo: { label: 'Definitivo', variant: 'success' },
  archiviato: { label: 'Archiviato', variant: 'outline' },
};

const caseTypeLabels: Record<string, string> = {
  ortopedica: 'Malasanita Ortopedica',
  oncologica: 'Ritardo Diagnostico Oncologico',
  ostetrica: 'Errore Ostetrico',
  anestesiologica: 'Errore Anestesiologico',
  infezione_nosocomiale: 'Infezione Nosocomiale',
  errore_diagnostico: 'Errore Diagnostico',
  generica: 'Responsabilita Generica',
};

const processingLabels: Record<string, string> = {
  caricato: 'Caricato',
  in_coda: 'In coda',
  ocr_in_corso: 'OCR in corso',
  estrazione_in_corso: 'Estrazione in corso',
  validazione_in_corso: 'Validazione',
  completato: 'Completato',
  errore: 'Errore',
};

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

  const [documents, events, anomalies, missingDocs, report] = await Promise.all([
    getCaseDocuments(id),
    getCaseEvents(id),
    getCaseAnomalies(id),
    getCaseMissingDocs(id),
    getCaseReport(id),
  ]);

  const status = statusConfig[caseData.status] ?? statusConfig.bozza;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-3xl font-bold tracking-tight">
                {caseData.code}
              </h1>
              <Badge variant={status.variant}>{status.label}</Badge>
              <Badge variant="outline">
                {(caseData.case_role as string).toUpperCase()}
              </Badge>
            </div>
            <p className="text-muted-foreground">
              {caseData.patient_initials || 'N/D'} &mdash;{' '}
              {caseTypeLabels[caseData.case_type as string] ?? caseData.case_type}
              {caseData.practice_reference && ` &mdash; ${caseData.practice_reference}`}
            </p>
          </div>
        </div>
      </div>

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

      {/* Client-side interactive sections */}
      <CaseDetailClient
        caseId={id}
        documents={documents}
        events={events}
        anomalies={anomalies}
        missingDocs={missingDocs}
        report={report}
        processingLabels={processingLabels}
      />
    </div>
  );
}
