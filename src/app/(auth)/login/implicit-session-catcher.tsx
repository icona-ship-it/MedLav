'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { parseImplicitSessionHash } from './implicit-session';

/**
 * Se la pagina di login riceve una sessione nel fragment (magic link in flusso
 * implicito), la imposta e porta l'utente in app: senza questo il link VALIDO
 * finiva su «link non più valido» (audit 2026-09-10, R1). Non rende nulla.
 */
export function ImplicitSessionCatcher() {
  const router = useRouter();
  useEffect(() => {
    const tokens = parseImplicitSessionHash(window.location.hash);
    if (!tokens) return;
    let cancelled = false;
    void createClient().auth
      .setSession({ access_token: tokens.accessToken, refresh_token: tokens.refreshToken })
      .then(({ error }) => {
        if (cancelled) return;
        // Il fragment non deve restare nella cronologia del browser.
        window.history.replaceState(null, '', window.location.pathname);
        if (!error) router.replace('/');
      });
    return () => { cancelled = true; };
  }, [router]);
  return null;
}
