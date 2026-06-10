'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Scale, FileUp, FileText, ArrowRight, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';

const ONBOARDING_KEY = 'legmed-onboarding-completed';

const STEPS = [
  {
    icon: Scale,
    title: 'Benvenuto in LegMed',
    description: 'LegMed ti aiuta ad analizzare la documentazione clinica e a preparare elaborati medico-legali.',
    details: [
      'Analisi documentale: estrai la cronistoria degli eventi da qualsiasi documento',
      'Perizie e CTU: genera bozze di report strutturati per ogni tipo di incarico',
      'Conforme GDPR — dati crittografati, server EU',
    ],
  },
  {
    icon: FileUp,
    title: 'Come funziona',
    description: 'Tre passi semplici per ottenere il tuo elaborato.',
    details: [
      '1. Scegli il tipo di elaborato dalla dashboard',
      '2. Carica i documenti (PDF, immagini, Word)',
      '3. Avvia l\'elaborazione e attendi il risultato',
    ],
  },
  {
    icon: FileText,
    title: 'Pronto per iniziare',
    description: 'Dalla dashboard puoi scegliere tra diversi moduli in base al tipo di lavoro che devi fare.',
    details: [
      'Analisi documenti sanitari: cronistoria estrattiva dei fatti clinici',
      'Perizia medico legale: per privati, studi legali, assicurazioni',
      'CTU/ATP: in ambito civile, previdenziale o INAIL',
      'E molto altro: pareri, analisi spese, anonimizzazione',
      'Premendo il pulsante creiamo un caso dimostrativo con dati fittizi, per esplorare l\'app senza rischi.',
    ],
  },
];

export function OnboardingDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [isCreatingDemo, setIsCreatingDemo] = useState(false);

  useEffect(() => {
    // Show only if onboarding not completed
    const completed = localStorage.getItem(ONBOARDING_KEY);
    if (!completed) {
      // Small delay to not overwhelm on first load
      const timer = setTimeout(() => setOpen(true), 500);
      return () => clearTimeout(timer);
    }
  }, []);

  const handleCreateDemo = useCallback(async () => {
    setIsCreatingDemo(true);
    try {
      const response = await fetch('/api/demo', { method: 'POST' });
      const result = await response.json() as { success: boolean; data?: { caseId: string } };
      if (result.success) {
        toast.success('Caso demo creato! Esploralo nella dashboard.');
      }
    } catch {
      // Non-blocking — demo creation failure shouldn't block onboarding
    } finally {
      setIsCreatingDemo(false);
      localStorage.setItem(ONBOARDING_KEY, 'true');
      setOpen(false);
      router.refresh();
    }
  }, [router]);

  function handleNext() {
    if (step < STEPS.length - 1) {
      setStep(step + 1);
    } else {
      handleCreateDemo();
    }
  }

  function handleClose() {
    localStorage.setItem(ONBOARDING_KEY, 'true');
    setOpen(false);
  }

  const currentStep = STEPS[step];
  const Icon = currentStep.icon;
  const isLast = step === STEPS.length - 1;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <Icon className="h-6 w-6 text-primary" />
          </div>
          <DialogTitle className="text-center">{currentStep.title}</DialogTitle>
          <DialogDescription className="text-center">
            {currentStep.description}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2 py-2">
          {currentStep.details.map((detail, i) => (
            <div key={i} className="flex items-start gap-2 text-sm">
              <div className="mt-1.5 h-1.5 w-1.5 rounded-full bg-primary shrink-0" />
              <span>{detail}</span>
            </div>
          ))}
        </div>

        {/* Progress dots */}
        <div className="flex justify-center gap-1.5 py-2">
          {STEPS.map((_, i) => (
            <div
              key={i}
              className={`h-2 w-2 rounded-full transition-colors ${
                i === step ? 'bg-primary' : 'bg-muted'
              }`}
            />
          ))}
        </div>

        <div className="flex justify-between">
          <Button variant="ghost" size="sm" onClick={handleClose}>
            Salta
          </Button>
          <Button size="sm" onClick={handleNext} disabled={isCreatingDemo}>
            {isCreatingDemo ? (
              <><Loader2 className="mr-1 h-3 w-3 animate-spin" />Creazione demo...</>
            ) : isLast ? (
              <>Inizia con un esempio<ArrowRight className="ml-1 h-3 w-3" /></>
            ) : (
              <>Avanti<ArrowRight className="ml-1 h-3 w-3" /></>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
