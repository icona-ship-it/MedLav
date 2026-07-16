/**
 * Gate di accettazione GOLD-FIRST per la perizia RC stragiudiziale (MVP rc-mvp).
 *
 * Definizione di "fatto" (founding doc scratchpad/nuovo-progetto-rc-mvp.md §2):
 *  - caso SEMPLICE:    panel ≥ 90/100 e parole entro ±15% del gold
 *  - caso MEDIO:       panel ≥ 85/100
 *  - caso MACRODANNO:  panel ≥ 80/100 e blocchi-documento ≤ 1,3× il gold
 *
 * Il punteggio 0–100 lo produce il panel multi-agente (workflow confronto-rc-gold),
 * NON questo modulo: qui si applicano i gate e gli invarianti deterministici.
 * Funzioni PURE e testate; l'I/O sta in scripts/rc-gold-gate.ts.
 *
 * I conteggi blocchi del GOLD sono COSTANTI CALIBRATE (misura multi-agente
 * w5rin5vrq del 2026-06-29): il gold è prosa non marcata, il conteggio
 * deterministico è affidabile solo sul formato dell'app (header in grassetto).
 */

import { countWords, stripAccents } from './eval-scoring';

export type RcFascia = 'semplice' | 'medio' | 'macrodanno';

export interface RcGoldCaseConfig {
  slug: string;
  fascia: RcFascia;
  minPanelScore: number;
  /** Solo dove il founding doc lo prevede (semplice): |delta parole| max in %. */
  wordDeltaMaxPct?: number;
  /** Solo dove il founding doc lo prevede (macrodanno): blocchi ≤ ratio × gold. */
  blockRatioMax?: number;
  /** Blocchi del gold misurati dal panel (il gold non è contabile a macchina). */
  goldBlocksCalibrated?: number;
}

export const RC_GOLD_CASES: RcGoldCaseConfig[] = [
  {
    slug: 'gold-a-semplice',
    fascia: 'semplice',
    minPanelScore: 90,
    wordDeltaMaxPct: 15,
    goldBlocksCalibrated: 6,
  },
  {
    slug: 'gold-b-medio',
    fascia: 'medio',
    minPanelScore: 85,
    goldBlocksCalibrated: 6,
  },
  {
    slug: 'gold-c-macrodanno',
    fascia: 'macrodanno',
    minPanelScore: 80,
    blockRatioMax: 1.3,
    goldBlocksCalibrated: 53,
  },
];

// ─────────────────────────────────────────────────────────────────────
// Sezione "Documentazione Sanitaria"
// ─────────────────────────────────────────────────────────────────────

function isDocSanitariaTitle(text: string): boolean {
  const t = stripAccents(text).toLowerCase();
  return t.includes('documentazione') && (t.includes('medica') || t.includes('sanitaria'));
}

/** Heading = riga markdown `#`–`###` oppure riga breve TUTTA MAIUSCOLA (formato gold). */
function headingText(line: string): string | null {
  const md = line.match(/^#{1,3}\s+(.+)$/);
  if (md) return md[1].replace(/\*+/g, '').trim();
  if (line.length > 100 || line.includes('«') || line.includes('"')) return null;
  const letters = line.replace(/[^\p{L}]/gu, '');
  if (letters.length >= 8 && letters === letters.toUpperCase() && /\s/.test(line)) return line;
  return null;
}

/** Estrae la sezione doc-sanitaria (dal suo heading al successivo). '' se assente. */
export function extractDocSanitariaSection(markdown: string): string {
  const lines = markdown.split('\n');
  const collected: string[] = [];
  let inside = false;
  for (const raw of lines) {
    const line = raw.trim();
    const heading = headingText(line);
    if (heading !== null) {
      if (inside) break;
      if (isDocSanitariaTitle(heading)) inside = true;
      continue;
    }
    if (inside) collected.push(raw);
  }
  return collected.join('\n').trim();
}

// ─────────────────────────────────────────────────────────────────────
// Conteggio blocchi-documento
// ─────────────────────────────────────────────────────────────────────

/**
 * Conta i blocchi-documento nella sezione doc-sanitaria.
 * Formato app: header in grassetto su riga propria (`**Referto ..., in data ...:**`).
 * Fallback formato gold: righe `DD.MM.YYYY - Titolo:` (usato solo a scopo
 * informativo — per i gate si usano le costanti calibrate del gold).
 */
export function countGeneratedDocBlocks(markdown: string): number {
  const section = extractDocSanitariaSection(markdown);
  if (!section) return 0;
  const lines = section.split('\n').map((l) => l.trim());
  const boldHeaders = lines.filter((l) => {
    const m = l.match(/^\*\*([^*].*?)\*\*:?$/);
    if (!m) return false;
    return !isDocSanitariaTitle(m[1]);
  });
  if (boldHeaders.length > 0) return boldHeaders.length;
  return lines.filter((l) => /^\d{1,2}[./]\d{1,2}[./]\d{4}/.test(l) && l.endsWith(':')).length;
}

// ─────────────────────────────────────────────────────────────────────
// Invarianti deterministici (sempre bloccanti, atto depositabile)
// ─────────────────────────────────────────────────────────────────────

export interface InvariantViolation {
  id: string;
  label: string;
  count: number;
}

const INVARIANT_PATTERNS: ReadonlyArray<{ id: string; label: string; pattern: RegExp }> = [
  {
    id: 'marker-in-virgolette',
    label: 'Marker di guardia dentro le virgolette «...»',
    pattern: /«[^»]*\[(?:non documentato|citazione da verificare|(?:dato )?non risultante[^\]]*)\][^»]*»/g,
  },
  {
    id: 'tag-ev',
    label: 'Citazioni tecniche [Ev.N] nel corpo',
    pattern: /\[Ev\.\s*\d+\]/g,
  },
  {
    id: 'tag-macchina',
    label: 'Tag macchina ([Diagnosi: ...], annotazioni schedate, meta-commenti LLM)',
    // Review 2026-07-03: le annotazioni reali hanno CONTENUTO dopo i due punti
    // — la regex deve coprirle, non solo il tag letterale vuoto. Tenere la
    // lista etichette allineata a stripGuardMarkersInsideQuotes
    // (section-generator.ts).
    pattern: /\[(?:Diagnosi|Raccomandazioni|Follow[- ]?up|Terapia|Prognosi|Conclusioni|Clinica)\s*:[^\]]*\]|\[Il resto (?:rimane )?invariato\]/gi,
  },
];

