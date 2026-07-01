/**
 * GATE RC GOLD-FIRST — harness di accettazione del branch rc-mvp.
 *
 * Applica ai 3 casi gold RC (semplice/medio/macrodanno) i gate del founding
 * doc (scratchpad/nuovo-progetto-rc-mvp.md §2): punteggio panel per fascia,
 * lunghezza, blocchi-documento e invarianti deterministici.
 *
 * INPUT (locali, gitignorati — GDPR Art. 9):
 *   benchmark/gold/<slug>.md         — perizie gold di Lavini
 *   benchmark/generated/<slug>.md    — report generati dall'app
 *   benchmark/scores/rc-panel-scores.json — punteggi 0–100 del panel
 *     multi-agente (workflow confronto-rc-gold): { "scores": { "<slug>": N } }
 *
 * OUTPUT: scorecard a video + benchmark/scores/rc-gate-<timestamp>.md.
 * Exit code 1 se almeno un caso non passa il gate (il RED di F0).
 *
 * GDPR: stampa SOLO metriche e provenienza file, mai contenuto clinico.
 *
 * USAGE: pnpm gate:rc
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';

import {
  RC_GOLD_CASES,
  evaluateRcCase,
  type RcCaseResult,
} from '../src/lib/rc-gold-gate';

const BENCHMARK_DIR = path.resolve(process.cwd(), 'benchmark');
const GOLD_DIR = path.join(BENCHMARK_DIR, 'gold');
const GENERATED_DIR = path.join(BENCHMARK_DIR, 'generated');
const SCORES_DIR = path.join(BENCHMARK_DIR, 'scores');
const PANEL_SCORES_PATH = path.join(SCORES_DIR, 'rc-panel-scores.json');

interface PanelScoresFile {
  generatedAt?: string;
  runId?: string;
  scores?: Record<string, number>;
}

async function readPanelScores(): Promise<PanelScoresFile | null> {
  try {
    const raw = await fs.readFile(PANEL_SCORES_PATH, 'utf-8');
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed === 'object' && parsed !== null) return parsed as PanelScoresFile;
    return null;
  } catch {
    return null;
  }
}

async function fileProvenance(filePath: string): Promise<string> {
  try {
    const stat = await fs.stat(filePath);
    return stat.mtime.toISOString();
  } catch {
    return 'ASSENTE';
  }
}

function checkMark(pass: boolean | null): string {
  if (pass === null) return 'ℹ️';
  return pass ? '✅' : '❌';
}

function buildScorecard(params: {
  results: RcCaseResult[];
  provenance: Array<{ slug: string; gold: string; generated: string }>;
  panel: PanelScoresFile | null;
  timestamp: string;
}): string {
  const { results, provenance, panel, timestamp } = params;
  const allPass = results.every((r) => r.pass);
  const lines: string[] = [
    `# Gate RC gold-first — ${timestamp}`,
    '',
    `Verdetto complessivo: ${allPass ? '✅ GATE VERDE' : '❌ GATE ROSSO'}`,
    '',
    panel?.scores
      ? `Panel: ${PANEL_SCORES_PATH} (generato ${panel.generatedAt ?? 'data ignota'}${panel.runId ? `, run ${panel.runId}` : ''})`
      : `Panel: ASSENTE — eseguire il workflow confronto-rc-gold e salvare ${PANEL_SCORES_PATH}`,
    '',
  ];
  for (const result of results) {
    lines.push(`## ${result.slug} (${result.fascia}) — ${result.pass ? '✅ PASS' : '❌ FAIL'}`);
    lines.push('');
    lines.push('| Check | Valore | Esito |');
    lines.push('|-------|--------|:-----:|');
    for (const check of result.checks) {
      lines.push(`| ${check.label} | ${check.value} | ${checkMark(check.pass)} |`);
    }
    lines.push('');
  }
  lines.push('## Provenienza input (mtime)');
  lines.push('');
  lines.push('| Caso | Gold | Generato |');
  lines.push('|------|------|----------|');
  for (const p of provenance) {
    lines.push(`| ${p.slug} | ${p.gold} | ${p.generated} |`);
  }
  lines.push('');
  lines.push('> Gate (founding doc): semplice ≥90 e parole ±15% · medio ≥85 · macrodanno ≥80 e blocchi ≤1,3× gold. Invarianti sempre bloccanti.');
  return lines.join('\n');
}

async function main(): Promise<void> {
  const panel = await readPanelScores();
  const results: RcCaseResult[] = [];
  const provenance: Array<{ slug: string; gold: string; generated: string }> = [];

  for (const config of RC_GOLD_CASES) {
    const goldPath = path.join(GOLD_DIR, `${config.slug}.md`);
    const generatedPath = path.join(GENERATED_DIR, `${config.slug}.md`);
    provenance.push({
      slug: config.slug,
      gold: await fileProvenance(goldPath),
      generated: await fileProvenance(generatedPath),
    });

    let goldText: string;
    let generatedText: string;
    try {
      goldText = await fs.readFile(goldPath, 'utf-8');
    } catch {
      console.error(`❌ Gold mancante: ${goldPath}`);
      process.exit(1);
      return;
    }
    try {
      generatedText = await fs.readFile(generatedPath, 'utf-8');
    } catch {
      console.error(`❌ Generato mancante: ${generatedPath} — genera il report dall'app e salvalo lì.`);
      process.exit(1);
      return;
    }

    const panelScore = panel?.scores?.[config.slug] ?? null;
    results.push(evaluateRcCase(config, goldText, generatedText, panelScore));
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const scorecard = buildScorecard({ results, provenance, panel, timestamp });

  await fs.mkdir(SCORES_DIR, { recursive: true });
  const outputPath = path.join(SCORES_DIR, `rc-gate-${timestamp}.md`);
  await fs.writeFile(outputPath, scorecard, 'utf-8');

  console.log(scorecard);
  console.log(`\n💾 Scorecard salvata in: ${outputPath}`);

  const failed = results.filter((r) => !r.pass);
  if (failed.length > 0) {
    console.error(`\n❌ Gate ROSSO: ${failed.map((r) => `${r.slug} (${r.fascia})`).join(', ')}`);
    process.exit(1);
  }
  console.log('\n✅ Gate VERDE su tutti e 3 i casi.');
}

main().catch((err: unknown) => {
  console.error('❌ Fatal:', err instanceof Error ? err.message : String(err));
  process.exit(1);
});
