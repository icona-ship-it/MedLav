import { describe, it, expect } from 'vitest';
import { ROLE_STRATEGIES, formatRoleDirectiveForPrompt, getRoleStrategy } from './role-prompts';

describe('role-prompts', () => {
  describe('OBJECTIVE_ANOMALY_FRAMING placement constraint', () => {
    it('the anomalyFraming must restrict the FATTO/STANDARD pattern to dedicated sections', () => {
      // Regression: the anomaly framing pattern leaked into documentazione_sanitaria
      // and produced biased "Profili critici" sub-sections inside the chronology.
      // The framing must explicitly state it's only for anomaly/considerazioni sections.
      const framing = ROLE_STRATEGIES.stragiudiziale.anomalyFraming;
      expect(framing).toMatch(/VINCOLO DI POSIZIONAMENTO/);
      expect(framing).toMatch(/VIETATO usarlo nella sezione "Documentazione Sanitaria"/i);
    });
  });

  describe('stragiudiziale extraSections', () => {
    it('must NOT inject "QUADRO DOCUMENTALE COMPLESSIVO" into the report (regression)', () => {
      // The extra section was creating biased favorable/unfavorable narrative inside
      // the chronology. Anomalies have their own dedicated output section.
      expect(ROLE_STRATEGIES.stragiudiziale.extraSections).toBe('');
    });
  });

  describe('formatRoleDirectiveForPrompt', () => {
    it('omits the SEZIONI AGGIUNTIVE block when extraSections is empty', () => {
      const directive = formatRoleDirectiveForPrompt('stragiudiziale');
      expect(directive).not.toMatch(/SEZIONI AGGIUNTIVE RICHIESTE/);
    });

    it('produces a non-empty directive', () => {
      const out = formatRoleDirectiveForPrompt('stragiudiziale');
      expect(out.length).toBeGreaterThan(200);
      expect(out).toContain('## RUOLO E PROSPETTIVA');
      expect(out).toContain('## CRITERI DI ENFASI');
      expect(out).toContain('## COME PRESENTARE I PROFILI CRITICI');
    });
  });

  describe('getRoleStrategy', () => {
    it('returns the correct strategy per role', () => {
      expect(getRoleStrategy('stragiudiziale').role).toBe('stragiudiziale');
    });
  });
});
