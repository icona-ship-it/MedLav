import { describe, it, expect } from 'vitest';
import { DOCUMENT_TYPE_LABELS, getDocumentTypeLabel } from './document-type-labels';

describe('getDocumentTypeLabel', () => {
  it('returns the Italian label for a known type', () => {
    expect(getDocumentTypeLabel('cartella_clinica')).toBe('Cartella Clinica');
    expect(getDocumentTypeLabel('esame_laboratorio')).toBe('Esame di Laboratorio');
  });

  it('covers every classifier type (no missing label)', () => {
    const classifierTypes = [
      'cartella_clinica', 'referto_specialistico', 'esame_strumentale',
      'esame_laboratorio', 'lettera_dimissione', 'certificato',
      'perizia_precedente', 'spese_mediche', 'memoria_difensiva',
      'perizia_ctp', 'perizia_ctu', 'altro',
    ];
    for (const t of classifierTypes) {
      expect(DOCUMENT_TYPE_LABELS[t], t).toBeDefined();
    }
  });

  it('falls back to the raw type for an unknown value', () => {
    expect(getDocumentTypeLabel('tipo_inesistente')).toBe('tipo_inesistente');
  });
});
