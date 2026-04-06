export const revalidate = 60;

import Link from 'next/link';
import { FolderPlus, FileText, ChevronRight, Star, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { getCases } from './actions';
import { statusConfig, caseTypeLabels } from '@/lib/constants';
import { formatRelativeDate } from '@/lib/format-date';
import { MODULE_CATEGORIES, MODULE_CATALOG } from '@/types/modules';
import type { ModuleCategoryId, ModuleDefinition } from '@/types/modules';

/** Categories expanded by default (contain priority modules) */
const EXPANDED_CATEGORIES: ReadonlySet<ModuleCategoryId> = new Set([1, 7, 8]);

function getModulesGroupedByCategory(): { category: typeof MODULE_CATEGORIES[number]; modules: ModuleDefinition[] }[] {
  return MODULE_CATEGORIES.map((cat) => ({
    category: cat,
    modules: MODULE_CATALOG.filter((m) => m.categoryId === cat.id) as unknown as ModuleDefinition[],
  }));
}

export default async function DashboardPage() {
  const allCases = await getCases();
  const cases = allCases.filter((c) => c.status !== 'archiviato');
  const recentCases = cases.slice(0, 5);
  const grouped = getModulesGroupedByCategory();

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground">
            Scegli un modulo per creare un nuovo caso
          </p>
        </div>
        <Button asChild>
          <Link href="/cases/new">
            <FolderPlus className="h-4 w-4" />
            Nuovo Caso
          </Link>
        </Button>
      </div>

      {/* Module Catalog */}
      <section className="space-y-3">
        <h2 className="text-xl font-semibold tracking-tight">Catalogo Moduli</h2>

        {grouped.map(({ category, modules }) => (
          <details
            key={category.id}
            open={EXPANDED_CATEGORIES.has(category.id) || undefined}
            className="group rounded-lg border bg-card"
          >
            <summary className="flex cursor-pointer items-center gap-3 px-5 py-4 text-left select-none [&::-webkit-details-marker]:hidden list-none">
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-90" />
              <div className="flex-1">
                <span className="font-semibold">{category.label}</span>
                <span className="ml-3 text-sm text-muted-foreground">{category.description}</span>
              </div>
              <Badge variant="outline" className="shrink-0">
                {modules.length}
              </Badge>
            </summary>

            <div className="grid gap-3 px-5 pb-5 sm:grid-cols-2 lg:grid-cols-3">
              {modules.map((mod) => (
                <Link
                  key={mod.id}
                  href={`/cases/new?module=${mod.id}`}
                  className="block"
                >
                  <Card
                    className={
                      'h-full transition-all hover:shadow-md' +
                      (mod.priority
                        ? ' border-primary/30 bg-primary/[0.03]'
                        : '')
                    }
                  >
                    <CardHeader className="pb-2">
                      <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                        {mod.priority && (
                          <Star className="h-3.5 w-3.5 shrink-0 fill-primary text-primary" />
                        )}
                        {mod.label}
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm text-muted-foreground leading-snug">
                        {mod.description}
                      </p>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          </details>
        ))}
      </section>

      {/* Casi Recenti */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold tracking-tight">Casi Recenti</h2>
          <Button variant="ghost" size="sm" asChild>
            <Link href="/cases">
              Vedi tutti
              <ArrowRight className="ml-1 h-4 w-4" />
            </Link>
          </Button>
        </div>

        <Card>
          <CardContent className="pt-6">
            {recentCases.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <FileText className="mb-4 h-12 w-12 text-muted-foreground" />
                <h3 className="text-lg font-semibold">Benvenuto in LegMed</h3>
                <p className="mb-4 text-base text-muted-foreground">
                  Seleziona un modulo dal catalogo sopra per creare il tuo primo caso.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {recentCases.map((caseItem) => {
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
                        <div>Aggiornato {formatRelativeDate(caseItem.updated_at ?? caseItem.created_at)}</div>
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
