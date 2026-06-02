/**
 * Diff a generated MedLav report against a gold standard.
 *
 * Run this AFTER generating a report from MedLav for one of the benchmark
 * cases. It computes similarity metrics, identifies missing/extra content,
 * and writes a structured diff to `benchmark/diffs/<slug>-<timestamp>.md`.
 *
 * USAGE:
 *   # Generate a report from MedLav, save its text/HTML/markdown to
 *   # benchmark/generated/<slug>.md, then:
 *   pnpm tsx scripts/diff-report-vs-gold.ts <slug>
 *
 * Example:
 *   pnpm tsx scripts/diff-report-vs-gold.ts passaniti-cronistoria-rivista-lavini
 *
 * The script compares benchmark/generated/<slug>.md against benchmark/gold/<slug>.md
 * and emits a human-readable diff for Lavini to review.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
// Funzioni di scoring condivise (single source of truth, testate) — vedi
// src/lib/eval-scoring.ts. Usate anche da scripts/eval-golden-harness.ts.
import { normalize, tokenize, jaccardSimilarity, keywordCoverage, lineDiff } from '../src/lib/eval-scoring';

const BENCHMARK_DIR = path.resolve(process.cwd(), 'benchmark');
const GOLD_DIR = path.join(BENCHMARK_DIR, 'gold');
const GENERATED_DIR = path.join(BENCHMARK_DIR, 'generated');
const DIFFS_DIR = path.join(BENCHMARK_DIR, 'diffs');

// ─────────────────────────────────────────────────────────────────────
// Report
// ─────────────────────────────────────────────────────────────────────

function buildDiffReport(params: {
  slug: string;
  goldText: string;
  generatedText: string;
}): string {
  const { slug, goldText, generatedText } = params;
  const goldNorm = normalize(goldText);
  const genNorm = normalize(generatedText);

  const goldTokens = tokenize(goldNorm);
  const genTokens = tokenize(genNorm);
  const similarity = jaccardSimilarity(goldTokens, genTokens);

  const goldWords = goldNorm.split(/\s+/).filter((w) => w.length > 0).length;
  const genWords = genNorm.split(/\s+/).filter((w) => w.length > 0).length;
  const wordDelta = ((genWords - goldWords) / goldWords) * 100;

  const lines = lineDiff(goldNorm, genNorm);
  const kw = keywordCoverage(goldNorm, genNorm);

  // Verdict
  let verdict = '';
  if (similarity >= 0.7) verdict = '✅ MATCH (similarity >= 70%)';
  else if (similarity >= 0.5) verdict = '⚠️ ACCEPTABLE (similarity 50-70%) — review with Lavini';
  else verdict = '❌ DIVERGENT (similarity < 50%) — likely regression, BLOCK MERGE';

  return `# Benchmark diff: ${slug}

Generated: ${new Date().toISOString()}

## Verdict: ${verdict}

## Metrics

| Metric | Gold | Generated | Delta |
|--------|-----:|----------:|------:|
| Words | ${goldWords} | ${genWords} | ${wordDelta >= 0 ? '+' : ''}${wordDelta.toFixed(1)}% |
| Unique tokens (>=3 chars) | ${goldTokens.size} | ${genTokens.size} | — |
| Jaccard similarity | — | — | **${(similarity * 100).toFixed(1)}%** |

## Domain keyword coverage

- Keywords expected in domain: ${kw.totalKeywords}
- Present in gold: ${kw.presentInGold}
- Present in generated: ${kw.presentInGenerated}
${kw.missingFromGenerated.length > 0 ? `
**Missing from generated (present in gold):**
${kw.missingFromGenerated.map((k) => `- \`${k}\``).join('\n')}
` : '\n✅ All gold-present keywords also in generated'}

## Lines in gold NOT found in generated (potential missing content)

Top ${Math.min(20, lines.missingFromGenerated.length)} lines (total ${lines.missingFromGenerated.length}):

${lines.missingFromGenerated.slice(0, 20).map((l, i) => `${i + 1}. ${l.slice(0, 200)}${l.length > 200 ? '...' : ''}`).join('\n\n') || '_None_'}

## Lines in generated NOT in gold (potential hallucination or new content)

Top ${Math.min(20, lines.extraInGenerated.length)} lines (total ${lines.extraInGenerated.length}):

${lines.extraInGenerated.slice(0, 20).map((l, i) => `${i + 1}. ${l.slice(0, 200)}${l.length > 200 ? '...' : ''}`).join('\n\n') || '_None_'}

---

## Per Lavini

Confronta il file:
- **Gold**: \`benchmark/gold/${slug}.md\`
- **Generated**: \`benchmark/generated/${slug}.md\`

Domande:
1. Le righe "missing from generated" sono veramente assenti (regression) o sono parafrasate?
2. Le righe "extra in generated" sono allucinazioni o miglioramenti legittimi?
3. La copertura keyword è adeguata per il caso?
4. **Verdict tuo**: ✅ approvare | ⚠️ minor fixes | ❌ block merge

Salva la tua valutazione in: \`scratchpad/lavini-qa-gate.md\` sotto Ondata corrente.
`;
}

// ─────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const slug = process.argv[2];
  if (!slug) {
    console.error('❌ Usage: pnpm tsx scripts/diff-report-vs-gold.ts <slug>');
    console.error('   Available slugs in benchmark/gold/:');
    try {
      const files = await fs.readdir(GOLD_DIR);
      for (const f of files) {
        if (f.endsWith('.md')) console.error(`   - ${f.replace(/\.md$/, '')}`);
      }
    } catch {
      console.error('   (no benchmark/gold/ directory yet — run extract-gold-standards.ts first)');
    }
    process.exit(1);
  }

  const goldPath = path.join(GOLD_DIR, `${slug}.md`);
  const generatedPath = path.join(GENERATED_DIR, `${slug}.md`);

  let goldText: string;
  try {
    goldText = await fs.readFile(goldPath, 'utf-8');
  } catch {
    console.error(`❌ Gold standard not found: ${goldPath}`);
    console.error('   Run: pnpm tsx scripts/extract-gold-standards.ts');
    process.exit(1);
  }

  let generatedText: string;
  try {
    generatedText = await fs.readFile(generatedPath, 'utf-8');
  } catch {
    console.error(`❌ Generated report not found: ${generatedPath}`);
    console.error('');
    console.error('  Workflow:');
    console.error(`  1. Genera il report MedLav per il caso ${slug}`);
    console.error('  2. Esporta come HTML/markdown e salvalo in:');
    console.error(`     ${generatedPath}`);
    console.error('  3. Rilancia questo script');
    process.exit(1);
  }

  const goldNorm = normalize(goldText);
  const generatedNorm = normalize(generatedText);
  const report = buildDiffReport({ slug, goldText: goldNorm, generatedText: generatedNorm });

  await fs.mkdir(DIFFS_DIR, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outputPath = path.join(DIFFS_DIR, `${slug}-${timestamp}.md`);
  await fs.writeFile(outputPath, report, 'utf-8');

  console.log(report);
  console.log(`\n💾 Saved diff report to: ${outputPath}`);
}

main().catch((err) => {
  console.error('❌ Fatal:', err);
  process.exit(1);
});
