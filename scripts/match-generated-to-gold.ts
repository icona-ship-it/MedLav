/**
 * Trova, per ciascun report GENERATO (.docx), quale gold standard gli somiglia di
 * più — utile quando non si ricorda a quale caso gold corrisponde un report prodotto
 * dall'app. Riusa lo scorer di `pnpm eval:golden` (scoreReport) e `mammoth`.
 *
 * GDPR (Art. 9): NON stampa alcun contenuto clinico — solo slug del gold e percentuali
 * di similarità. benchmark/ è gitignored.
 *
 * USAGE:
 *   pnpm tsx scripts/match-generated-to-gold.ts \
 *     "benchmark/Risultati analisi/report-CASO-2026-188.docx" \
 *     "benchmark/Risultati analisi/report-CASO-2026-189.docx"
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import mammoth from 'mammoth';
import { scoreReport } from '../src/lib/eval-scoring';

const GOLD_DIR = path.resolve(process.cwd(), 'benchmark', 'gold');

async function loadGolds(): Promise<Array<{ slug: string; text: string }>> {
  const files = (await fs.readdir(GOLD_DIR)).filter((f) => f.endsWith('.md'));
  return Promise.all(
    files.map(async (f) => ({
      slug: f.replace(/\.md$/, ''),
      text: await fs.readFile(path.join(GOLD_DIR, f), 'utf-8'),
    })),
  );
}

async function main(): Promise<void> {
  const docxPaths = process.argv.slice(2);
  if (docxPaths.length === 0) {
    throw new Error('Passa uno o più path .docx dei report generati.');
  }

  const golds = await loadGolds();
  if (golds.length === 0) throw new Error('Nessun gold in benchmark/gold/*.md');

  for (const docxPath of docxPaths) {
    const inputPath = path.resolve(process.cwd(), docxPath);
    const { value: text } = await mammoth.extractRawText({ path: inputPath });

    const ranked = golds
      .map((g) => ({ slug: g.slug, similarity: scoreReport(g.text, text).similarity }))
      .sort((a, b) => b.similarity - a.similarity);

    const label = path.basename(docxPath);
    console.log(`\n📄 ${label}`);
    ranked.slice(0, 4).forEach((r, i) => {
      const pct = `${(r.similarity * 100).toFixed(1)}%`;
      console.log(`   ${i === 0 ? '⭐' : '  '} ${r.slug.padEnd(38)} ${pct}`);
    });
  }
}

main().catch((err) => {
  console.error('❌ Fatal error:', err);
  process.exit(1);
});
