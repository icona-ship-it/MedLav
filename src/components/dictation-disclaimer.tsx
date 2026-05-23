'use client';

/**
 * First-use disclaimer modal for the dictation feature.
 *
 * Shown the first time a user clicks the microphone in this browser.
 * Acceptance is persisted in localStorage so the modal does not block
 * subsequent dictations.
 */

import { useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

const STORAGE_KEY = 'legmed.dictationDisclaimerAccepted';

export function hasAcceptedDictationDisclaimer(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

export function markDictationDisclaimerAccepted(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, '1');
  } catch {
    // ignore — disclaimer will re-show next time
  }
}

interface DictationDisclaimerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAccept: () => void;
}

export function DictationDisclaimer({ open, onOpenChange, onAccept }: DictationDisclaimerProps) {
  const handleAccept = useCallback(() => {
    markDictationDisclaimerAccepted();
    onAccept();
  }, [onAccept]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Dettatura vocale</DialogTitle>
          <DialogDescription>
            Prima di iniziare, leggi questa nota.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 text-sm text-muted-foreground">
          <p>
            La dettatura usa il modello <strong>Voxtral</strong> di Mistral AI (server in
            Unione Europea). L&apos;audio della tua registrazione viene inoltrato a Mistral
            solo per la trascrizione automatica e <strong>non viene conservato</strong> da
            LegMed né da Mistral dopo l&apos;elaborazione.
          </p>
          <p>
            Per ridurre il rischio sui dati sanitari (GDPR art. 9), evita quando possibile
            di pronunciare ad alta voce <strong>nome e cognome del paziente</strong>,
            <strong> codice fiscale</strong> o altri identificatori diretti.
          </p>
          <p>
            Il testo trascritto compare nel campo che hai aperto. Lo salverai tu, come
            qualunque altro testo che scrivi nel report.
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Annulla
          </Button>
          <Button onClick={handleAccept}>
            Ho capito, avvia dettatura
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
