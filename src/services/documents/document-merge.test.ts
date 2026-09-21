import { describe, it, expect } from 'vitest';
import {
  partitionMergeGroups,
  suggestDocumentMergeGroups,
  type MergeableDocument,
  pendingMergeSuggestions,
  mergeSuggestionKey,
} from './document-merge';

/** Dati FITTIZI. */
function makeDoc(overrides: Partial<MergeableDocument> & { id: string }): MergeableDocument {
  return {
    fileName: 'doc.pdf',
    mergedIntoDocumentId: null,
    mergeOrder: null,
    ...overrides,
  };
}

describe('partitionMergeGroups', () => {
  it('returns all docs as standalone when nothing is merged', () => {
    const docs = [makeDoc({ id: 'a' }), makeDoc({ id: 'b' })];
    const { standalone, groups } = partitionMergeGroups(docs);
    expect(standalone).toHaveLength(2);
    expect(groups).toHaveLength(0);
  });

  it('groups secondaries under their primary, ordered by mergeOrder', () => {
    const docs = [
      makeDoc({ id: 'p', fileName: 'pag1.jpg' }),
      makeDoc({ id: 's2', fileName: 'pag3.jpg', mergedIntoDocumentId: 'p', mergeOrder: 2 }),
      makeDoc({ id: 's1', fileName: 'pag2.jpg', mergedIntoDocumentId: 'p', mergeOrder: 1 }),
      makeDoc({ id: 'x', fileName: 'altro.pdf' }),
    ];
    const { standalone, groups } = partitionMergeGroups(docs);
    expect(standalone.map((d) => d.id)).toEqual(['x']);
    expect(groups).toHaveLength(1);
    expect(groups[0].primary.id).toBe('p');
    expect(groups[0].secondaries.map((d) => d.id)).toEqual(['s1', 's2']);
  });

  it('FAIL-SAFE: a secondary whose primary is missing from the set becomes standalone (mai perdere un documento)', () => {
    const docs = [makeDoc({ id: 's', mergedIntoDocumentId: 'assente', mergeOrder: 1 })];
    const { standalone, groups } = partitionMergeGroups(docs);
    expect(standalone.map((d) => d.id)).toEqual(['s']);
    expect(groups).toHaveLength(0);
  });

  it('FAIL-SAFE: a chain (secondary pointing to another secondary) degrades to standalone', () => {
    const docs = [
      makeDoc({ id: 'a' }),
      makeDoc({ id: 'b', mergedIntoDocumentId: 'a', mergeOrder: 1 }),
      makeDoc({ id: 'c', mergedIntoDocumentId: 'b', mergeOrder: 1 }),
    ];
    const { standalone, groups } = partitionMergeGroups(docs);
    // b sta sotto a; c punta a un documento a sua volta merged → standalone
    expect(groups[0].secondaries.map((d) => d.id)).toEqual(['b']);
    expect(standalone.map((d) => d.id)).toEqual(['c']);
  });
});

describe('suggestDocumentMergeGroups — euristica foto sequenziali', () => {
  it('suggests one group for smartphone photos taken seconds apart (il caso reale: 3 foto in 15s)', () => {
    const files = [
      { id: '1', fileName: '20260818_180312.jpg' },
      { id: '2', fileName: '20260818_180320.jpg' },
      { id: '3', fileName: '20260818_180327.jpg' },
    ];
    const groups = suggestDocumentMergeGroups(files);
    expect(groups).toHaveLength(1);
    expect(groups[0].documentIds).toEqual(['1', '2', '3']);
  });

  it('does NOT suggest for photos taken far apart (giorni diversi)', () => {
    const files = [
      { id: '1', fileName: '20260818_180312.jpg' },
      { id: '2', fileName: '20260820_093000.jpg' },
    ];
    expect(suggestDocumentMergeGroups(files)).toHaveLength(0);
  });

  it('splits into separate groups when there is a long gap between bursts', () => {
    const files = [
      { id: '1', fileName: '20260818_180312.jpg' },
      { id: '2', fileName: '20260818_180320.jpg' },
      { id: '3', fileName: '20260818_183000.jpg' }, // ~27 min dopo
      { id: '4', fileName: '20260818_183005.jpg' },
    ];
    const groups = suggestDocumentMergeGroups(files);
    expect(groups).toHaveLength(2);
    expect(groups[0].documentIds).toEqual(['1', '2']);
    expect(groups[1].documentIds).toEqual(['3', '4']);
  });

  it('suggests for sequential iPhone-style IMG_nnnn names', () => {
    const files = [
      { id: 'a', fileName: 'IMG_4021.jpg' },
      { id: 'b', fileName: 'IMG_4022.jpg' },
      { id: 'c', fileName: 'IMG_4023.jpg' },
    ];
    const groups = suggestDocumentMergeGroups(files);
    expect(groups).toHaveLength(1);
    expect(groups[0].documentIds).toEqual(['a', 'b', 'c']);
  });

  it('does NOT suggest for non-consecutive IMG numbers', () => {
    const files = [
      { id: 'a', fileName: 'IMG_4021.jpg' },
      { id: 'b', fileName: 'IMG_4590.jpg' },
    ];
    expect(suggestDocumentMergeGroups(files)).toHaveLength(0);
  });

  it('ignores PDFs and non-image files', () => {
    const files = [
      { id: '1', fileName: 'referto-1.pdf' },
      { id: '2', fileName: 'referto-2.pdf' },
    ];
    expect(suggestDocumentMergeGroups(files)).toHaveLength(0);
  });

  it('handles empty and single-file input', () => {
    expect(suggestDocumentMergeGroups([])).toHaveLength(0);
    expect(suggestDocumentMergeGroups([{ id: '1', fileName: '20260818_180312.jpg' }])).toHaveLength(0);
  });

  it('already-merged documents are not suggested again', () => {
    const files = [
      { id: '1', fileName: '20260818_180312.jpg', mergedIntoDocumentId: 'x' },
      { id: '2', fileName: '20260818_180320.jpg' },
    ];
    expect(suggestDocumentMergeGroups(files)).toHaveLength(0);
  });
});

