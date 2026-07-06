'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  ArrowLeft,
  ArrowRight,
  Loader2,
  Scale,
  Check,
} from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { createCase } from '../../actions';
import { MODULE_CATALOG, MODULE_CATEGORIES, RC_MODULE, type ModuleId } from '@/types/modules';

// rc-mvp + riesposizione strumenti (2026-07-06): la perizia RC resta il
// cavallo di battaglia; sotto "Strumenti di analisi" i 3 tool standalone
// (cronistoria, spese, anonimizzatore) per test e usi puntuali.
const MODULES_BY_CATEGORY = MODULE_CATEGORIES.map((cat) => ({
  category: cat,
  modules: MODULE_CATALOG.filter((m) => m.categoryId === cat.id && !m.hidden),
})).filter((g) => g.modules.length > 0);

export default function NewCasePage() {
  const searchParams = useSearchParams();
  // Pre-selezione dal link della dashboard (?module=...), validata contro il
  // catalogo — un valore sconosciuto ricade sulla perizia RC.
  const requestedModule = searchParams.get('module');
  const initialModuleId: ModuleId =
    MODULE_CATALOG.find((m) => m.id === requestedModule)?.id ?? RC_MODULE.id;

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedModuleId, setSelectedModuleId] = useState<ModuleId>(initialModuleId);

  const selectedModule = MODULE_CATALOG.find((m) => m.id === selectedModuleId) ?? RC_MODULE;

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
        href="/"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Torna indietro
      </Link>

      {/* Header */}
      <div>
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Scale className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Nuovo elaborato</h1>
            <p className="mt-1 text-muted-foreground">Scegli cosa creare, poi caricherai i documenti.</p>
          </div>
        </div>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="space-y-6">
        {error && (
          <div role="alert" className="rounded-lg bg-destructive/10 p-4 text-sm text-destructive">
            {error}
          </div>
        )}

        {/* Module selector */}
        {MODULES_BY_CATEGORY.map(({ category, modules }) => (
          <div key={category.id} className="space-y-3">
            <div className="space-y-0.5">
              <h2 className="text-sm font-semibold">{category.label}</h2>
              <p className="text-xs text-muted-foreground">{category.description}</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {modules.map((mod) => {
                const isSelected = mod.id === selectedModuleId;
                return (
                  <button
                    key={mod.id}
                    type="button"
                    onClick={() => setSelectedModuleId(mod.id)}
                    aria-pressed={isSelected}
                    className={`flex items-start gap-3 rounded-xl border p-4 text-left transition-colors ${
                      isSelected
                        ? 'border-primary ring-2 ring-primary/30 bg-primary/5'
                        : 'hover:border-primary/40 hover:bg-muted/40'
                    }`}
                  >
                    <div
                      className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${
                        isSelected ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/40'
                      }`}
                    >
                      {isSelected && <Check className="h-3 w-3" />}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">{mod.label}</span>
                        {mod.priority && (
                          <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                            Principale
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 text-xs text-muted-foreground">{mod.description}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        ))}

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

            <input type="hidden" name="moduleId" value={selectedModuleId} />
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
              Crea {selectedModule.priority ? 'perizia' : 'elaborato'}
              <ArrowRight className="ml-2 h-5 w-5" />
            </>
          )}
        </Button>
      </form>
    </div>
  );
}
