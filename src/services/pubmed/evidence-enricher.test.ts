import { describe, it, expect, vi, beforeEach } from 'vitest';
import { enrichWithPubMedEvidence, enrichWithFullEvidence } from './evidence-enricher';

// Mock the PubMed client
vi.mock('./pubmed-client', () => ({
  searchPubMed: vi.fn(),
}));

import { searchPubMed } from './pubmed-client';

const mockSearchPubMed = vi.mocked(searchPubMed);

const MOCK_ARTICLE = { pmid: '1', title: 'Article', authors: 'A', journal: 'J', year: '2024' };

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

  it('should search for top 2 most frequent diagnoses', async () => {
    const events = [
      { title: 'E1', description: 'D1', diagnosis: 'Frattura femore' },
      { title: 'E2', description: 'D2', diagnosis: 'Frattura femore' },
      { title: 'E3', description: 'D3', diagnosis: 'Frattura femore' },
      { title: 'E4', description: 'D4', diagnosis: 'Ernia discale' },
      { title: 'E5', description: 'D5', diagnosis: 'Ernia discale' },
      { title: 'E6', description: 'D6', diagnosis: 'Cervicalgia' }, // 3rd unique — excluded
      { title: 'E7', description: 'D7', diagnosis: 'Lombalgia' }, // 4th unique — excluded
    ];

    mockSearchPubMed.mockResolvedValue([MOCK_ARTICLE]);

    const result = await enrichWithPubMedEvidence(events, 'ortopedica');

    // Should search 2 times: frattura femore, ernia discale
    expect(mockSearchPubMed).toHaveBeenCalledTimes(2);
    expect(result).toHaveLength(2);
    // First search should be for most frequent diagnosis
    expect(result[0].query).toBe('frattura femore');
    expect(result[0].category).toBe('diagnosis');
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
      .mockResolvedValueOnce([MOCK_ARTICLE]);

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

    mockSearchPubMed.mockResolvedValue([MOCK_ARTICLE]);

    const result = await enrichWithPubMedEvidence(events, 'ortopedica');

    // Should search only once (all variants are the same diagnosis)
    expect(mockSearchPubMed).toHaveBeenCalledTimes(1);
    expect(result).toHaveLength(1);
  });
});

