import { describe, it, expect } from 'vitest';
import { anonymizeText } from './anonymizer';

describe('anonymizer', () => {
  describe('anonymizeText', () => {
    it('should replace Italian codice fiscale', () => {
      const result = anonymizeText({
        text: 'Il paziente RSSMRA80A01H501Z si è presentato in data 01.01.2024',
      });
      expect(result.anonymizedText).not.toContain('RSSMRA80A01H501Z');
      expect(result.anonymizedText).toContain('[CF OMESSO]');
      expect(result.replacementCount).toBeGreaterThan(0);
    });

    it('should replace Italian phone numbers', () => {
      const result = anonymizeText({
        text: 'Contattare il paziente al +39 333 123 4567 o allo 02 1234567',
      });
      expect(result.anonymizedText).not.toContain('333');
      expect(result.anonymizedText).toContain('[TELEFONO OMESSO]');
    });

    it('should replace email addresses', () => {
      const result = anonymizeText({
        text: 'Email: mario.rossi@email.com per comunicazioni',
      });
      expect(result.anonymizedText).not.toContain('mario.rossi@email.com');
      expect(result.anonymizedText).toContain('[EMAIL OMESSA]');
    });

    it('should replace professional title + name patterns', () => {
      const result = anonymizeText({
        text: 'Il Dott. Mario Rossi ha visitato la paziente. La Prof.ssa Anna Bianchi ha refertato.',
      });
      expect(result.anonymizedText).not.toContain('Mario Rossi');
      expect(result.anonymizedText).not.toContain('Anna Bianchi');
    });

    it('should replace names from perizia metadata', () => {
      const result = anonymizeText({
        text: 'Il sig. Giovanni Verdi (parte ricorrente) vs ASST Spedali Civili di Brescia (parte resistente)',
        periziaMetadata: {
          parteRicorrente: 'Giovanni Verdi',
          parteResistente: 'ASST Spedali Civili di Brescia',
        },
      });
      expect(result.anonymizedText).not.toContain('Giovanni Verdi');
      expect(result.anonymizedText).not.toContain('ASST Spedali Civili di Brescia');
      expect(result.anonymizedText).toContain('PARTE RICORRENTE');
      expect(result.anonymizedText).toContain('PARTE RESISTENTE');
    });

    it('should return replacement count and list', () => {
      const result = anonymizeText({
        text: 'CF: RSSMRA80A01H501Z, email: test@test.com',
      });
      expect(result.replacementCount).toBe(2);
      expect(result.replacements).toHaveLength(2);
      expect(result.replacements[0].type).toBeDefined();
    });

    it('should not modify text without PII', () => {
      const text = 'Il paziente presenta frattura del femore prossimale destro.';
      const result = anonymizeText({ text });
      expect(result.anonymizedText).toBe(text);
      expect(result.replacementCount).toBe(0);
    });

    it('should handle empty text', () => {
      const result = anonymizeText({ text: '' });
      expect(result.anonymizedText).toBe('');
      expect(result.replacementCount).toBe(0);
    });

    it('should replace CTU name from metadata', () => {
      const result = anonymizeText({
        text: 'Il CTU Dott. Nicola Pigaiani ha effettuato le operazioni peritali',
        periziaMetadata: {
          ctuName: 'Dott. Nicola Pigaiani',
        },
      });
      expect(result.anonymizedText).not.toContain('Nicola Pigaiani');
      expect(result.anonymizedText).toContain('[CTU]');
    });
  });
});