describe('suggestDocumentMergeGroups — immagini caricate insieme (collaudo 2026-09-18: nomi generici)', () => {
  const at = (s: number) => new Date(Date.UTC(2026, 8, 18, 8, 32, s)).toISOString();
  it('3 immagini con nomi generici caricate a pochi secondi → una proposta, in ordine naturale di nome', () => {
    const files = [
      { id: 'b', fileName: 'foto-2.jpg', uploadedAt: at(47) },
      { id: 'c', fileName: 'foto-10.jpg', uploadedAt: at(48) },
      { id: 'a', fileName: 'foto-1.jpg', uploadedAt: at(46) },
    ];
    const groups = suggestDocumentMergeGroups(files);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.documentIds).toEqual(['a', 'b', 'c']);
    expect(groups[0]!.reason).toContain('caricate insieme');
  });
  it('stesse immagini caricate a 10 minuti di distanza → nessuna proposta; PDF caricati insieme → nessuna proposta', () => {
    expect(suggestDocumentMergeGroups([
      { id: 'a', fileName: 'foto-1.jpg', uploadedAt: at(0) },
      { id: 'b', fileName: 'foto-2.jpg', uploadedAt: at(600) },
    ])).toHaveLength(0);
    expect(suggestDocumentMergeGroups([
      { id: 'a', fileName: 'verbale.pdf', uploadedAt: at(0) },
      { id: 'b', fileName: 'certificato.pdf', uploadedAt: at(1) },
    ])).toHaveLength(0);
  });
  it('senza data di caricamento e senza numerazione non propone nulla; una raffica con timestamp nel nome non viene riproposta dalla regola del caricamento', () => {
    expect(suggestDocumentMergeGroups([
      { id: 'a', fileName: 'foto-1.jpg' },
      { id: 'b', fileName: 'foto-2.jpg' },
    ])).toHaveLength(0);
    const groups = suggestDocumentMergeGroups([
      { id: 'a', fileName: '20260818_180312.jpg', uploadedAt: at(0) },
      { id: 'b', fileName: '20260818_180320.jpg', uploadedAt: at(1) },
      { id: 'c', fileName: 'altro.jpg', uploadedAt: at(2) },
    ]);
    expect(groups.map((g) => g.documentIds)).toEqual([['a', 'b']]);
  });
});

describe('suggestDocumentMergeGroups — documenti già uniti', () => {
  it('il capofila di un gruppo già unito non viene riproposto con altre foto caricate insieme', () => {
    const at = (s: number) => new Date(Date.UTC(2026, 8, 18, 8, 32, s)).toISOString();
    const out = suggestDocumentMergeGroups([
      { id: 'a', fileName: 'foto-1.jpg', uploadedAt: at(1) },
      { id: 'b', fileName: 'foto-2.jpg', uploadedAt: at(2), mergedIntoDocumentId: 'a' },
      { id: 'c', fileName: 'foto-3.jpg', uploadedAt: at(3) },
    ]);
    expect(out).toHaveLength(0);
  });
});

describe('pendingMergeSuggestions — cosa resta da decidere prima di proseguire', () => {
  const at = (s: number) => new Date(Date.UTC(2026, 8, 18, 8, 32, s)).toISOString();
  it('una proposta ignorata non è più pendente; una non decisa sì', () => {
    const files = [
      { id: 'a', fileName: 'foto-1.jpg', uploadedAt: at(1) }, { id: 'b', fileName: 'foto-2.jpg', uploadedAt: at(2) },
      { id: 'c', fileName: 'IMG_0001.jpg', uploadedAt: at(900) }, { id: 'd', fileName: 'IMG_0002.jpg', uploadedAt: at(901) },
    ];
    const all = pendingMergeSuggestions(files, new Set());
    expect(all).toHaveLength(2);
    const rest = pendingMergeSuggestions(files, new Set([mergeSuggestionKey(all[0]!)]));
    expect(rest).toHaveLength(1);
    expect(rest[0]!.documentIds).toEqual(all[1]!.documentIds);
  });
});
