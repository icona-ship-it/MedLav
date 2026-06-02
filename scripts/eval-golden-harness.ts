/**
 * Eval "golden" batch: confronta i report MedLav generati contro i benchmark
 * gold reali e produce una SCORECARD (similarità, copertura sezioni, copertura
 * keyword, delta lunghezza, e — se disponibile — Hallucination Risk Score).
 *
 * NON genera nulla (niente Mistral): il perito genera i report via app e li
 * salva; questo script li VALUTA. Pensato come gate manuale on-demand.
 *
 * WORKFLOW:
 *   1. Estrai i gold in benchmark/gold/<slug>.md (uno per benchmark).
 *   2. Genera il report MedLav per ogni caso, esportalo (HTML/markdown) e
 *      salvalo in benchmark/generated/<slug>.md (stesso slug del gold).
 *   3. pnpm eval:golden
 *
 * Output: benchmark/scores/scorecard-<timestamp>.{json,md} + riepilogo a video.
 * Exit code 1 se almeno un caso è "divergent" (similarità < 50%).
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { scoreReport, type ReportScore } from '../src/lib/eval-scoring';

const BENCHMARK_DIR = path.resolve(process.cwd(), 'benchmark');
const GOLD_DIR = path.join(BENCHMARK_DIR, 'gold');
const GENERATED_DIR = path.join(BENCHMARK_DIR, 'generated');
const SCORES_DIR = path.join(BENCHMARK_DIR, 'scores');

interface CaseResult {
  slug: string;
  score?: ReportScore;
  hrs?: number;
  hrsLevel?: string;
  status: 'scored' | 'missing-generated';
}

/** HRS opzionale: importa le util dell'app solo se l'ambiente lo consente. */
async function tryComputeHrs(generated: string): Promise<{ hrs: number; level: string } | null> {
  try {
    const [{ validateReport }, { computeHrs, getHrsLevel }] = await Promise.all([
      import('@/services/synthesis/report-validator'),
      import('@/services/synthesis/hallucination-risk-scorer'),
    ]);
    const validation = validateReport(generated, 0);
    const hrs = computeHrs(validation);
    return { hrs, level: getHrsLevel(hrs) };
  } catch {
    return null; // env/import non disponibile → si salta l'HRS, lo scoring resta valido
  }
}

async function listSlugs(): Promise<string[]> {
  try {
    const files = await fs.readdir(GOLD_DIR);
    return files.filter((f) => f.endsWith('.md')).map((f) => f.replace(/\.md$/, ''));
  } catch {
    return [];
  }
}

function fmtPct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

function buildScorecardMd(results: CaseResult[], timestamp: string): string {
  const scored = results.filter((r) => r.status === 'scored' && r.score);
  const rows = results.map((r) => {
    if (r.status === 'missing-generated' || !r.score) {
      return `| ${r.slug} | — | — | — | — | ⏳ manca il generato |`;
    }
    const s = r.score;
    const verdict = s.verdict === 'match' ? '✅ match' : s.verdict === 'acceptable' ? '⚠️ acceptable' : '❌ divergent';
    const sec = `${s.section.matchedInGenerated}/${s.section.goldSections}`;
    const kw = `${s.keyword.presentInGenerated}/${s.keyword.presentInGold}`;
    const hrs = r.hrs != null ? `${r.hrs} (${r.hrsLevel})` : '—';
    return `| ${r.slug} | ${fmtPct(s.similarity)} | ${sec} | ${kw} | ${hrs} | ${verdict} |`;
  });
  const avgSim = scored.length
    ? scored.reduce((a, r) => a + (r.score!.similarity), 0) / scored.length
    : 0;
  return `# Scorecard eval golden — ${timestamp}

Casi valutati: ${scored.length} su ${results.length}. Similarità media: **${fmtPct(avgSim)}**.

| Caso | Similarità | Sezioni | Keyword | HRS | Verdetto |
|------|-----------:|:-------:|:-------:|:---:|----------|
${rows.join('\n')}

> Soglie: ≥70% match · 50–70% acceptable (revisione perito) · <50% divergent.
> Le sezioni gold mancanti nel generato e i delta lunghezza sono nel JSON affiancato.
`;
}

async function main(): Promise<void> {
  const slugs = await listSlugs();
  if (slugs.length === 0) {
    console.error('❌ Nessun gold in benchmark/gold/*.md.');
    console.error('   1) Estrai i benchmark gold in benchmark/gold/<slug>.md');
    console.error('   2) Genera i report MedLav e salvali in benchmark/generated/<slug>.md');
    console.error('   3) Rilancia: pnpm eval:golden');
    process.exit(1);
  }

  const results: CaseResult[] = [];
  for (const slug of slugs) {
    const goldText = await fs.readFile(path.join(GOLD_DIR, `${slug}.md`), 'utf-8');
    let generatedText: string;
    try {
      generatedText = await fs.readFile(path.join(GENERATED_DIR, `${slug}.md`), 'utf-8');
    } catch {
      results.push({ slug, status: 'missing-generated' });
      continue;
    }
    const score = scoreReport(goldText, generatedText);
    const hrs = await tryComputeHrs(generatedText);
    results.push({ slug, score, hrs: hrs?.hrs, hrsLevel: hrs?.level, status: 'scored' });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const md = buildScorecardMd(results, timestamp);

  await fs.mkdir(SCORES_DIR, { recursive: true });
  await fs.writeFile(path.join(SCORES_DIR, `scorecard-${timestamp}.md`), md, 'utf-8');
  await fs.writeFile(
    path.join(SCORES_DIR, `scorecard-${timestamp}.json`),
    JSON.stringify({ timestamp, results }, null, 2),
    'utf-8',
  );

  console.log(md);
  console.log(`\n💾 Scorecard salvata in: ${SCORES_DIR}`);

  const divergent = results.filter((r) => r.score?.verdict === 'divergent');
  if (divergent.length > 0) {
    console.error(`\n❌ ${divergent.length} caso/i divergente/i: ${divergent.map((r) => r.slug).join(', ')}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('❌ Fatal:', err);
  process.exit(1);
});
