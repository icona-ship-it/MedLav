import { describe, it, expect } from 'vitest';
import { documentsForExport, mergedDocumentsPendingReprocess } from './load-case-data';

/** File uniti (migration 0033) negli export: fail-safe "mai perdere un documento". */
describe('documentsForExport', () => {
  const primary = { id: 'p', pages: [{ pageNumber: 1, ocrText: 'a' }] };
  const absorbed = { id: 's1', mergedIntoDocumentId: 'p', pages: [] };
  const pending = { id: 's2', mergedIntoDocumentId: 'p', pages: [{ pageNumber: 1, ocrText: 'ancora qui' }] };

  it('esclude i file uniti già assorbiti (0 pagine) e tiene quelli con pagine proprie', () => {
    expect(documentsForExport([primary, absorbed, pending]).map((d) => d.id)).toEqual(['p', 's2']);
  });

  it('elenca i file uniti non ancora rielaborati', () => {
    expect(mergedDocumentsPendingReprocess([primary, absorbed, pending]).map((d) => d.id)).toEqual(['s2']);
  });

  it('righe legacy (senza campo) → invariate', () => {
    expect(documentsForExport([{ id: 'x', pages: [] }])).toHaveLength(1);
  });
});
