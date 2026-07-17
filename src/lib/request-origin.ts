/**
 * Deriva l'origine (proto://host) della richiesta corrente dagli header,
 * per costruire URL di redirect assoluti (es. link email Supabase) che
 * puntino al dominio su cui l'utente sta realmente navigando.
 *
 * Priorità: x-forwarded-host (Vercel/proxy) → host → NEXT_PUBLIC_SITE_URL →
 * localhost (solo sviluppo). Gli header forwarded possono essere liste
 * separate da virgola: vale il primo valore (il proxy più esterno).
 */
interface HeaderReader {
  get(name: string): string | null;
}

function firstHeaderValue(headers: HeaderReader, name: string): string | null {
  const raw = headers.get(name);
  if (!raw) {
    return null;
  }
  const first = raw.split(',')[0]?.trim();
  return first || null;
}

function isLocalHost(host: string): boolean {
  return host.startsWith('localhost') || host.startsWith('127.');
}

export function resolveRequestOrigin(
  headers: HeaderReader,
  envSiteUrl: string | undefined,
): string {
  const host = firstHeaderValue(headers, 'x-forwarded-host') ?? firstHeaderValue(headers, 'host');
  if (host) {
    const proto = firstHeaderValue(headers, 'x-forwarded-proto') ?? (isLocalHost(host) ? 'http' : 'https');
    return `${proto}://${host}`;
  }
  return envSiteUrl || 'http://localhost:3000';
}
