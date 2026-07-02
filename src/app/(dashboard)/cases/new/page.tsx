'use client';

import { useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Loader2,
  Scale,
} from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { createCase } from '../../actions';
import { MODULE_CATALOG, MODULE_CATEGORIES } from '@/lib/constants';

// rc-mvp: niente picker per categoria/modulo — l'MVP crea SOLO la perizia RC
// stragiudiziale. Il vecchio CategoryPicker vive su main e nel tag
// full-app-2026-07-02.
const RC_MODULE = MODULE_CATALOG[0];
const RC_CATEGORY = MODULE_CATEGORIES[0];

export default function NewCasePage() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

      {/* Header — same style as dashboard */}
      <div>
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Scale className="h-6 w-6" />
          </div>
          <div>
            <Badge variant="secondary" className="text-xs font-normal mb-1">
              {RC_CATEGORY.label}
            </Badge>
            <h1 className="text-3xl font-bold tracking-tight">{RC_MODULE.label}</h1>
            <p className="mt-1 text-muted-foreground">{RC_MODULE.description}</p>
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

            <input type="hidden" name="moduleId" value={RC_MODULE.id} />
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
