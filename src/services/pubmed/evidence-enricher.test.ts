import { describe, it, expect, vi, beforeEach } from 'vitest';
import { enrichWithPubMedEvidence } from './evidence-enricher';

// Mock the PubMed client
vi.mock('./pubmed-client', () => ({
  searchPubMed: vi.fn(),
}));

import { searchPubMed } from './pubmed-client';

const mockSearchPubMed = vi.mocked(searchPubMed);

describe('evidence-enricher', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return empty array when no events have diagnoses', async () => {
    const events = [
      { title: 'Visita', description: 'Controllo', diagnosis: null },
      { title: 'Esame', description: 'Sangue', diagnosis: null },
    ];

    const result = await enrichWithPubMedEvidence(events, 'ortopedica');
    expect(result).toEqual([]);
    expect(mockSearchPubMed).not.toHaveBeenCalled();
  });

  it('should skip diagnoses shorter than 3 characters', async () => {
    const events = [
      { title: 'Visita', description: 'Test', diagnosis: 'ab' },
      { title: 'Esame', description: 'Test', diagnosis: '' },
    ];

    const result = await enrichWithPubMedEvidence(events, 'ortopedica');
    expect(result).toEqual([]);
    expect(mockSearchPubMed).not.toHaveBeenCalled();
  });

  it('should search for top 3 most frequent diagnoses', async () => {
    const events = [
      { title: 'E1', description: 'D1', diagnosis: 'Frattura femore' },
      { title: 'E2', description: 'D2', diagnosis: 'Frattura femore' },
      { title: 'E3', description: 'D3', diagnosis: 'Frattura femore' },
      { title: 'E4', description: 'D4', diagnosis: 'Ernia discale' },
      { title: 'E5', description: 'D5', diagnosis: 'Ernia discale' },
      { title: 'E6', description: 'D6', diagnosis: 'Cervicalgia' },
      { title: 'E7', description: 'D7', diagnosis: 'Lombalgia' }, // 4th unique — excluded
    ];

    mockSearchPubMed.mockResolvedValue([
      { pmid: '1', title: 'Article', authors: 'A', journal: 'J', year: '2024' },
    ]);

    const result = await enrichWithPubMedEvidence(events, 'ortopedica');

    // Should search 3 times: frattura femore, ernia discale, cervicalgia
    expect(mockSearchPubMed).toHaveBeenCalledTimes(3);
    expect(result).toHaveLength(3);
    // First search should be for most frequent diagnosis
    expect(result[0].query).toBe('frattura femore');
  });

  it('should use case-type-specific search terms', async () => {
    const events = [
      { title: 'E1', description: 'D1', diagnosis: 'Tumore polmonare' },
    ];

    mockSearchPubMed.mockResolvedValue([]);

    await enrichWithPubMedEvidence(events, 'oncologica');

    expect(mockSearchPubMed).toHaveBeenCalledWith(
      expect.stringContaining('oncology prognosis'),
      5,
    );
  });

  it('should continue when one search fails', async () => {
    const events = [
      { title: 'E1', description: 'D1', diagnosis: 'Frattura femore' },
      { title: 'E2', description: 'D2', diagnosis: 'Ernia discale' },
    ];

    mockSearchPubMed
      .mockRejectedValueOnce(new Error('Network error'))
      .mockResolvedValueOnce([
        { pmid: '1', title: 'Article', authors: 'A', journal: 'J', year: '2024' },
      ]);

    const result = await enrichWithPubMedEvidence(events, 'ortopedica');

    // Should have 1 result (the second search succeeded)
    expect(result).toHaveLength(1);
    expect(result[0].query).toBe('ernia discale');
  });

  it('should exclude results with no articles', async () => {
    const events = [
      { title: 'E1', description: 'D1', diagnosis: 'Frattura femore' },
    ];

    mockSearchPubMed.mockResolvedValue([]);

    const result = await enrichWithPubMedEvidence(events, 'ortopedica');
    expect(result).toEqual([]);
  });

  it('should handle non-string diagnosis gracefully', async () => {
    const events = [
      { title: 'E1', description: 'D1', diagnosis: 123 as unknown as string },
      { title: 'E2', description: 'D2', diagnosis: null },
    ];

    const result = await enrichWithPubMedEvidence(events, 'ortopedica');
    expect(result).toEqual([]);
  });

  it('should deduplicate diagnoses case-insensitively', async () => {
    const events = [
      { title: 'E1', description: 'D1', diagnosis: 'Frattura Femore' },
      { title: 'E2', description: 'D2', diagnosis: 'frattura femore' },
      { title: 'E3', description: 'D3', diagnosis: 'FRATTURA FEMORE' },
    ];

    mockSearchPubMed.mockResolvedValue([
      { pmid: '1', title: 'Article', authors: 'A', journal: 'J', year: '2024' },
    ]);

    const result = await enrichWithPubMedEvidence(events, 'ortopedica');

    // Should search only once (all variants are the same diagnosis)
    expect(mockSearchPubMed).toHaveBeenCalledTimes(1);
    expect(result).toHaveLength(1);
  });
});
