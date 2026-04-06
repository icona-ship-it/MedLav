export const revalidate = 60;

import Link from 'next/link';
import {
  FileText,
  ArrowRight,
  Search,
  Shield,
  Scale,
  Gavel,
  Briefcase,
  BookOpen,
  ClipboardList,
  Receipt,
  EyeOff,
  Heart,
  Clock,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { getCases } from './actions';
import { statusConfig, caseTypeLabels } from '@/lib/constants';
import { moduleLabels } from '@/lib/constants';
import { formatRelativeDate } from '@/lib/format-date';
import { MODULE_CATEGORIES, MODULE_CATALOG } from '@/types/modules';
import type { ModuleCategoryId, ModuleDefinition } from '@/types/modules';

// ---------------------------------------------------------------------------
// Icon mapping per category
// ---------------------------------------------------------------------------

const CATEGORY_ICONS: Record<ModuleCategoryId, React.ElementType> = {
  1: FileText,
  2: Scale,
  3: Gavel,
  4: Briefcase,
  5: BookOpen,
  6: ClipboardList,
  7: Search,
  8: Shield,
  9: Receipt,
  10: EyeOff,
};

// ---------------------------------------------------------------------------
// Priority categories (shown as large cards at top)
// ---------------------------------------------------------------------------

const PRIORITY_CATEGORY_IDS: ReadonlySet<ModuleCategoryId> = new Set([1, 7, 8]);

function getPriorityModules(): { category: typeof MODULE_CATEGORIES[number]; modules: ModuleDefinition[] }[] {
  return MODULE_CATEGORIES
    .filter((cat) => PRIORITY_CATEGORY_IDS.has(cat.id))
    .map((cat) => ({
      category: cat,
      modules: MODULE_CATALOG.filter((m) => m.categoryId === cat.id) as unknown as ModuleDefinition[],
    }));
}

function getOtherModulesGrouped(): { category: typeof MODULE_CATEGORIES[number]; modules: ModuleDefinition[] }[] {
  return MODULE_CATEGORIES
    .filter((cat) => !PRIORITY_CATEGORY_IDS.has(cat.id))
    .map((cat) => ({
      category: cat,
      modules: MODULE_CATALOG.filter((m) => m.categoryId === cat.id) as unknown as ModuleDefinition[],
    }));
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function DashboardPage() {
  const allCases = await getCases();
  const cases = allCases.filter((c) => c.status !== 'archiviato');
  const recentCases = cases.slice(0, 5);
  const priorityGroups = getPriorityModules();
  const otherGroups = getOtherModulesGrouped();

  return (
    <div className="space-y-10">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">
          Ciao! Cosa vuoi fare?
        </h1>
        <p className="mt-1 text-lg text-muted-foreground">
          Scegli il tipo di elaborato che vuoi creare.
        </p>
      </div>

      {/* Priority modules */}
      <section className="space-y-5">
        <h2 className="text-xl font-semibold tracking-tight">
          Inizia da qui
        </h2>

        <div className="space-y-6">
          {priorityGroups.map(({ category, modules }) => {
            const Icon = CATEGORY_ICONS[category.id];
            const isSingleModule = modules.length === 1;

            if (isSingleModule) {
              const mod = modules[0];
              return (
                <PriorityCard
                  key={mod.id}
                  href={`/cases/new?module=${mod.id}`}
                  icon={Icon}
                  title={category.label}
                  description={mod.description}
                />
              );
            }

            // Multi-module category (Cat 1): show category header + inline sub-cards
            return (
              <div key={category.id} className="space-y-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Icon className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold">{category.label}</h3>
                    <p className="text-sm text-muted-foreground">{category.description}</p>
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  {modules.map((mod) => (
                    <Link
                      key={mod.id}
                      href={`/cases/new?module=${mod.id}`}
                      className="group block"
                    >
                      <Card className="h-full rounded-xl border-primary/20 bg-primary/[0.02] p-6 transition-all hover:border-primary/40 hover:shadow-md">
                        <CardContent className="flex items-center justify-between gap-4 p-0">
                          <div className="min-w-0">
                            <p className="text-base font-semibold">{mod.label}</p>
                            <p className="mt-1 text-sm text-muted-foreground leading-snug">
                              {mod.description}
                            </p>
                          </div>
                          <ArrowRight className="h-5 w-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-1 group-hover:text-primary" />
                        </CardContent>
                      </Card>
                    </Link>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Other modules */}
      <section className="space-y-5">
        <h2 className="text-xl font-semibold tracking-tight">
          Altri moduli
        </h2>

        <div className="space-y-6">
          {otherGroups.map(({ category, modules }) => {
            const Icon = CATEGORY_ICONS[category.id];
            return (
              <div key={category.id} className="space-y-3">
                <div className="flex items-center gap-2">
                  <Icon className="h-4 w-4 text-muted-foreground" />
                  <h3 className="font-semibold">{category.label}</h3>
                  <span className="text-sm text-muted-foreground">&mdash; {category.description}</span>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {modules.map((mod) => (
                    <Link
                      key={mod.id}
                      href={`/cases/new?module=${mod.id}`}
                      className="group block"
                    >
                      <Card className="h-full rounded-xl p-5 transition-all hover:shadow-md">
                        <CardContent className="flex items-center justify-between gap-3 p-0">
                          <div className="min-w-0">
                            <p className="text-sm font-semibold">{mod.label}</p>
                            <p className="mt-0.5 text-xs text-muted-foreground leading-snug">
                              {mod.description}
                            </p>
                          </div>
                          <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground opacity-0 transition-all group-hover:translate-x-0.5 group-hover:opacity-100" />
                        </CardContent>
                      </Card>
                    </Link>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Recent cases */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold tracking-tight flex items-center gap-2">
            <Clock className="h-5 w-5 text-muted-foreground" />
            I tuoi ultimi elaborati
          </h2>
          {recentCases.length > 0 && (
            <Button variant="ghost" size="sm" asChild>
              <Link href="/cases">
                Vedi tutti
                <ArrowRight className="ml-1 h-4 w-4" />
              </Link>
            </Button>
          )}
        </div>

        {recentCases.length === 0 ? (
          <Card className="rounded-xl">
            <CardContent className="pt-6">
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-muted">
                  <Heart className="h-8 w-8 text-muted-foreground" />
                </div>
                <h3 className="text-lg font-semibold">
                  Non hai ancora elaborati
                </h3>
                <p className="mt-1 max-w-sm text-base text-muted-foreground">
                  Scegli un modulo sopra per iniziare a creare il tuo primo elaborato.
                </p>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {recentCases.map((caseItem) => {
              const status = statusConfig[caseItem.status] ?? statusConfig.bozza;
              const moduleId = (caseItem as Record<string, unknown>).module_id as string | null;
              const moduleLabel = moduleId ? moduleLabels[moduleId] : null;
              const typeLabel = moduleLabel
                ?? caseTypeLabels[caseItem.case_type as string]
                ?? caseItem.case_type;

              return (
                <Link
                  key={caseItem.id}
                  href={`/cases/${caseItem.id}`}
                  className="group block"
                >
                  <Card className="rounded-xl p-5 transition-all hover:shadow-md">
                    <CardContent className="flex items-center justify-between gap-4 p-0">
                      <div className="min-w-0 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
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
                          {caseItem.patient_initials || 'N/D'} &mdash; {typeLabel}
                        </p>
                      </div>
                      <div className="shrink-0 text-right text-sm text-muted-foreground">
                        <div>{caseItem.document_count} documenti</div>
                        <div>Aggiornato {formatRelativeDate(caseItem.updated_at ?? caseItem.created_at)}</div>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Priority card component (single-module categories like Cat 7, Cat 8)
// ---------------------------------------------------------------------------

function PriorityCard({
  href,
  icon: Icon,
  title,
  description,
}: {
  href: string;
  icon: React.ElementType;
  title: string;
  description: string;
}) {
  return (
    <Link href={href} className="group block">
      <Card className="rounded-xl border-primary/20 bg-primary/[0.02] p-6 transition-all hover:border-primary/40 hover:shadow-md">
        <CardContent className="flex items-center gap-5 p-0">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary transition-colors group-hover:bg-primary/20">
            <Icon className="h-6 w-6" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-lg font-semibold">{title}</p>
            <p className="mt-1 text-sm text-muted-foreground leading-snug">
              {description}
            </p>
          </div>
          <div className="flex items-center gap-1 text-sm font-medium text-primary opacity-0 transition-opacity group-hover:opacity-100">
            Inizia
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
