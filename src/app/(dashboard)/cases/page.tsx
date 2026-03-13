export const revalidate = 30;

import Link from 'next/link';
import { Archive, FileText, FolderPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { getCases } from '../actions';
import { statusConfig, caseTypeLabels, processingStageConfig } from '@/lib/constants';

const VALID_STATUSES = ['bozza', 'in_revisione', 'definitivo', 'archiviato'];

interface CasesPageProps {
  searchParams: Promise<{ status?: string }>;
}

export default async function CasesPage({ searchParams }: CasesPageProps) {
  const params = await searchParams;
  const statusFilter = params.status && VALID_STATUSES.includes(params.status)
    ? params.status
    : undefined;

  const cases = await getCases(statusFilter);

  const isArchive = statusFilter === 'archiviato';
  const title = isArchive ? 'Archivio' : 'Tutti i Casi';
  const description = isArchive
    ? 'Casi archiviati'
    : statusFilter
      ? `Casi con stato: ${statusConfig[statusFilter]?.label ?? statusFilter}`
      : 'Tutti i tuoi casi medico-legali';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
          <p className="text-muted-foreground">{description}</p>
        </div>
        <Button asChild>
          <Link href="/cases/new">
            <FolderPlus className="h-4 w-4" />
            Nuovo Caso
          </Link>
        </Button>
      </div>

      {/* Cases List */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {isArchive && <Archive className="h-5 w-5" />}
            {title}
          </CardTitle>
          <CardDescription>
            {cases.length} {cases.length === 1 ? 'caso' : 'casi'} {statusFilter ? `con stato "${statusConfig[statusFilter]?.label ?? statusFilter}"` : 'totali'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {cases.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              {isArchive ? (
                <Archive className="mb-4 h-12 w-12 text-muted-foreground" />
              ) : (
                <FileText className="mb-4 h-12 w-12 text-muted-foreground" />
              )}
              <h3 className="text-lg font-semibold">
                {isArchive ? 'Nessun caso archiviato' : 'Nessun caso'}
              </h3>
              <p className="mb-4 text-sm text-muted-foreground">
                {isArchive
                  ? 'I casi archiviati appariranno qui.'
                  : 'Crea il tuo primo caso per iniziare.'}
              </p>
              {!isArchive && (
                <Button asChild>
                  <Link href="/cases/new">
                    <FolderPlus className="h-4 w-4" />
                    Nuovo Caso
                  </Link>
                </Button>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {cases.map((caseItem) => {
                const status = statusConfig[caseItem.status] ?? statusConfig.bozza;
                return (
                  <Link
                    key={caseItem.id}
                    href={`/cases/${caseItem.id}`}
                    className="flex items-center justify-between rounded-lg border p-4 transition-colors hover:bg-accent"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm font-semibold">
                          {caseItem.code}
                        </span>
                        <Badge variant={status.variant}>
                          {status.label}
                        </Badge>
                        {(() => {
                          const stage = processingStageConfig[caseItem.processing_stage as string];
                          return stage?.show ? (
                            <Badge variant={stage.variant}>
                              {stage.label}
                            </Badge>
                          ) : null;
                        })()}
                        <Badge variant="outline">
                          {(caseItem.case_role as string).toUpperCase()}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {caseItem.patient_initials || 'N/D'} &mdash;{' '}
                        {caseTypeLabels[caseItem.case_type as string] ?? caseItem.case_type}
                      </p>
                    </div>
                    <div className="text-right text-sm text-muted-foreground">
                      <div>{caseItem.document_count} documenti</div>
                      <div>{new Date(caseItem.created_at).toLocaleDateString('it-IT')}</div>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
