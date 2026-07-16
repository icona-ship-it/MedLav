/**
 * Notifica la CreditBadge di ri-leggere il saldo dopo una spesa/rimborso nella
 * stessa scheda (audit 2026-07-16). La badge ascolta l'evento window.
 */
export function notifyCreditsChanged(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('legmed:credits-changed'));
  }
}