describe('enrichWithFullEvidence', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should extract treatment searches from intervento/terapia events', async () => {
    const events = [
      { title: 'Artroscopia ginocchio', description: 'Intervento', diagnosis: 'Lesione menisco', event_type: 'intervento' },
      { title: 'Fisioterapia riabilitativa', description: 'Terapia', diagnosis: null, event_type: 'terapia' },
      { title: 'Visita ortopedica', description: 'Controllo', diagnosis: 'Lesione menisco', event_type: 'visita' },
    ];

    mockSearchPubMed.mockResolvedValue([MOCK_ARTICLE]);

    const result = await enrichWithFullEvidence(events, [], 'ortopedica');

    // 1 diagnosis (lesione menisco) + 2 treatments (artroscopia, fisioterapia)
    expect(mockSearchPubMed).toHaveBeenCalledTimes(3);

    const treatmentResults = result.filter((r) => r.category === 'treatment');
    expect(treatmentResults).toHaveLength(2);
    expect(treatmentResults[0].query).toBe('artroscopia ginocchio');
    expect(treatmentResults[1].query).toBe('fisioterapia riabilitativa');
  });

  it('should search treatment with correct query format', async () => {
    const events = [
      { title: 'Artroscopia ginocchio', description: 'Op', diagnosis: null, event_type: 'intervento' },
    ];

    mockSearchPubMed.mockResolvedValue([MOCK_ARTICLE]);

    await enrichWithFullEvidence(events, [], 'ortopedica');

    expect(mockSearchPubMed).toHaveBeenCalledWith(
      '"artroscopia ginocchio" AND (outcomes OR complications OR "evidence based")',
      5,
    );
  });

  it('should trigger causal nexus search only when anomalies are present', async () => {
    const events = [
      { title: 'E1', description: 'D1', diagnosis: 'Frattura femore', event_type: 'visita' },
    ];
    const anomalies = [
      { anomalyType: 'delayed_diagnosis', description: 'Ritardo diagnostico di 3 mesi' },
    ];

    mockSearchPubMed.mockResolvedValue([MOCK_ARTICLE]);

    const result = await enrichWithFullEvidence(events, anomalies, 'ortopedica');

    const nexusResults = result.filter((r) => r.category === 'causal_nexus');
    expect(nexusResults).toHaveLength(1);
    expect(nexusResults[0].query).toContain('fracture femore');
    expect(nexusResults[0].query).toContain('Ritardo diagnostico di 3 mesi');
  });

  it('should NOT trigger causal nexus search when anomalies array is empty', async () => {
    const events = [
      { title: 'E1', description: 'D1', diagnosis: 'Frattura femore', event_type: 'visita' },
    ];

    mockSearchPubMed.mockResolvedValue([MOCK_ARTICLE]);

    const result = await enrichWithFullEvidence(events, [], 'ortopedica');

    const nexusResults = result.filter((r) => r.category === 'causal_nexus');
    expect(nexusResults).toHaveLength(0);
  });

  it('should set category field correctly on all results', async () => {
    const events = [
      { title: 'E1', description: 'D1', diagnosis: 'Frattura femore', event_type: 'visita' },
      { title: 'Artroscopia', description: 'Op', diagnosis: null, event_type: 'intervento' },
    ];
    const anomalies = [
      { anomalyType: 'delayed_diagnosis', description: 'Ritardo' },
    ];

    mockSearchPubMed.mockResolvedValue([MOCK_ARTICLE]);

    const result = await enrichWithFullEvidence(events, anomalies, 'ortopedica');

    expect(result.find((r) => r.category === 'diagnosis')).toBeDefined();
    expect(result.find((r) => r.category === 'treatment')).toBeDefined();
    expect(result.find((r) => r.category === 'causal_nexus')).toBeDefined();
  });

  it('should never exceed 5 total searches', async () => {
    const events = [
      { title: 'E1', description: 'D1', diagnosis: 'Diagnosi A', event_type: 'visita' },
      { title: 'E2', description: 'D2', diagnosis: 'Diagnosi B', event_type: 'visita' },
      { title: 'E3', description: 'D3', diagnosis: 'Diagnosi C', event_type: 'visita' },
      { title: 'Intervento A', description: 'Op', diagnosis: null, event_type: 'intervento' },
      { title: 'Intervento B', description: 'Op', diagnosis: null, event_type: 'intervento' },
      { title: 'Intervento C', description: 'Op', diagnosis: null, event_type: 'intervento' },
      { title: 'Terapia A', description: 'T', diagnosis: null, event_type: 'terapia' },
    ];
    const anomalies = [
      { anomalyType: 'gap', description: 'Gap temporale' },
    ];

    mockSearchPubMed.mockResolvedValue([MOCK_ARTICLE]);

    await enrichWithFullEvidence(events, anomalies, 'ortopedica');

    // Max: 2 diagnosis + 2 treatment + 1 causal_nexus = 5
    expect(mockSearchPubMed).toHaveBeenCalledTimes(5);
  });

  it('should not trigger causal nexus when no diagnoses found', async () => {
    const events = [
      { title: 'Intervento', description: 'Op', diagnosis: null, event_type: 'intervento' },
    ];
    const anomalies = [
      { anomalyType: 'gap', description: 'Gap temporale' },
    ];

    mockSearchPubMed.mockResolvedValue([MOCK_ARTICLE]);

    const result = await enrichWithFullEvidence(events, anomalies, 'ortopedica');

    const nexusResults = result.filter((r) => r.category === 'causal_nexus');
    expect(nexusResults).toHaveLength(0);
  });

  it('should backward-compat: enrichWithPubMedEvidence delegates to enrichWithFullEvidence', async () => {
    const events = [
      { title: 'E1', description: 'D1', diagnosis: 'Frattura femore' },
    ];

    mockSearchPubMed.mockResolvedValue([MOCK_ARTICLE]);

    const result = await enrichWithPubMedEvidence(events, 'ortopedica');

    expect(result).toHaveLength(1);
    expect(result[0].category).toBe('diagnosis');
  });
});
