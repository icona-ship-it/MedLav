'use client';

import { useState, useCallback, useSyncExternalStore } from 'react';
import { Button } from '@/components/ui/button';

const CONSENT_KEY = 'medlav-cookie-consent';

function getConsentSnapshot(): string | null {
  if (typeof window === 'undefined') return 'unknown';
  return localStorage.getItem(CONSENT_KEY);
}

function getServerSnapshot(): string | null {
  return 'unknown';
}

function subscribeToConsent(callback: () => void): () => void {
  window.addEventListener('storage', callback);
  return () => window.removeEventListener('storage', callback);
}

/**
 * GDPR Cookie Consent Banner.
 * Shows once, saves preference to localStorage.
 */
export function CookieConsent() {
  const consent = useSyncExternalStore(subscribeToConsent, getConsentSnapshot, getServerSnapshot);
  const [dismissed, setDismissed] = useState(false);
  const visible = !consent && !dismissed;

  const handleAccept = useCallback(() => {
    localStorage.setItem(CONSENT_KEY, 'accepted');
    setDismissed(true);
  }, []);

  const handleReject = useCallback(() => {
    localStorage.setItem(CONSENT_KEY, 'rejected');
    setDismissed(true);
  }, []);

  if (!visible) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 border-t bg-background p-4 shadow-lg">
      <div className="mx-auto flex max-w-4xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          Questo sito utilizza cookie tecnici necessari al funzionamento del servizio.
          Non utilizziamo cookie di profilazione. I tuoi dati sanitari sono trattati in conformità al GDPR (Art. 9).
        </p>
        <div className="flex gap-2 shrink-0">
          <Button variant="outline" size="sm" onClick={handleReject}>
            Rifiuta
          </Button>
          <Button size="sm" onClick={handleAccept}>
            Accetta
          </Button>
        </div>
      </div>
    </div>
  );
}
