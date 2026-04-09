import { describe, it, expect } from 'vitest';
import { _filterOcrForSection_test as filterOcrForSection, _EXCLUDED_FROM_MEDICAL_test as EXCLUDED_FROM_MEDICAL } from './section-generator';
import type { SectionSpec } from './section-generation-types';
import type { DocumentOcrContext } from '@/inngest/steps/types';

// ── Helpers ──────────────────────────────────────────────────────────

function makeDoc(documentType: string, id?: string): DocumentOcrContext {
  return {
    documentId: id ?? `doc-${documentType}`,
    fileName: `${documentType}.pdf`,
    documentType,
    pages: [{ pageNumber: 1, ocrText: 'Sample OCR text' }],
    totalChars: 15,
  };
}

function makeSectionSpec(overrides: Partial<SectionSpec>): SectionSpec {
  return {
    id: 'test-section',
    title: 'Test Section',
    maxTokens: 4000,
    dataSources: [],
    contextMaxChars: 500,
    needsOcr: true,
    isPlaceholder: false,
    promptDirective: 'test directive',
    ...overrides,
  };
}

// ── Tests ────────────────────────────────────────────────────────────

describe('filterOcrForSection', () => {
  // All possible document types in the system
  const allDocTypes = [
    'cartella_clinica',
    'referto_specialistico',
    'esame_strumentale',
    'esame_laboratorio',
    'lettera_dimissione',
    'certificato',
    'perizia_precedente',
    'spese_mediche',
    'memoria_difensiva',
    'perizia_ctp',
    'perizia_ctu',
    'altro',
    'misto',
  ];

  const allDocs = allDocTypes.map((t) => makeDoc(t));

  describe('documentazione_sanitaria section', () => {
    const spec = makeSectionSpec({
      id: 'documentazione_sanitaria',
      dataSources: ['events-medical'],
    });

    it('should include all standard medical document types', () => {
      const medicalTypes = [
        'cartella_clinica',
        'referto_specialistico',
        'esame_strumentale',
        'esame_laboratorio',
        'lettera_dimissione',
      ];

      const result = filterOcrForSection(spec, allDocs);
      const resultTypes = result.map((d) => d.documentType);

      for (const type of medicalTypes) {
        expect(resultTypes).toContain(type);
      }
    });

    it('should include "altro" and "misto" (universal types)', () => {
      const result = filterOcrForSection(spec, allDocs);
      const resultTypes = result.map((d) => d.documentType);

      expect(resultTypes).toContain('altro');
      expect(resultTypes).toContain('misto');
    });

    it('should include documents with unknown/new types — never lose medical data', () => {
      const unknownDoc = makeDoc('pronto_soccorso');
      const result = filterOcrForSection(spec, [unknownDoc]);

      expect(result).toHaveLength(1);
      expect(result[0].documentType).toBe('pronto_soccorso');
    });

    it('should include any future document type not in the exclusion list', () => {
      const futureTypes = ['referto_controllo', 'visita_domiciliare', 'teleconsulto', 'day_hospital'];
      const futureDocs = futureTypes.map((t) => makeDoc(t));

      const result = filterOcrForSection(spec, futureDocs);

      expect(result).toHaveLength(futureTypes.length);
    });

    it('should exclude non-medical types', () => {
      const result = filterOcrForSection(spec, allDocs);
      const resultTypes = new Set(result.map((d) => d.documentType));

      expect(resultTypes.has('memoria_difensiva')).toBe(false);
      expect(resultTypes.has('certificato')).toBe(false);
      expect(resultTypes.has('perizia_precedente')).toBe(false);
      expect(resultTypes.has('perizia_ctp')).toBe(false);
      expect(resultTypes.has('perizia_ctu')).toBe(false);
      expect(resultTypes.has('spese_mediche')).toBe(false);
    });

    it('should exclude documento_amministrativo', () => {
      const doc = makeDoc('documento_amministrativo');
      const result = filterOcrForSection(spec, [doc]);

      expect(result).toHaveLength(0);
    });
  });

  describe('documentazione_atti section', () => {
    const spec = makeSectionSpec({
      id: 'documentazione_atti',
      dataSources: ['events-non-medical'],
    });

    it('should include non-medical types', () => {
      const result = filterOcrForSection(spec, allDocs);
      const resultTypes = result.map((d) => d.documentType);

      expect(resultTypes).toContain('memoria_difensiva');
      expect(resultTypes).toContain('certificato');
      expect(resultTypes).toContain('altro');
      expect(resultTypes).toContain('misto');
    });

    it('should not include medical types', () => {
      const result = filterOcrForSection(spec, allDocs);
      const resultTypes = new Set(result.map((d) => d.documentType));

      expect(resultTypes.has('cartella_clinica')).toBe(false);
      expect(resultTypes.has('referto_specialistico')).toBe(false);
    });
  });

  describe('pareri_tecnici section', () => {
    const spec = makeSectionSpec({
      id: 'pareri_tecnici',
      dataSources: ['events-perizie'],
    });

    it('should include perizia types', () => {
      const result = filterOcrForSection(spec, allDocs);
      const resultTypes = result.map((d) => d.documentType);

      expect(resultTypes).toContain('perizia_precedente');
      expect(resultTypes).toContain('perizia_ctp');
      expect(resultTypes).toContain('perizia_ctu');
      expect(resultTypes).toContain('altro');
    });
  });

  describe('spese_mediche section', () => {
    const spec = makeSectionSpec({
      id: 'spese_mediche',
      dataSources: ['events-expenses'],
    });

    it('should include only spese_mediche and universal types', () => {
      const result = filterOcrForSection(spec, allDocs);
      const resultTypes = result.map((d) => d.documentType);

      expect(resultTypes).toContain('spese_mediche');
      expect(resultTypes).toContain('altro');
      expect(resultTypes).toContain('misto');
      expect(resultTypes).not.toContain('cartella_clinica');
      expect(resultTypes).not.toContain('memoria_difensiva');
    });
  });

  describe('default (unknown section)', () => {
    const spec = makeSectionSpec({
      id: 'conclusioni',
      dataSources: ['context-summaries'],
    });

    it('should return all documents', () => {
      const result = filterOcrForSection(spec, allDocs);

      expect(result).toHaveLength(allDocs.length);
    });
  });

  describe('EXCLUDED_FROM_MEDICAL completeness', () => {
    it('should contain all non-medical types from the DB enum', () => {
      const expectedExcluded = [
        'memoria_difensiva',
        'documento_amministrativo',
        'certificato',
        'perizia_precedente',
        'perizia_ctp',
        'perizia_ctu',
        'spese_mediche',
      ];

      for (const type of expectedExcluded) {
        expect(EXCLUDED_FROM_MEDICAL.has(type)).toBe(true);
      }
    });

    it('should NOT contain any medical types', () => {
      const medicalTypes = [
        'cartella_clinica',
        'referto_specialistico',
        'esame_strumentale',
        'esame_laboratorio',
        'lettera_dimissione',
        'altro',
        'misto',
      ];

      for (const type of medicalTypes) {
        expect(EXCLUDED_FROM_MEDICAL.has(type)).toBe(false);
      }
    });
  });
});
