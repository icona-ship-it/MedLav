'use client';

import { useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { createCase } from '../../actions';
import { CASE_TYPES as caseTypes, CASE_ROLES as caseRoles } from '@/lib/constants';
import { InfoTooltip } from '@/components/info-tooltip';

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

      // If redirect happened (success), we won't reach here.
      // If error, show it.
      if (result?.error) {
        setError(result.error);
        setIsSubmitting(false);
      }
    } catch (err) {
      // Re-throw Next.js redirect errors (not actual errors)
      if (err instanceof Error && 'digest' in err) throw err;
      setError('Errore di rete. Verifica la connessione e riprova.');
      setIsSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild aria-label="Torna alla dashboard">
          <Link href="/">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Nuovo Caso</h1>
          <p className="text-muted-foreground">
            Inserisci i dati base. Potrai caricare i documenti subito dopo.
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {error && (
          <div role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
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
                <label htmlFor="caseRole" className="text-sm font-medium inline-flex items-center">
                  Tipo Incarico *
                  <InfoTooltip title="Tipo Incarico">
                    <p>Determina il <strong>tono e la prospettiva</strong> del report generato:</p>
                    <p><strong>CTU</strong> — Consulente del Giudice. Tono neutrale e imparziale: analizza sia gli elementi a favore che contro la responsabilità sanitaria.</p>
                    <p><strong>CTP</strong> — Consulente di Parte. Tono assertivo a favore del paziente: enfatizza criticità, omissioni e ritardi nella gestione clinica.</p>
                    <p><strong>Stragiudiziale</strong> — Valutazione di merito. Tono pragmatico: valuta onestamente la fondatezza del caso e i rischi processuali.</p>
                  </InfoTooltip>
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
                <label htmlFor="caseType" className="text-sm font-medium inline-flex items-center">
                  Tipologia Caso *
                  <InfoTooltip title="Tipologia Caso">
                    <p>Determina <strong>cosa l&apos;AI cerca</strong> nei documenti e la <strong>struttura del report</strong>:</p>
                    <p><strong>Ortopedica</strong> — Analisi intervento chirurgico, complicanze, danno biologico</p>
                    <p><strong>Oncologica</strong> — Timeline diagnostica, analisi ritardo, perdita di chance</p>
                    <p><strong>Ostetrica</strong> — Analisi travaglio/CTG, esiti neonatali</p>
                    <p><strong>Anestesiologica</strong> — Valutazione preoperatoria, gestione anestesiologica</p>
                    <p><strong>Infezione Nosocomiale</strong> — Analisi infettiva, antibioticoterapia</p>
                    <p><strong>Errore Diagnostico</strong> — Percorso diagnostico, analisi errore</p>
                    <p><strong>RC Auto</strong> — Dinamica sinistro, congruità lesioni</p>
                    <p><strong>Previdenziale</strong> — Quadro clinico, capacità lavorativa</p>
                    <p><strong>Infortuni</strong> — Dinamica infortunio, nesso lavorativo</p>
                    <p><strong>Generica</strong> — Analisi senza focus specifico</p>
                  </InfoTooltip>
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
                  placeholder="es. M.R. (facoltativo)"
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
                  placeholder="es. RG 1234/2026 (facoltativo)"
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
                placeholder="Eventuali note o appunti sul caso (facoltativo)"
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
