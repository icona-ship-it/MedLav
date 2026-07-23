/**
 * Stima onesta del tempo di analisi, mostrata prima dell'avvio. Fasce
 * volutamente ampie: meglio non promettere una precisione che non c'è.
 */
export function estimateAnalysisTime(docCount: number, totalSizeBytes = 0): string {
  // La stima pesa ANCHE la dimensione totale (CASO-2026-235: 2 documenti ma
  // 301 pagine/50MB → quasi 2 ore di estrazione; la vecchia stima per solo
  // numero-documenti prometteva "pochi minuti" e il caso è stato annullato
  // credendolo bloccato). Fasce ampie e oneste, vince la più pesante.
  const sizeMb = totalSizeBytes / 1_000_000;
  const tierByCount = docCount <= 5 ? 0 : docCount <= 20 ? 1 : docCount <= 50 ? 2 : 3;
  const tierBySize = sizeMb <= 10 ? 0 : sizeMb <= 25 ? 1 : sizeMb <= 45 ? 2 : 3;
  const tier = Math.max(tierByCount, tierBySize);
  if (tier === 0) return 'di solito pochi minuti';
  if (tier === 1) return 'di solito 5–15 minuti';
  if (tier === 2) return 'di solito 15–35 minuti';
  return 'fascicolo molto voluminoso: anche 1–2 ore — puoi chiudere la pagina, l\'analisi prosegue sul server';
}
