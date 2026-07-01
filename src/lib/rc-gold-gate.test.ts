import { describe, expect, it } from 'vitest';

import {
  RC_GOLD_CASES,
  countGeneratedDocBlocks,
  evaluateRcCase,
  extractDocSanitariaSection,
  findInvariantViolations,
} from './rc-gold-gate';

// ─────────────────────────────────────────────────────────────────────
// Fixture sintetiche (nessun dato reale di paziente)
// ─────────────────────────────────────────────────────────────────────

const GENERATED_REPORT = `## Intestazione

Perito: [da compilare dal perito]

## La Documentazione Medica Prodotta

**Verbale di Pronto Soccorso, Ospedale X, in data 01.02.2025:**

«... diagnosi di frattura composta ...»

**Referto RX, Struttura Y, in data 03.02.2025:**

«... rima di frattura in via di consolidamento ...»

## La Visita Clinica

[da compilare dal perito]

## Epicrisi

Sintesi del caso.
`;

const GOLD_REPORT = `INTESTAZIONE

Perito incaricato.

LA DOCUMENTAZIONE MEDICA PRODOTTA

01.02.2025 - Verbale di Pronto Soccorso:

"… diagnosi di frattura composta …"

03.02.2025 - Referto RX:

"… rima di frattura in via di consolidamento …"

LA VISITA CLINICA

Esame obiettivo completo degli arti superiori e inferiori con valutazione funzionale della articolazione interessata dal trauma in esame.
`;

describe('extractDocSanitariaSection', () => {
  it('should extract the section when heading is a markdown H2', () => {
    const section = extractDocSanitariaSection(GENERATED_REPORT);
    expect(section).toContain('Verbale di Pronto Soccorso');
    expect(section).toContain('Referto RX');
    expect(section).not.toContain('La Visita Clinica');
    expect(section).not.toContain('Epicrisi');
  });

  it('should extract the section when heading is an ALL-CAPS line (formato gold)', () => {
    const section = extractDocSanitariaSection(GOLD_REPORT);
    expect(section).toContain('Verbale di Pronto Soccorso');
    expect(section).not.toContain('LA VISITA CLINICA');
    expect(section).not.toContain('Esame obiettivo');
  });

  it('should match the three gold heading variants', () => {
    const variants = [
      'LA DOCUMENTAZIONE MEDICA PRODOTTA',
      'LA DOCUMENTAZIONE MEDICA RESASI DISPONIBILE E RECENSITA',
      'I DATI DELLA DOCUMENTAZIONE SANITARIA ESIBITA',
    ];
    for (const heading of variants) {
      const text = `PREMESSA\n\nTesto.\n\n${heading}\n\nContenuto blocco.\n\nEPICRISI\n\nFine.`;
      expect(extractDocSanitariaSection(text)).toContain('Contenuto blocco');
    }
  });

  it('should return empty string when the section is missing', () => {
    expect(extractDocSanitariaSection('## Epicrisi\n\nSolo epicrisi.')).toBe('');
  });
});

describe('countGeneratedDocBlocks', () => {
  it('should count standalone bold block headers in the doc-sanitaria section', () => {
    expect(countGeneratedDocBlocks(GENERATED_REPORT)).toBe(2);
  });

  it('should not count the repeated section title in bold as a block', () => {
    const withRepeatedTitle = GENERATED_REPORT.replace(
      '**Referto RX, Struttura Y, in data 03.02.2025:**',
      '**La Documentazione Medica Prodotta**\n\n**Referto RX, Struttura Y, in data 03.02.2025:**',
    );
    expect(countGeneratedDocBlocks(withRepeatedTitle)).toBe(2);
  });

  it('should fall back to date-headed blocks when no bold headers exist (formato gold)', () => {
    expect(countGeneratedDocBlocks(GOLD_REPORT)).toBe(2);
  });

  it('should return 0 for empty or section-less input', () => {
    expect(countGeneratedDocBlocks('')).toBe(0);
    expect(countGeneratedDocBlocks('## Epicrisi\n\nTesto.')).toBe(0);
  });
});

