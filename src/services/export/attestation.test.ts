import { describe, it, expect } from 'vitest';
import { buildReportAttestation, isAttestationValid, checkDepositableAttestation } from './attestation';
import { getRequiredAttestationSections, HIGH_RISK_SECTION_IDS } from '@/lib/attestation-shared';

const SYNTHESIS = `## Premesse

Testo delle premesse.

## Dati della Documentazione Sanitaria

«Citazione verbatim dal referto.»

## Spese Mediche

Tabella spese.

## Epicrisi

Sintesi conclusiva dei fatti.`;

describe('attestation-shared — getRequiredAttestationSections', () => {
  it('should list only the high-risk sections present in the report', () => {
    const required = getRequiredAttestationSections(SYNTHESIS);
    const ids = required.map((s) => s.canonicalId);
    expect(ids).toEqual(['documentazione_sanitaria', 'spese_mediche', 'epicrisi']);
  });

  it('should return empty for a report without high-risk sections', () => {
    expect(getRequiredAttestationSections('## Premesse\n\nSolo premesse.')).toEqual([]);
  });

  it('should return empty for null synthesis', () => {
    expect(getRequiredAttestationSections(null)).toEqual([]);
  });

  it('should dedupe duplicated headings by canonical id', () => {
    const doubled = `${SYNTHESIS}\n\n## Epicrisi\n\nSeconda epicrisi (anomala).`;
    const ids = getRequiredAttestationSections(doubled).map((s) => s.canonicalId);
    expect(ids.filter((id) => id === 'epicrisi')).toHaveLength(1);
  });
});

describe('attestation — buildReportAttestation', () => {
  it('should build a valid attestation when all required sections are confirmed', () => {
    const result = buildReportAttestation({
      userId: 'user-1',
      synthesis: SYNTHESIS,
      confirmedSectionIds: [...HIGH_RISK_SECTION_IDS],
    });
    expect('attestation' in result).toBe(true);
    if ('attestation' in result) {
      expect(result.attestation.attestedBy).toBe('user-1');
      expect(result.attestation.synthesisSha256).toMatch(/^[0-9a-f]{64}$/);
      expect(result.attestation.confirmedSectionIds).toContain('documentazione_sanitaria');
    }
  });

  it('should reject when a required section is not confirmed', () => {
    const result = buildReportAttestation({
      userId: 'user-1',
      synthesis: SYNTHESIS,
      confirmedSectionIds: ['documentazione_sanitaria'],
    });
    expect('error' in result).toBe(true);
    if ('error' in result) {
      expect(result.error).toContain('Spese');
    }
  });

  it('should accept a report without high-risk sections with no confirmations', () => {
    const result = buildReportAttestation({
      userId: 'user-1',
      synthesis: '## Premesse\n\nSolo premesse.',
      confirmedSectionIds: [],
    });
    expect('attestation' in result).toBe(true);
  });
});

describe('attestation — isAttestationValid', () => {
  const attested = buildReportAttestation({
    userId: 'user-1',
    synthesis: SYNTHESIS,
    confirmedSectionIds: [...HIGH_RISK_SECTION_IDS],
  });
  const attestation = 'attestation' in attested ? attested.attestation : null;

  it('should be valid while the synthesis is unchanged', () => {
    expect(isAttestationValid(attestation, SYNTHESIS)).toBe(true);
  });

  it('should become invalid after any edit to the synthesis', () => {
    expect(isAttestationValid(attestation, `${SYNTHESIS} modificato`)).toBe(false);
  });

  it('should be invalid for missing attestation or synthesis', () => {
    expect(isAttestationValid(undefined, SYNTHESIS)).toBe(false);
    expect(isAttestationValid(attestation, null)).toBe(false);
    expect(isAttestationValid({}, SYNTHESIS)).toBe(false);
  });
});

describe('attestation — checkDepositableAttestation (gate export)', () => {
  const validAttested = buildReportAttestation({
    userId: 'user-1',
    synthesis: SYNTHESIS,
    confirmedSectionIds: [...HIGH_RISK_SECTION_IDS],
  });
  const attestation = 'attestation' in validAttested ? validAttested.attestation : null;
  const newGenMetadata = { generationSnapshot: { generatedAt: 'x' } };

  it('should always allow mode=lavoro', () => {
    const report = { report_status: 'definitivo', synthesis: SYNTHESIS, generation_metadata: newGenMetadata };
    expect(checkDepositableAttestation(report, 'lavoro').ok).toBe(true);
  });

  it('should allow a bozza (esce col watermark, nessun blocco)', () => {
    const report = { report_status: 'bozza', synthesis: SYNTHESIS, generation_metadata: newGenMetadata };
    expect(checkDepositableAttestation(report, 'depositabile').ok).toBe(true);
  });

  it('should allow legacy reports without generationSnapshot (no retro-gate)', () => {
    const report = { report_status: 'definitivo', synthesis: SYNTHESIS, generation_metadata: {} };
    expect(checkDepositableAttestation(report, 'depositabile').ok).toBe(true);
  });

  it('should allow a definitivo with a VALID attestation', () => {
    const report = {
      report_status: 'definitivo',
      synthesis: SYNTHESIS,
      generation_metadata: { ...newGenMetadata, attestation },
    };
    expect(checkDepositableAttestation(report, 'depositabile').ok).toBe(true);
  });

  it('should block a definitivo edited AFTER the attestation', () => {
    const report = {
      report_status: 'definitivo',
      synthesis: `${SYNTHESIS} modificato dopo approvazione`,
      generation_metadata: { ...newGenMetadata, attestation },
    };
    const check = checkDepositableAttestation(report, 'depositabile');
    expect(check.ok).toBe(false);
    if (!check.ok) expect(check.message).toContain('Riapprova');
  });

  it('should block a new-gen definitivo with NO attestation at all', () => {
    const report = { report_status: 'definitivo', synthesis: SYNTHESIS, generation_metadata: newGenMetadata };
    expect(checkDepositableAttestation(report, 'depositabile').ok).toBe(false);
  });

  it('should allow when report row is missing entirely', () => {
    expect(checkDepositableAttestation(null, 'depositabile').ok).toBe(true);
  });
});
