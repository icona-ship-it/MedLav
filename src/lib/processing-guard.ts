import { NextResponse } from 'next/server';

/**
 * Kill-switch operativo condiviso.
 *
 * PROCESSING_PAUSED=true (env var su Vercel, flip senza redeploy) ferma l'avvio di
 * QUALSIASI nuova elaborazione — start, retry, regenerate, regenerate-section,
 * classify-batch — durante un incidente Mistral/DB o una manutenzione, senza
 * toccare i run già in corso. Prima era gated solo su /start: le altre rotte di
 * innesco restavano attive durante un incidente.
 *
 * Ritorna una 503 pronta da restituire, oppure null se l'elaborazione è attiva.
 */
export function processingPausedResponse(): NextResponse | null {
  if (process.env.PROCESSING_PAUSED === 'true') {
    return NextResponse.json(
      { success: false, error: 'Elaborazione temporaneamente sospesa per manutenzione. Riprova tra poco.' },
      { status: 503 },
    );
  }
  return null;
}
