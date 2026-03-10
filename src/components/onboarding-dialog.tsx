'use client';

import { useState, useEffect } from 'react';
import { Scale, FileUp, Brain, FileText, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';

const ONBOARDING_KEY = 'medlav-onboarding-completed';

const STEPS = [
  {
    icon: Scale,
    title: 'Benvenuto in MedLav',
    description: 'MedLav analizza la documentazione clinica e genera automaticamente report medico-legali strutturati per le tue perizie.',
    details: [
      'Supporta 10 tipologie di caso (ortopedica, oncologica, RC auto, ecc.)',
      'Report adattivo per ruolo: CTU, CTP o Stragiudiziale',
      'Conforme GDPR — dati crittografati, server EU',
    ],
  },
  {
    icon: FileUp,
    title: 'Come funziona',
    description: 'Il flusso è semplice: crea un caso, carica i documenti, avvia l\'elaborazione.',
    details: [
      '1. Crea un nuovo caso scegliendo tipo incarico e tipologia',
      '2. Carica PDF, immagini o DOCX (cartelle cliniche, referti, esami)',
      '3. Clicca "Avvia Elaborazione" e attendi il report',
      '4. Rivedi, modifica e esporta in HTML, DOCX o CSV',
    ],
  },
  {
    icon: Brain,
    title: 'Tipo Incarico — Fondamentale',
    description: 'Il tipo di incarico cambia radicalmente il tono e la prospettiva del report.',
    details: [
      'CTU (Consulente del Giudice): tono neutrale e imparziale, analizza pro e contro',
      'CTP (Consulente di Parte): tono assertivo a favore del paziente, enfatizza criticità',
      'Stragiudiziale: tono pragmatico, valuta i meriti reali e la fondatezza del caso',
    ],
  },
  {
    icon: FileText,
    title: 'Tipologia Caso — Guida l\'Analisi',
    description: 'La tipologia determina cosa l\'AI cerca nei documenti e come struttura il report.',
    details: [
      'Ortopedica: analisi intervento, complicanze, danno biologico',
      'Oncologica: timeline diagnostica, ritardo, perdita di chance',
      'Ostetrica: analisi CTG, travaglio, esiti neonatali',
      'RC Auto: dinamica sinistro, congruità lesioni',
      'Ogni tipo ha sezioni report, tempistiche e criteri specifici',
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

  function handleNext() {
    if (step < STEPS.length - 1) {
      setStep(step + 1);
    } else {
      handleClose();
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
          <Button size="sm" onClick={handleNext}>
            {isLast ? 'Inizia' : 'Avanti'}
            <ArrowRight className="ml-1 h-3 w-3" />
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