export function findInvariantViolations(markdown: string): InvariantViolation[] {
  const violations: InvariantViolation[] = [];
  for (const { id, label, pattern } of INVARIANT_PATTERNS) {
    const count = (markdown.match(pattern) ?? []).length;
    if (count > 0) violations.push({ id, label, count });
  }
  return violations;
}

// ─────────────────────────────────────────────────────────────────────
// Valutazione del gate per caso
// ─────────────────────────────────────────────────────────────────────

export interface RcGateCheck {
  id: string;
  label: string;
  value: string;
  /** true/false = bloccante; null = informativo. */
  pass: boolean | null;
}

export interface RcCaseResult {
  slug: string;
  fascia: RcFascia;
  checks: RcGateCheck[];
  pass: boolean;
}

function buildPanelCheck(config: RcGoldCaseConfig, panelScore: number | null): RcGateCheck {
  return {
    id: 'panel',
    label: `Punteggio panel ≥ ${config.minPanelScore}`,
    value: panelScore === null ? 'assente' : `${panelScore}/100`,
    pass: panelScore !== null && panelScore >= config.minPanelScore,
  };
}

function buildWordCheck(config: RcGoldCaseConfig, goldText: string, generatedText: string): RcGateCheck {
  const wordsGold = countWords(goldText);
  const wordsGen = countWords(generatedText);
  const wordDeltaPct = wordsGold === 0 ? 0 : ((wordsGen - wordsGold) / wordsGold) * 100;
  return {
    id: 'parole',
    label: config.wordDeltaMaxPct !== undefined
      ? `Parole entro ±${config.wordDeltaMaxPct}% del gold`
      : 'Parole vs gold (informativo)',
    value: `${wordsGen} vs ${wordsGold} (${wordDeltaPct >= 0 ? '+' : ''}${wordDeltaPct.toFixed(1)}%)`,
    pass: config.wordDeltaMaxPct !== undefined
      ? Math.abs(wordDeltaPct) <= config.wordDeltaMaxPct
      : null,
  };
}

function buildBlockCheck(config: RcGoldCaseConfig, goldText: string, generatedText: string): RcGateCheck {
  const genBlocks = countGeneratedDocBlocks(generatedText);
  const goldBlocks = config.goldBlocksCalibrated ?? countGeneratedDocBlocks(goldText);
  return {
    id: 'blocchi',
    label: config.blockRatioMax !== undefined
      ? `Blocchi-documento ≤ ${config.blockRatioMax}× gold`
      : 'Blocchi-documento vs gold (informativo)',
    value: `${genBlocks} vs ${goldBlocks} gold (limite ${config.blockRatioMax !== undefined ? (config.blockRatioMax * goldBlocks).toFixed(1) : '—'})`,
    pass: config.blockRatioMax !== undefined
      ? genBlocks <= config.blockRatioMax * goldBlocks
      : null,
  };
}

function buildInvariantCheck(generatedText: string): RcGateCheck {
  const violations = findInvariantViolations(generatedText);
  return {
    id: 'invarianti',
    label: 'Invarianti depositabilità (verbatim pulito, no tag macchina)',
    value: violations.length === 0
      ? 'ok'
      : violations.map((v) => `${v.id}×${v.count}`).join(', '),
    pass: violations.length === 0,
  };
}

export function evaluateRcCase(
  config: RcGoldCaseConfig,
  goldText: string,
  generatedText: string,
  panelScore: number | null,
): RcCaseResult {
  const checks: RcGateCheck[] = [
    buildPanelCheck(config, panelScore),
    buildWordCheck(config, goldText, generatedText),
    buildBlockCheck(config, goldText, generatedText),
    buildInvariantCheck(generatedText),
  ];

  return {
    slug: config.slug,
    fascia: config.fascia,
    checks,
    pass: checks.every((c) => c.pass !== false),
  };
}
