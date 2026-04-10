export const revalidate = 30;

import Link from 'next/link';
import { Archive, FileText, FolderPlus, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { getCases } from '../actions';
import { statusConfig, caseTypeLabels, moduleLabels } from '@/lib/constants';
import { CaseSearch } from './case-search';
import type { CaseSearchItem } from './case-search';

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

      {/* Active analyses info */}
      {(() => {
        const activeCount = cases.filter((c) => {
          const stage = (c as Record<string, unknown>).processing_stage as string | undefined;
          return stage && stage !== 'idle' && stage !== 'completato' && stage !== 'errore';
        }).length;
        return activeCount > 0 ? (
          <div className="flex items-center gap-2 rounded-md border bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800 px-4 py-2.5 text-sm text-blue-800 dark:text-blue-200">
            <Loader2 className="h-4 w-4 animate-spin shrink-0" />
            <span><strong>{activeCount}</strong> {activeCount === 1 ? 'analisi in corso' : 'analisi in corso'} su 5 disponibili in parallelo</span>
          </div>
        ) : null;
      })()}

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
            <CaseSearch cases={cases.map((caseItem) => {
              const status = statusConfig[caseItem.status] ?? statusConfig.bozza;
              const moduleId = (caseItem as Record<string, unknown>).module_id as string | null;
              const label = moduleId ? moduleLabels[moduleId] : caseTypeLabels[caseItem.case_type as string];
              return {
                id: caseItem.id,
                code: caseItem.code,
                patient_initials: caseItem.patient_initials,
                status: caseItem.status,
                case_type: caseItem.case_type as string,
                case_role: caseItem.case_role as string,
                module_id: moduleId,
                processing_stage: caseItem.processing_stage as string,
                document_count: caseItem.document_count,
                created_at: caseItem.created_at,
                label: label ?? (caseItem.case_type as string),
                statusLabel: status.label,
                statusVariant: status.variant,
              } satisfies CaseSearchItem;
            })} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
