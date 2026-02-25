import Link from 'next/link';
import { FolderPlus, FileText, AlertTriangle, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { getCases } from './actions';
import { statusConfig, caseTypeLabels } from '@/lib/constants';

export default async function DashboardPage() {
  const allCases = await getCases();
  // Exclude archived cases from main dashboard
  const cases = allCases.filter((c) => c.status !== 'archiviato');

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
            <CardTitle className="text-sm font-medium">Casi Attivi</CardTitle>
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
              <FileText className="h-6 w-6 text-primary" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{cases.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">In Revisione</CardTitle>
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-yellow-500/10">
              <AlertTriangle className="h-6 w-6 text-yellow-500" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{inRevisione}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Bozze</CardTitle>
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
              <Clock className="h-6 w-6 text-muted-foreground" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{bozze}</div>
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
              <h3 className="text-lg font-semibold">Benvenuto in MedLav</h3>
              <p className="mb-4 text-base text-muted-foreground">
                Crea il tuo primo caso per iniziare ad analizzare la documentazione clinica.
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
                    className="flex items-center justify-between rounded-lg border bg-card p-5 shadow-sm transition-all hover:shadow-md"
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
                          {((caseItem.case_role as string) ?? '').toUpperCase()}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {caseItem.patient_initials || 'N/D'} &mdash;{' '}
                        {caseTypeLabels[caseItem.case_type as string] ?? caseItem.case_type}
                      </p>
                    </div>
                    <div className="text-right text-sm text-muted-foreground">
                      <div>{caseItem.document_count} documenti</div>
                      <div>Aggiornato: {new Date(caseItem.updated_at ?? caseItem.created_at).toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</div>
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
