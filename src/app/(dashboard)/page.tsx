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
  Clock,
  Star,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { getCases } from './actions';
import { statusConfig, caseTypeLabels, moduleLabels } from '@/lib/constants';
import { formatRelativeDate } from '@/lib/format-date';
import { MODULE_CATEGORIES, MODULE_CATALOG } from '@/types/modules';
import type { ModuleCategoryId } from '@/types/modules';

// ---------------------------------------------------------------------------
// Icon + color mapping per category
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

const PRIORITY_CATEGORY_IDS: ReadonlySet<ModuleCategoryId> = new Set([1, 7, 8]);

/** Visible (non-hidden) modules for a category */
function getVisibleModules(categoryId: ModuleCategoryId) {
  return MODULE_CATALOG.filter((m) => m.categoryId === categoryId && !m.hidden);
}

/** Count of visible sub-modules per category */
function getModuleCount(categoryId: ModuleCategoryId): number {
  return getVisibleModules(categoryId).length;
}

/** For single-module categories, return the direct module link */
function getCategoryHref(categoryId: ModuleCategoryId): string {
  const modules = getVisibleModules(categoryId);
  if (modules.length === 1) {
    return `/cases/new?module=${modules[0].id}`;
  }
  // Multi-module: go to category picker page
  return `/cases/new?category=${categoryId}`;
}

/** True if category has at least one visible module */
function isCategoryVisible(categoryId: ModuleCategoryId): boolean {
  return getVisibleModules(categoryId).length > 0;
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function DashboardPage() {
  const allCases = await getCases();
  const cases = allCases.filter((c) => c.status !== 'archiviato');
  const recentCases = cases.slice(0, 5);

  const priorityCategories = MODULE_CATEGORIES.filter((c) => PRIORITY_CATEGORY_IDS.has(c.id) && isCategoryVisible(c.id));
  const otherCategories = MODULE_CATEGORIES.filter((c) => !PRIORITY_CATEGORY_IDS.has(c.id) && isCategoryVisible(c.id));

  return (
    <div className="space-y-10">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">
          Cosa vuoi fare?
        </h1>
        <p className="mt-1 text-muted-foreground">
          Scegli il tipo di elaborato. Ti guideremo passo passo.
        </p>
      </div>

      {/* Priority categories — large cards */}
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <Star className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold uppercase tracking-wider text-primary">
            I più utilizzati
          </h2>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {priorityCategories.map((cat) => {
            const Icon = CATEGORY_ICONS[cat.id];
            const count = getModuleCount(cat.id);
            const href = getCategoryHref(cat.id);

            return (
              <Link key={cat.id} href={href} className="group block">
                <Card className="h-full rounded-2xl border-primary/20 bg-primary/5 dark:bg-primary/10 transition-all hover:border-primary/40 hover:shadow-lg">
                  <CardContent className="flex flex-col gap-4 p-6">
                    <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary transition-colors group-hover:bg-primary/20">
                      <Icon className="h-6 w-6" />
                    </div>
                    <div>
                      <h3 className="text-lg font-bold">{cat.label}</h3>
                      <p className="mt-1 text-sm text-muted-foreground leading-relaxed">
                        {cat.description}
                      </p>
                    </div>
                    <div className="mt-auto flex items-center justify-between pt-2">
                      {count > 1 && (
                        <span className="text-xs text-muted-foreground">{count} sotto-tipi</span>
                      )}
                      <span className="ml-auto flex items-center gap-1 text-sm font-medium text-primary opacity-70 transition-opacity group-hover:opacity-100">
                        {count === 1 ? 'Inizia' : 'Scegli'}
                        <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                      </span>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      </section>

      {/* Other categories — compact cards */}
      <section className="space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Tutti i moduli
        </h2>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {otherCategories.map((cat) => {
            const Icon = CATEGORY_ICONS[cat.id];
            const href = getCategoryHref(cat.id);

            return (
              <Link key={cat.id} href={href} className="group block">
                <Card className="h-full rounded-xl transition-all hover:shadow-md">
                  <CardContent className="flex items-center gap-4 p-5">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground transition-colors group-hover:bg-primary/10 group-hover:text-primary">
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold">{cat.label}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground leading-snug line-clamp-2">
                        {cat.description}
                      </p>
                    </div>
                    <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground opacity-0 transition-all group-hover:opacity-100 group-hover:translate-x-0.5" />
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      </section>

      {/* Recent cases */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            <Clock className="h-4 w-4" />
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
            <CardContent className="py-12 text-center">
              <p className="text-muted-foreground">
                Non hai ancora elaborati. Scegli un modulo sopra per iniziare!
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
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
                  <Card className="rounded-xl transition-all hover:shadow-md">
                    <CardContent className="flex items-center justify-between gap-4 p-4">
                      <div className="min-w-0 space-y-0.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-sm font-semibold">{caseItem.code}</span>
                          <Badge variant={status.variant}>{status.label}</Badge>
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {caseItem.patient_initials || 'N/D'} — {typeLabel}
                        </p>
                      </div>
                      <div className="shrink-0 text-right text-xs text-muted-foreground">
                        <div>{formatRelativeDate(caseItem.updated_at ?? caseItem.created_at)}</div>
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
