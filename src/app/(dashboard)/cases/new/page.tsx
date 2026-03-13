'use client';

import { useState } from 'react';
import { ArrowLeft, Scale, UserCheck, FileSearch, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { createCase } from '../../actions';
import { CASE_TYPES as caseTypes } from '@/lib/constants';

// --- Role definitions ---

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

// --- Component ---

export default function NewCasePage() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedRole, setSelectedRole] = useState<string>('ctu');
  const [selectedTypes, setSelectedTypes] = useState<string[]>([]);

  function toggleType(value: string) {
    setSelectedTypes(prev => {
      if (prev.includes(value)) {
        return prev.filter(v => v !== value);
      }
      if (prev.length >= 7) return prev;
      return [...prev, value];
    });
  }

  const canSubmit = selectedTypes.length > 0 && !isSubmitting;

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (selectedTypes.length === 0) {
      setError('Seleziona almeno una tipologia di caso');
      return;
    }
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
            {/* Tipo di incarico — 3 big clickable cards */}
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
              <input type="hidden" name="caseRole" value={selectedRole} />
            </div>

            {/* Tipologia caso — tutte visibili, nessuna pre-selezionata */}
            <div className="space-y-3">
              <div className="flex items-baseline gap-2">
                <h2 className="text-lg font-semibold">Tipologia caso</h2>
                <span className="text-xs text-muted-foreground">
                  {selectedTypes.length === 0
                    ? 'Seleziona almeno 1 (max 7)'
                    : `${selectedTypes.length}/7 selezionati`}
                </span>
              </div>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {caseTypes.map((type) => {
                  const isChecked = selectedTypes.includes(type.value);
                  const isDisabled = !isChecked && selectedTypes.length >= 7;
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
              <input type="hidden" name="caseType" value={selectedTypes[0] ?? 'generica'} />
              <input type="hidden" name="caseTypes" value={JSON.stringify(selectedTypes.length > 0 ? selectedTypes : ['generica'])} />
            </div>
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
            disabled={!canSubmit}
            className="flex-1 py-6 text-base bg-green-600 hover:bg-green-700 text-white disabled:opacity-50"
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