describe('findInvariantViolations', () => {
  it('should return no violations for a clean report', () => {
    expect(findInvariantViolations(GENERATED_REPORT)).toEqual([]);
  });

  it('should flag guard markers inside «...» quotes', () => {
    const dirty = GENERATED_REPORT.replace(
      '«... diagnosi di frattura composta ...»',
      '«... diagnosi [non documentato] ...»',
    );
    const violations = findInvariantViolations(dirty);
    expect(violations.some((v) => v.id === 'marker-in-virgolette')).toBe(true);
  });

  it('should flag machine tags like [Ev.N] and [Diagnosi:]', () => {
    const dirty = `${GENERATED_REPORT}\n\nCome da [Ev.12] la diagnosi era [Diagnosi:] frattura.`;
    const ids = findInvariantViolations(dirty).map((v) => v.id);
    expect(ids).toContain('tag-ev');
    expect(ids).toContain('tag-macchina');
  });
});

describe('evaluateRcCase', () => {
  const semplice = RC_GOLD_CASES.find((c) => c.fascia === 'semplice')!;
  const macrodanno = RC_GOLD_CASES.find((c) => c.fascia === 'macrodanno')!;

  it('should pass a semplice case with panel score >= 90 and words within ±15%', () => {
    const result = evaluateRcCase(semplice, GOLD_REPORT, GENERATED_REPORT, 92);
    // Fixture: gold e generato hanno lunghezze comparabili → il check parole regge
    expect(result.pass).toBe(true);
    expect(result.checks.find((c) => c.id === 'panel')?.pass).toBe(true);
  });

  it('should fail a semplice case when panel score is below 90', () => {
    const result = evaluateRcCase(semplice, GOLD_REPORT, GENERATED_REPORT, 89);
    expect(result.pass).toBe(false);
    expect(result.checks.find((c) => c.id === 'panel')?.pass).toBe(false);
  });

  it('should fail a semplice case when generated is more than 15% longer than gold', () => {
    const padded = `${GENERATED_REPORT}\n\n${'parola '.repeat(200)}`;
    const result = evaluateRcCase(semplice, GOLD_REPORT, padded, 95);
    expect(result.pass).toBe(false);
    expect(result.checks.find((c) => c.id === 'parole')?.pass).toBe(false);
  });

  it('should fail when the panel score is missing (null)', () => {
    const result = evaluateRcCase(semplice, GOLD_REPORT, GENERATED_REPORT, null);
    expect(result.pass).toBe(false);
    expect(result.checks.find((c) => c.id === 'panel')?.pass).toBe(false);
  });

  it('should fail a macrodanno case when generated blocks exceed 1.3x the calibrated gold blocks', () => {
    // macrodanno: goldBlocksCalibrated=53 → limite 68.9. Genero 70 blocchi.
    const manyBlocks = [
      '## La Documentazione Medica Prodotta',
      '',
      ...Array.from({ length: 70 }, (_, i) => `**Referto n. ${i + 1}, in data 01.01.2025:**\n\n«... testo ...»\n`),
      '## Epicrisi',
      '',
      'Fine.',
    ].join('\n');
    const result = evaluateRcCase(macrodanno, GOLD_REPORT, manyBlocks, 85);
    expect(result.pass).toBe(false);
    expect(result.checks.find((c) => c.id === 'blocchi')?.pass).toBe(false);
  });

  it('should not apply the word-length check to fasce that do not declare it', () => {
    const padded = `${GENERATED_REPORT}\n\n${'parola '.repeat(500)}`;
    const result = evaluateRcCase(macrodanno, GOLD_REPORT, padded, 85);
    const parole = result.checks.find((c) => c.id === 'parole');
    // informativo (pass=null), non bloccante
    expect(parole?.pass).toBeNull();
  });

  it('should fail on invariant violations even with a high panel score', () => {
    const dirty = GENERATED_REPORT.replace(
      '«... diagnosi di frattura composta ...»',
      '«... diagnosi [non documentato] ...»',
    );
    const result = evaluateRcCase(semplice, GOLD_REPORT, dirty, 95);
    expect(result.pass).toBe(false);
    expect(result.checks.find((c) => c.id === 'invarianti')?.pass).toBe(false);
  });
});

describe('RC_GOLD_CASES config', () => {
  it('should declare the three fasce with the founding-doc gates', () => {
    const bySlug = Object.fromEntries(RC_GOLD_CASES.map((c) => [c.fascia, c]));
    expect(bySlug['semplice'].minPanelScore).toBe(90);
    expect(bySlug['semplice'].wordDeltaMaxPct).toBe(15);
    expect(bySlug['medio'].minPanelScore).toBe(85);
    expect(bySlug['macrodanno'].minPanelScore).toBe(80);
    expect(bySlug['macrodanno'].blockRatioMax).toBe(1.3);
    expect(bySlug['macrodanno'].goldBlocksCalibrated).toBe(53);
  });
});
