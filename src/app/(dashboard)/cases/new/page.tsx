'use client';

import { useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { createCase } from '../../actions';

const caseTypes = [
  { value: 'ortopedica', label: 'Malasanita Ortopedica' },
  { value: 'oncologica', label: 'Ritardo Diagnostico Oncologico' },
  { value: 'ostetrica', label: 'Errore Ostetrico' },
  { value: 'anestesiologica', label: 'Errore Anestesiologico' },
  { value: 'infezione_nosocomiale', label: 'Infezione Nosocomiale' },
  { value: 'errore_diagnostico', label: 'Errore Diagnostico' },
  { value: 'generica', label: 'Responsabilita Professionale Generica' },
];

const caseRoles = [
  { value: 'ctu', label: 'CTU - Consulente Tecnico d\'Ufficio' },
  { value: 'ctp', label: 'CTP - Consulente Tecnico di Parte' },
  { value: 'stragiudiziale', label: 'Perito Stragiudiziale' },
];

export default function NewCasePage() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    const formData = new FormData(e.currentTarget);

    // Step 1: Create the case
    const result = await createCase(formData);

    // If redirect happened (success), we won't reach here.
    // If error, show it.
    if (result?.error) {
      setError(result.error);
      setIsSubmitting(false);
    }

    // Note: files are uploaded on the case detail page after creation
    // This keeps the flow simple: create case → redirect → upload on detail page
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Nuovo Caso</h1>
          <p className="text-muted-foreground">
            Crea un nuovo caso medico-legale
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {error && (
          <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        )}

        {/* Case Info */}
        <Card>
          <CardHeader>
            <CardTitle>Informazioni Caso</CardTitle>
            <CardDescription>
              Dati identificativi del caso
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <label htmlFor="caseRole" className="text-sm font-medium">
                  Tipo Incarico *
                </label>
                <select
                  id="caseRole"
                  name="caseRole"
                  required
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  {caseRoles.map((role) => (
                    <option key={role.value} value={role.value}>
                      {role.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <label htmlFor="caseType" className="text-sm font-medium">
                  Tipologia Caso *
                </label>
                <select
                  id="caseType"
                  name="caseType"
                  required
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  {caseTypes.map((type) => (
                    <option key={type.value} value={type.value}>
                      {type.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <label htmlFor="patientInitials" className="text-sm font-medium">
                  Iniziali Paziente
                </label>
                <Input
                  id="patientInitials"
                  name="patientInitials"
                  placeholder="es. M.R."
                  maxLength={10}
                />
              </div>
              <div className="space-y-2">
                <label htmlFor="practiceReference" className="text-sm font-medium">
                  Riferimento Pratica
                </label>
                <Input
                  id="practiceReference"
                  name="practiceReference"
                  placeholder="es. RG 1234/2026"
                />
              </div>
            </div>
            <div className="space-y-2">
              <label htmlFor="notes" className="text-sm font-medium">
                Note
              </label>
              <textarea
                id="notes"
                name="notes"
                rows={3}
                placeholder="Note aggiuntive sul caso..."
                className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              />
            </div>
          </CardContent>
        </Card>

        {/* Submit */}
        <div className="flex justify-end gap-4">
          <Button variant="outline" asChild>
            <Link href="/">Annulla</Link>
          </Button>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Creazione in corso...' : 'Crea Caso'}
          </Button>
        </div>
      </form>
    </div>
  );
}
