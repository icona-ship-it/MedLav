'use client';

import { useState, useEffect } from 'react';
import { Scale, FileUp, FileText, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';

const ONBOARDING_KEY = 'legmed-onboarding-completed';

const STEPS = [
  {
    icon: Scale,
    title: 'Benvenuto in LegMed',
    description: 'LegMed ti aiuta ad analizzare la documentazione clinica e a preparare la perizia medico-legale.',
    details: [
      'Analisi documentale: estrai la cronistoria degli eventi da qualsiasi documento',
      'Perizia RC stragiudiziale: genera una bozza strutturata con documentazione sanitaria e spese',
      'Conforme GDPR — dati crittografati, server EU',
    ],
  },
  {
    icon: FileUp,
    title: 'Come funziona',
    description: 'Tre passi semplici per ottenere la tua bozza di perizia.',
    details: [
      '1. Crea un nuovo caso dalla dashboard',
      '2. Carica i documenti (PDF, immagini, Word)',
      '3. Avvia l\'elaborazione e attendi il risultato',
    ],
  },
  {
    icon: FileText,
    title: 'Pronto per iniziare',
    description: 'La bozza riproduce fedelmente la documentazione; visita clinica e giudizi restano al perito.',
    details: [
      'Documentazione sanitaria: citazioni testuali fedeli dai documenti, in ordine cronologico',
      'Spese mediche: tabella deterministica dai giustificativi',
      'Esporta in Word (anche in versione anonimizzata) e rifinisci il testo direttamente nell\'editor',
    ],
  },
];

export function OnboardingDialog() {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    // Show only if onboarding not completed
    const completed = localStorage.getItem(ONBOARDING_KEY);
    if (!completed) {
      // Small delay to not overwhelm on first load
      const timer = setTimeout(() => setOpen(true), 500);
      return () => clearTimeout(timer);
    }
  }, []);

  function handleClose() {
    localStorage.setItem(ONBOARDING_KEY, 'true');
    setOpen(false);
  }

  function handleNext() {
    if (step < STEPS.length - 1) {
      setStep(step + 1);
    } else {
      handleClose();
    }
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

        <div className="flex items-center justify-between">
          <Button variant="ghost" size="sm" onClick={handleClose}>
            Salta
          </Button>
          <div className="flex items-center gap-2">
            {step > 0 && (
              <Button variant="ghost" size="sm" onClick={() => setStep((s) => Math.max(0, s - 1))}>
                Indietro
              </Button>
            )}
            <Button size="sm" onClick={handleNext}>
              {isLast ? (
                <>Inizia<ArrowRight className="ml-1 h-3 w-3" /></>
              ) : (
                <>Avanti<ArrowRight className="ml-1 h-3 w-3" /></>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
