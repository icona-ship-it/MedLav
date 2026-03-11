'use client';

import { useState } from 'react';
import { ArrowLeft, Scale, UserCheck, FileSearch, ChevronDown, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { createCase } from '../../actions';
import { CASE_TYPES as caseTypes } from '@/lib/constants';

// --- Role definitions with descriptions and icons ---

const ROLE_OPTIONS = [
  {
    value: 'ctu',
    label: 'CTU',
    subtitle: 'Consulente Tecnico d\'Ufficio',
    description: 'Tono neutrale e imparziale. Analizza elementi a favore e contro.',
    icon: Scale,
  },
  {
    value: 'ctp',
    label: 'CTP',
    subtitle: 'Consulente Tecnico di Parte',
    description: 'Tono assertivo pro-paziente. Enfatizza criticita e omissioni.',
    icon: UserCheck,
  },
  {
    value: 'stragiudiziale',
    label: 'Stragiudiziale',
    subtitle: 'Perito Stragiudiziale',
    description: 'Tono pragmatico. Valuta fondatezza del caso e rischi processuali.',
    icon: FileSearch,
  },
] as const;

// Split case types: common (first 7) vs other (rest)
const COMMON_CASE_TYPES = caseTypes.slice(0, 7);
const OTHER_CASE_TYPES = caseTypes.slice(7);

// --- Component ---

export default function NewCasePage() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedRole, setSelectedRole] = useState<string>('ctu');
  const [selectedTypes, setSelectedTypes] = useState<string[]>(['generica']);
  const [detailsOpen, setDetailsOpen] = useState(false);

  function toggleType(value: string) {
    setSelectedTypes(prev => {
      if (prev.includes(value)) {
        if (prev.length === 1) return prev;
        return prev.filter(v => v !== value);
      }
      if (prev.length >= 3) return prev;
      return [...prev, value];
    });
  }

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
            Seleziona il tipo di incarico e la tipologia del caso
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-8">
        {error && (
          <div role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        )}

        <Card>
          <CardContent className="pt-6 space-y-8">
            {/* Step 1: Role selection — 3 big clickable cards */}
            <div className="space-y-3">
              <h2 className="text-lg font-semibold">Tipo di incarico</h2>
              <div className="grid gap-3 sm:grid-cols-3">
                {ROLE_OPTIONS.map((role) => {
                  const Icon = role.icon;
                  const isSelected = selectedRole === role.value;
                  return (
                    <button
                      key={role.value}
                      type="button"
                      onClick={() => setSelectedRole(role.value)}
                      className={`relative flex flex-col items-center gap-2 rounded-lg border-2 p-4 text-center transition-all ${
                        isSelected
                          ? 'border-primary bg-primary/5 ring-1 ring-primary'
                          : 'border-muted hover:border-primary/40 hover:bg-muted/50'
                      }`}
                    >
                      <Icon className={`h-8 w-8 ${isSelected ? 'text-primary' : 'text-muted-foreground'}`} />
                      <div>
                        <p className="text-base font-semibold">{role.label}</p>
                        <p className="text-xs text-muted-foreground">{role.subtitle}</p>
                      </div>
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        {role.description}
                      </p>
                    </button>
                  );
                })}
              </div>
              {/* Hidden input for form submission */}
              <input type="hidden" name="caseRole" value={selectedRole} />
            </div>

            {/* Step 2: Case type selection */}
            <div className="space-y-3">
              <div className="flex items-baseline gap-2">
                <h2 className="text-lg font-semibold">Tipologia caso</h2>
                <span className="text-xs text-muted-foreground">
                  ({selectedTypes.length}/3 selezionati)
                </span>
              </div>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {COMMON_CASE_TYPES.map((type) => {
                  const isChecked = selectedTypes.includes(type.value);
                  const isDisabled = !isChecked && selectedTypes.length >= 3;
                  return (
                    <label
                      key={type.value}
                      className={`flex items-center gap-2 rounded-lg border px-3 py-2.5 text-sm cursor-pointer transition-all ${
                        isChecked
                          ? 'border-primary bg-primary/5 font-medium'
                          : isDisabled
                            ? 'opacity-50 cursor-not-allowed border-muted'
                            : 'border-muted hover:border-primary/40 hover:bg-muted/50'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        disabled={isDisabled}
                        onChange={() => toggleType(type.value)}
                        className="h-4 w-4 rounded border-gray-300 accent-primary"
                      />
                      <span>{type.label}</span>
                      {selectedTypes[0] === type.value && selectedTypes.length > 1 && (
                        <span className="ml-auto text-xs text-primary">(principale)</span>
                      )}
                    </label>
                  );
                })}
              </div>

              {/* Other case types — collapsible */}
              {OTHER_CASE_TYPES.length > 0 && (
                <Collapsible>
                  <CollapsibleTrigger className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors">
                    <ChevronDown className="h-4 w-4" />
                    Altre tipologie
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 mt-2">
                      {OTHER_CASE_TYPES.map((type) => {
                        const isChecked = selectedTypes.includes(type.value);
                        const isDisabled = !isChecked && selectedTypes.length >= 3;
                        return (
                          <label
                            key={type.value}
                            className={`flex items-center gap-2 rounded-lg border px-3 py-2.5 text-sm cursor-pointer transition-all ${
                              isChecked
                                ? 'border-primary bg-primary/5 font-medium'
                                : isDisabled
                                  ? 'opacity-50 cursor-not-allowed border-muted'
                                  : 'border-muted hover:border-primary/40 hover:bg-muted/50'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={isChecked}
                              disabled={isDisabled}
                              onChange={() => toggleType(type.value)}
                              className="h-4 w-4 rounded border-gray-300 accent-primary"
                            />
                            <span>{type.label}</span>
                            {selectedTypes[0] === type.value && selectedTypes.length > 1 && (
                              <span className="ml-auto text-xs text-primary">(principale)</span>
                            )}
                          </label>
                        );
                      })}
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              )}

              {/* Hidden inputs for form submission */}
              <input type="hidden" name="caseType" value={selectedTypes[0]} />
              <input type="hidden" name="caseTypes" value={JSON.stringify(selectedTypes)} />
            </div>

            {/* Collapsible: Dettagli aggiuntivi */}
            <Collapsible open={detailsOpen} onOpenChange={setDetailsOpen}>
              <CollapsibleTrigger className="flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
                <ChevronDown className={`h-4 w-4 transition-transform ${detailsOpen ? 'rotate-180' : ''}`} />
                Dettagli aggiuntivi (opzionale)
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="mt-3 space-y-4 rounded-lg border border-muted p-4">
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
                      placeholder="Eventuali note o appunti sul caso"
                      className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    />
                  </div>
                </div>
              </CollapsibleContent>
            </Collapsible>
          </CardContent>
        </Card>

        {/* Submit */}
        <div className="flex items-center gap-4">
          <Button variant="outline" asChild>
            <Link href="/">Annulla</Link>
          </Button>
          <Button
            type="submit"
            size="lg"
            disabled={isSubmitting}
            className="flex-1 py-6 text-base bg-green-600 hover:bg-green-700 text-white"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                Creazione in corso...
              </>
            ) : (
              'Crea Caso'
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}
