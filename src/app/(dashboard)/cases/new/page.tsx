'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  ArrowLeft,
  ArrowRight,
  Loader2,
  Scale,
  Shield,
  HardHat,
  FileSearch,
  Search,
  BookOpen,
  Calculator,
  EyeOff,
  Briefcase,
  Gavel,
} from 'lucide-react';
import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { createCase } from '../../actions';
import {
  MODULE_CATALOG,
  MODULE_CATEGORIES,
} from '@/lib/constants';
import type { ModuleDefinition, ModuleCategory, ModuleCategoryId } from '@/types/modules';
import { getElaborationCost } from '@/services/credits/credit-costs';

// --- Category icon mapping ---

const CATEGORY_ICONS: Record<ModuleCategoryId, LucideIcon> = {
  1: Scale,
  2: Gavel,
  3: Shield,
  4: HardHat,
  5: BookOpen,
  6: FileSearch,
  7: Search,
  8: Briefcase,
  9: Calculator,
  10: EyeOff,
};

// --- Helpers ---

function findModule(moduleId: string): ModuleDefinition | undefined {
  return MODULE_CATALOG.find((m) => m.id === moduleId);
}

function findCategory(categoryId: number): ModuleCategory | undefined {
  return MODULE_CATEGORIES.find((c) => c.id === categoryId);
}

function getModulesForCategory(categoryId: number): ModuleDefinition[] {
  return MODULE_CATALOG.filter((m) => m.categoryId === categoryId);
}

// --- Component ---

export default function NewCasePage() {
  const searchParams = useSearchParams();
  const moduleId = searchParams.get('module');
  const categoryId = searchParams.get('category');

  const moduleDef = moduleId ? findModule(moduleId) : undefined;
  const category = moduleDef
    ? findCategory(moduleDef.categoryId)
    : categoryId
      ? findCategory(parseInt(categoryId, 10))
      : undefined;

  // Category picker: user clicked a multi-module category from dashboard
  if (!moduleId && category) {
    const modules = getModulesForCategory(category.id);
    if (modules.length === 1) {
      // Single module — go straight to creation form
      return <ModuleNewCase moduleDef={modules[0]} category={category} />;
    }
    return <CategoryPicker category={category} modules={modules} />;
  }

  // Module creation form
  if (moduleDef && category) {
    return <ModuleNewCase moduleDef={moduleDef} category={category} />;
  }

  // No valid param → show redirect link (useEffect cannot be conditional)
  return (
    <div className="flex items-center justify-center py-20">
      <p className="text-muted-foreground">
        Nessun modulo selezionato. <Link href="/" className="text-primary underline">Torna alla dashboard</Link>
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Category picker — choose sub-type within a category
// ---------------------------------------------------------------------------

function CategoryPicker({ category, modules }: { category: ModuleCategory; modules: ModuleDefinition[] }) {
  const CategoryIcon = CATEGORY_ICONS[category.id as ModuleCategoryId] ?? Scale;

  return (
    <div className="space-y-8">
      {/* Back */}
      <Link
        href="/"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Torna indietro
      </Link>

      {/* Header — same style as dashboard */}
      <div>
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <CategoryIcon className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">{category.label}</h1>
            <p className="mt-1 text-muted-foreground">{category.description}</p>
          </div>
        </div>
      </div>

      {/* Sub-type prompt */}
      <p className="text-muted-foreground">
        Scegli il tipo di elaborato che vuoi creare.
      </p>

      {/* Sub-type cards — same card style as dashboard priority cards */}
      <div className="grid gap-4 sm:grid-cols-2">
        {modules.map((mod) => (
          <Link
            key={mod.id}
            href={`/cases/new?module=${mod.id}`}
            className="group block"
          >
            <Card className="h-full rounded-2xl border-primary/20 bg-primary/5 dark:bg-primary/10 transition-all hover:border-primary/40 hover:shadow-lg">
              <CardContent className="flex flex-col gap-3 p-6">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="text-lg font-bold">{mod.label}</h3>
                    <p className="mt-1 text-sm text-muted-foreground leading-relaxed">
                      {mod.description}
                    </p>
                  </div>
                  <Badge variant="secondary" className="shrink-0 text-xs font-semibold">
                    {getElaborationCost(mod.pipelineMode)} crediti
                  </Badge>
                </div>
                <div className="mt-auto flex items-center justify-end pt-2">
                  <span className="flex items-center gap-1 text-sm font-medium text-primary opacity-70 transition-opacity group-hover:opacity-100">
                    Inizia
                    <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                  </span>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Module creation form
// ---------------------------------------------------------------------------

function ModuleNewCase({ moduleDef, category }: { moduleDef: ModuleDefinition; category: ModuleCategory }) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const CategoryIcon = CATEGORY_ICONS[category.id as ModuleCategoryId] ?? Scale;
  const modules = getModulesForCategory(category.id);
  const backHref = modules.length > 1 ? `/cases/new?category=${category.id}` : '/';

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      const formData = new FormData(e.currentTarget);
      const result = await createCase(formData);

      if (result?.error) {
        setError(result.error);
        setIsSubmitting(false);
      }
    } catch (err) {
      if (err instanceof Error && 'digest' in err) throw err;
      setError('Errore di rete. Verifica la connessione e riprova.');
      setIsSubmitting(false);
    }
  }

  return (
    <div className="space-y-8">
      {/* Back link */}
      <Link
        href={backHref}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Torna indietro
      </Link>

      {/* Header — same style as dashboard and category picker */}
      <div>
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <CategoryIcon className="h-6 w-6" />
          </div>
          <div>
            <Badge variant="secondary" className="text-xs font-normal mb-1">
              {category.label}
            </Badge>
            <h1 className="text-3xl font-bold tracking-tight">{moduleDef.label}</h1>
            <p className="mt-1 text-muted-foreground">{moduleDef.description}</p>
          </div>
        </div>
        <p className="mt-4 text-sm text-muted-foreground">
          Dopo la creazione potrai caricare i documenti e avviare l&apos;elaborazione.
        </p>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="space-y-6">
        {error && (
          <div role="alert" className="rounded-lg bg-destructive/10 p-4 text-sm text-destructive">
            {error}
          </div>
        )}

        <Card className="rounded-2xl">
          <CardContent className="p-6 sm:p-8 space-y-5">
            <div className="space-y-1">
              <h2 className="text-base font-semibold">Informazioni caso</h2>
              <p className="text-xs text-muted-foreground">
                Facoltative — puoi sempre aggiungerle dopo.
              </p>
            </div>

            <div className="grid gap-5 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="patientInitials">Iniziali paziente</Label>
                <Input
                  id="patientInitials"
                  name="patientInitials"
                  placeholder="es. M.R."
                  maxLength={10}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="practiceReference">Riferimento pratica</Label>
                <Input
                  id="practiceReference"
                  name="practiceReference"
                  placeholder="es. RG 1234/2026"
                  maxLength={100}
                />
              </div>
            </div>

            <input type="hidden" name="moduleId" value={moduleDef.id} />
          </CardContent>
        </Card>

        <Button
          type="submit"
          size="lg"
          disabled={isSubmitting}
          className="w-full sm:w-auto px-12 py-6 text-base"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              Creazione in corso...
            </>
          ) : (
            <>
              Crea elaborato
              <ArrowRight className="ml-2 h-5 w-5" />
            </>
          )}
        </Button>
      </form>
    </div>
  );
}
