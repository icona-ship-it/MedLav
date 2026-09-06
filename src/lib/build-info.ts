/**
 * Versione dell'app visibile (ciclo di consegna, 2026-09-04): sha e data di
 * build esposti in /api/health e nel footer, e avviso "rielabora" sui casi
 * elaborati con una build precedente. Le variabili NEXT_PUBLIC_BUILD_* sono
 * iniettate a build time da next.config.ts (Vercel: VERCEL_GIT_COMMIT_SHA).
 */

export const BUILD_SHA: string | undefined = process.env.NEXT_PUBLIC_BUILD_SHA || undefined;
export const BUILD_TIME: string | undefined = process.env.NEXT_PUBLIC_BUILD_TIME || undefined;

/**
 * Data dell'ULTIMO cambiamento che altera i risultati di un'analisi (prompt,
 * estrazione, calcoli, tabelle). Va aggiornata A MANO nel commit che cambia
 * l'output: l'avviso "riavvia l'analisi" si basa su questa, NON sulla data di
 * build — altrimenti ogni deploy (anche solo di UI) chiederebbe al medico di
 * rielaborare, spendendo crediti per niente.
 */
export const PIPELINE_CHANGED_AT = '2026-09-06T20:00:00.000Z';

function parseIso(value: string | null | undefined): number | null {
  if (!value) return null;
  const t = Date.parse(value);
  return Number.isFinite(t) ? t : null;
}

/** True se l'analisi è stata AVVIATA prima dell'ultimo cambiamento della
 * pipeline: i suoi dati riflettono una versione precedente dell'app.
 * Fail-safe: dati mancanti o malformati → false (mai un avviso a vuoto). */
export function isAnalysisOlderThanBuild(
  processingStartedAt: string | null | undefined,
  buildTime: string | null | undefined = PIPELINE_CHANGED_AT,
): boolean {
  const started = parseIso(processingStartedAt);
  const built = parseIso(buildTime);
  if (started === null || built === null) return false;
  return started < built;
}

/** "ed239c0 · 04.09.2026", oppure "sviluppo" fuori da una build versionata. */
export function formatBuildLabel(
  sha: string | undefined = BUILD_SHA,
  builtAt: string | undefined = BUILD_TIME,
): string {
  if (!sha) return 'sviluppo';
  const short = sha.slice(0, 7);
  const t = parseIso(builtAt);
  if (t === null) return short;
  const d = new Date(t);
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${short} · ${dd}.${mm}.${d.getUTCFullYear()}`;
}
