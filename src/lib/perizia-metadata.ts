/**
 * Letture pure dei metadati perizia usate dalla UI (audit 2026-09-10, R5):
 * il nome del perito è obbligatorio per l'export della perizia, ma il medico
 * lo scopriva solo al momento dell'export.
 */
export function hasPeritoName(periziaMetadata: Record<string, unknown> | null | undefined): boolean {
  const name = periziaMetadata?.ctuName;
  return typeof name === 'string' && name.trim().length > 0;
}
