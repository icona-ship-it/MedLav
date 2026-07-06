export const revalidate = 60;

import Link from 'next/link';
import {
  FileText,
  ArrowRight,
  Clock,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { getCases } from './actions';
import { statusConfig, caseTypeLabels, moduleLabels } from '@/lib/constants';
import { formatRelativeDate } from '@/lib/format-date';
import { RC_MODULE, MODULE_CATALOG } from '@/types/modules';
import { getElaborationCost } from '@/services/credits/credit-costs';

// rc-mvp: la perizia RC è il cavallo di battaglia (CTA principale). Sotto,
// gli strumenti standalone riesposti (2026-07-06): cronistoria, spese,
// anonimizzatore — ognuno pre-seleziona il modulo su /cases/new.

export default async function DashboardPage() {
  const allCases = await getCases();
  const cases = allCases.filter((c) => c.status !== 'archiviato');
  const recentCases = cases.slice(0, 5);
  const creditCost = getElaborationCost(RC_MODULE.pipelineMode);
  const tools = MODULE_CATALOG.filter((m) => !m.priority && !m.hidden);

  return (
    <div className="space-y-10">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">
          Perizia medico-legale RC
        </h1>
        <p className="mt-1 text-muted-foreground">
          Carica la documentazione clinica e ottieni la bozza di perizia in pochi minuti.
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          I crediti si usano solo quando avvii un&apos;elaborazione — creare un caso e caricare documenti è gratis.
        </p>
      </div>

      {/* CTA unica — modulo RC */}
      <section>
        <Link href="/cases/new" className="group block max-w-xl">
          <Card className="rounded-2xl border-primary/20 bg-primary/5 dark:bg-primary/10 transition-all hover:border-primary/40 hover:shadow-lg">
            <CardContent className="flex flex-col gap-4 p-6">
              <div className="flex items-center justify-between">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary transition-colors group-hover:bg-primary/20">
                  <FileText className="h-6 w-6" />
                </div>
                <Badge variant="secondary" className="text-xs font-semibold">
                  {creditCost} crediti
                </Badge>
              </div>
              <div>
                <h3 className="text-lg font-bold">{RC_MODULE.label}</h3>
                <p className="mt-1 text-sm text-muted-foreground leading-relaxed">
                  {RC_MODULE.description}: documentazione sanitaria fedele, spese mediche e struttura pronta per la visita.
                </p>
              </div>
              <div className="mt-auto flex items-center justify-end pt-2">
                <span className="flex items-center gap-1 text-sm font-medium text-primary opacity-70 transition-opacity group-hover:opacity-100">
                  Nuovo caso
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                </span>
              </div>
            </CardContent>
          </Card>
        </Link>
      </section>

      {/* Strumenti di analisi standalone */}
      {tools.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Strumenti di analisi
          </h2>
          <div className="grid gap-3 sm:grid-cols-3">
            {tools.map((tool) => (
              <Link key={tool.id} href={`/cases/new?module=${tool.id}`} className="group block">
                <Card className="h-full rounded-xl transition-all hover:border-primary/40 hover:shadow-md">
                  <CardContent className="flex h-full flex-col gap-2 p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted text-muted-foreground transition-colors group-hover:text-primary">
                        <FileText className="h-4 w-4" />
                      </div>
                      <Badge variant="secondary" className="text-[10px] font-medium">
                        {getElaborationCost(tool.pipelineMode)} crediti
                      </Badge>
                    </div>
                    <h3 className="text-sm font-semibold leading-snug">{tool.label}</h3>
                    <p className="text-xs text-muted-foreground leading-relaxed">{tool.description}</p>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </section>
      )}

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
                Non hai ancora elaborati. Crea il primo caso per iniziare!
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
