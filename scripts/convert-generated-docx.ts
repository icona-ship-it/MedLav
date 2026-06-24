/**
 * Converte i report GENERATI da LegMed (esportati come .docx) in testo .md dentro
 * benchmark/generated/<slug>.md, pronti per lo scoring di `pnpm eval:golden`.
 *
 * Lo scorer (scripts/eval-golden-harness.ts) confronta benchmark/gold/<slug>.md ↔
 * benchmark/generated/<slug>.md con MATCH ESATTO di slug: lo slug passato qui deve
 * combaciare con quello del gold corrispondente (es. caccialanza-ctu-rc).
 *
 * Riusa `mammoth` (stessa dipendenza/uso di scripts/extract-gold-standards.ts).
 * benchmark/ è gitignored (dati sanitari Art. 9): questo script NON stampa il
 * contenuto, solo nomi file e conteggio parole.
 *
 * USAGE (coppie <docx> <slug>):
 *   pnpm tsx scripts/convert-generated-docx.ts \
 *     "benchmark/Risultati analisi/report-CASO-2026-188.docx" <slug-gold-188> \
 *     "benchmark/Risultati analisi/report-CASO-2026-189.docx" <slug-gold-189>
 *
 * Output: benchmark/generated/<slug>.md (testo grezzo del report).
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import mammoth from 'mammoth';

const GENERATED_DIR = path.resolve(process.cwd(), 'benchmark', 'generated');

interface Pair {
  docxPath: string;
  slug: string;
}

function parseArgs(argv: string[]): Pair[] {
  if (argv.length === 0 || argv.length % 2 !== 0) {
    throw new Error(
      'Argomenti attesi a coppie <docx> <slug>. ' +
        'Es: pnpm tsx scripts/convert-generated-docx.ts "benchmark/Risultati analisi/report-CASO-2026-188.docx" caccialanza-ctu-rc',
    );
  }
  const pairs: Pair[] = [];
  for (let i = 0; i < argv.length; i += 2) {
    pairs.push({ docxPath: argv[i], slug: argv[i + 1] });
  }
  return pairs;
}

async function convertOne(pair: Pair): Promise<number> {
  const inputPath = path.resolve(process.cwd(), pair.docxPath);
  await fs.access(inputPath);
  const { value: text } = await mammoth.extractRawText({ path: inputPath });
  const outputPath = path.join(GENERATED_DIR, `${pair.slug}.md`);
  await fs.writeFile(outputPath, `${text.trim()}\n`, 'utf-8');
  return text.split(/\s+/).filter((w) => w.length > 0).length;
}

async function main(): Promise<void> {
  const pairs = parseArgs(process.argv.slice(2));
  await fs.mkdir(GENERATED_DIR, { recursive: true });

  let okCount = 0;
  let failCount = 0;
  for (const pair of pairs) {
    try {
      const words = await convertOne(pair);
      console.log(`✅ OK     ${pair.slug} (${words} parole) -> benchmark/generated/${pair.slug}.md`);
      okCount++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'unknown';
      console.log(`❌ FAIL   ${pair.slug}: ${msg.slice(0, 150)}`);
      failCount++;
    }
  }

  console.log(`\n📊 Summary: ${okCount} OK, ${failCount} FAIL`);
  if (failCount > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('❌ Fatal error:', err);
  process.exit(1);
});
