import Link from 'next/link';
import { FolderPlus, FileText, AlertTriangle, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { getCases } from './actions';

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

export default async function DashboardPage() {
  const cases = await getCases();

  const inRevisione = cases.filter((c) => c.status === 'in_revisione').length;
  const bozze = cases.filter((c) => c.status === 'bozza').length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground">
            Gestisci i tuoi casi medico-legali
          </p>
        </div>
        <Button asChild>
          <Link href="/cases/new">
            <FolderPlus className="h-4 w-4" />
            Nuovo Caso
          </Link>
        </Button>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Casi Totali</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{cases.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">In Revisione</CardTitle>
            <AlertTriangle className="h-4 w-4 text-yellow-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{inRevisione}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Bozze</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{bozze}</div>
          </CardContent>
        </Card>
      </div>

      {/* Cases List */}
      <Card>
        <CardHeader>
          <CardTitle>I Tuoi Casi</CardTitle>
          <CardDescription>
            Lista di tutti i casi medico-legali
          </CardDescription>
        </CardHeader>
        <CardContent>
          {cases.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <FileText className="mb-4 h-12 w-12 text-muted-foreground" />
              <h3 className="text-lg font-semibold">Nessun caso</h3>
              <p className="mb-4 text-sm text-muted-foreground">
                Crea il tuo primo caso per iniziare
              </p>
              <Button asChild>
                <Link href="/cases/new">
                  <FolderPlus className="h-4 w-4" />
                  Nuovo Caso
                </Link>
              </Button>
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
