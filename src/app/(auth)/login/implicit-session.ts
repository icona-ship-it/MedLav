/**
 * Sessione arrivata nel FRAGMENT dell'URL (flusso implicito di GoTrue:
 * `#access_token=…&refresh_token=…&type=magiclink`). Succede con i magic link
 * generati senza PKCE (es. strumento di supporto): il server non vede mai il
 * fragment, quindi la pagina di login deve raccoglierlo e impostare la sessione
 * (audit 2026-09-10, reperto R1). Parser puro, testabile.
 */

export interface ImplicitSessionTokens {
  accessToken: string;
  refreshToken: string;
}

export function parseImplicitSessionHash(hash: string | null | undefined): ImplicitSessionTokens | null {
  if (!hash) return null;
  const raw = hash.startsWith('#') ? hash.slice(1) : hash;
  if (!raw.includes('access_token=')) return null;
  const params = new URLSearchParams(raw);
  const accessToken = params.get('access_token');
  const refreshToken = params.get('refresh_token');
  if (!accessToken || !refreshToken) return null;
  // I token JWT/refresh non contengono spazi o caratteri di controllo.
  if (/\s/.test(accessToken) || /\s/.test(refreshToken)) return null;
  return { accessToken, refreshToken };
}
