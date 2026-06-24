/**
 * Confronta DUE file di testo arbitrari (gold di riferimento vs testo da valutare)
 * usando lo stesso scorer di `pnpm eval:golden`. Utile per coppie che non seguono
 * la convenzione gold/<slug>.md ↔ generated/<slug>.md (es. due snapshot della stessa
 * pratica: output LegMed vs versione rivista dal perito).
 *
 * GDPR (Art. 9): stampa SOLO metriche, mai contenuto.
 *
 * USAGE:
 *   pnpm tsx scripts/score-pair.ts <goldPath> <generatedPath>
 *   es: pnpm tsx scripts/score-pair.ts \
 *       benchmark/gold/passaniti-cronistoria-rivista-lavini.md \
 *       benchmark/gold/passaniti-cronistoria-da-legmed.md
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { scoreReport } from '../src/lib/eval-scoring';

async function main(): Promise<void> {
  const [goldPath, generatedPath] = process.argv.slice(2);
  if (!goldPath || !generatedPath) {
    throw new Error('Usage: pnpm tsx scripts/score-pair.ts <goldPath> <generatedPath>');
  }

  const goldText = await fs.readFile(path.resolve(process.cwd(), goldPath), 'utf-8');
  const generatedText = await fs.readFile(path.resolve(process.cwd(), generatedPath), 'utf-8');
  const s = scoreReport(goldText, generatedText);

  const pct = (n: number): string => `${(n * 100).toFixed(1)}%`;
  const verdict =
    s.verdict === 'match' ? '✅ match' : s.verdict === 'acceptable' ? '⚠️ acceptable' : '❌ divergent';

  console.log(`\n📊 GOLD (riferimento):  ${path.basename(goldPath)}`);
  console.log(`📊 DA VALUTARE:         ${path.basename(generatedPath)}\n`);
  console.log(`   Similarità (Jaccard):  ${pct(s.similarity)}   ${verdict}`);
  console.log(`   Copertura sezioni:     ${s.section.matchedInGenerated}/${s.section.goldSections}`);
  console.log(`   Copertura keyword:     ${s.keyword.presentInGenerated}/${s.keyword.presentInGold}`);
  console.log(`   Verdetto:              ${verdict}`);
  console.log(`\n   (soglie: ≥70% match · 50–70% acceptable · <50% divergent)`);
}

main().catch((err) => {
  console.error('❌ Fatal error:', err);
  process.exit(1);
});
