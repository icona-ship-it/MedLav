'use client';

import { useState, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import {
  ArrowLeft,
  ArrowRight,
  Loader2,
  Scale,
  Shield,
  HardHat,
  FileCheck,
  FileSearch,
  Search,
  BookOpen,
  Calculator,
  EyeOff,
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

// --- Category icon mapping ---

const CATEGORY_ICONS: Record<ModuleCategoryId, LucideIcon> = {
  1: Scale,        // Perizia ML
  2: Scale,        // CTU civile
  3: Shield,       // CTU previdenziale
  4: HardHat,      // CTU INAIL
  5: FileCheck,    // Parere pro veritate
  6: FileSearch,   // Parere scopo riserva
  7: Search,       // Analisi doc sanitari
  8: BookOpen,     // Analisi doc giudiziari
  9: Calculator,   // Analisi spese
  10: EyeOff,      // Anonimizzatore
};

// --- Helpers ---

function findModule(moduleId: string): ModuleDefinition | undefined {
  return MODULE_CATALOG.find((m) => m.id === moduleId);
}

function findCategory(categoryId: number): ModuleCategory | undefined {
  return MODULE_CATEGORIES.find((c) => c.id === categoryId);
}

// --- Component ---

export default function NewCasePage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const moduleId = searchParams.get('module');

  const moduleDef = moduleId ? findModule(moduleId) : undefined;
  const category = moduleDef ? findCategory(moduleDef.categoryId) : undefined;

  // No module param or invalid module → redirect to dashboard (module catalog)
  useEffect(() => {
    if (!moduleId || (moduleId && !moduleDef)) {
      router.replace('/');
    }
  }, [moduleId, moduleDef, router]);

  // Module-based flow
  if (moduleDef && category) {
    return <ModuleNewCase moduleDef={moduleDef} category={category} />;
  }

  // Show nothing while redirecting
  return null;
}

// ---------------------------------------------------------------------------
// Module-based "New Case" form
// ---------------------------------------------------------------------------

function ModuleNewCase({ moduleDef, category }: { moduleDef: ModuleDefinition; category: ModuleCategory }) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const CategoryIcon = CATEGORY_ICONS[category.id as ModuleCategoryId] ?? Scale;

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
    <div className="mx-auto max-w-lg space-y-8 py-4">
      {/* Back link */}
      <Link
        href="/"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Torna al catalogo
      </Link>

      {/* Hero section */}
      <div className="flex flex-col items-center text-center space-y-4">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
          <CategoryIcon className="h-8 w-8 text-primary" />
        </div>
        <Badge variant="secondary" className="text-xs font-normal">
          {category.label}
        </Badge>
        <h1 className="text-2xl font-bold tracking-tight">
          {moduleDef.label}
        </h1>
        <p className="text-muted-foreground text-sm leading-relaxed max-w-md">
          {moduleDef.description}
        </p>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="space-y-6">
        {error && (
          <div role="alert" className="rounded-lg bg-destructive/10 p-4 text-sm text-destructive">
            {error}
          </div>
        )}

        <Card className="rounded-xl">
          <CardContent className="p-8 space-y-6">
            {/* Section header */}
            <div className="space-y-1">
              <h2 className="text-base font-semibold">Informazioni caso</h2>
              <p className="text-xs text-muted-foreground">
                Facoltative. Puoi sempre aggiungerle in seguito.
              </p>
            </div>

            {/* Patient initials */}
            <div className="space-y-2">
              <Label htmlFor="patientInitials">Iniziali paziente</Label>
              <Input
                id="patientInitials"
                name="patientInitials"
                placeholder="es. M.R."
                maxLength={10}
              />
              <p className="text-xs text-muted-foreground">
                Per identificare il caso (es. M.R.)
              </p>
            </div>

            {/* Practice reference */}
            <div className="space-y-2">
              <Label htmlFor="practiceReference">Riferimento pratica</Label>
              <Input
                id="practiceReference"
                name="practiceReference"
                placeholder="es. RG 1234/2026"
                maxLength={100}
              />
              <p className="text-xs text-muted-foreground">
                Numero RG, pratica assicurativa, ecc.
              </p>
            </div>

            {/* Hidden fields */}
            <input type="hidden" name="moduleId" value={moduleDef.id} />
          </CardContent>
        </Card>

        {/* Divider */}
        <div className="border-t border-border" />

        {/* Submit area */}
        <div className="space-y-3">
          <Button
            type="submit"
            size="lg"
            disabled={isSubmitting}
            className="w-full py-6 text-base"
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
          <p className="text-center text-xs text-muted-foreground">
            Dopo la creazione potrai caricare i documenti
          </p>
        </div>
      </form>
    </div>
  );
}
