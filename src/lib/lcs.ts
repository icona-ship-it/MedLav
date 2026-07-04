/**
 * Longest Common Subsequence su array di parole — DP space-optimized (2 righe).
 * Condivisa tra la verifica sourceText (services/validation) e le metriche di
 * edit bozza→firmato (lib/edit-metrics).
 */
export function lcsWordLength(a: string[], b: string[]): number {
  const m = a.length;
  const n = b.length;

  let prev = new Array<number>(n + 1).fill(0);
  let curr = new Array<number>(n + 1).fill(0);

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        curr[j] = prev[j - 1] + 1;
      } else {
        curr[j] = Math.max(prev[j], curr[j - 1]);
      }
    }
    [prev, curr] = [curr, prev];
    curr.fill(0);
  }

  return prev[n];
}
