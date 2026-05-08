import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ExtractedExpenseItem } from './expense-extractor';

// Mock Mistral client
const mockStreamMistralChat = vi.fn();
vi.mock('@/lib/mistral/client', () => ({
  MISTRAL_MODELS: { MISTRAL_LARGE: 'mistral-large-latest' },
  streamMistralChat: (...args: unknown[]) => mockStreamMistralChat(...args),
  TIMEOUT_EXTRACTION: 180_000,
  DETERMINISTIC_SEED: 42,
  assertNotTruncated: vi.fn(),
}));

// Import after mock
const { extractExpensesFromOcr } = await import('./expense-extractor');

function mockLlmResult(items: Partial<ExtractedExpenseItem>[]): void {
  mockStreamMistralChat.mockResolvedValueOnce({
    content: JSON.stringify({ items }),
    usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
    finishReason: 'stop',
  });
}

describe('expense-extractor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return empty result for empty OCR text', async () => {
    const result = await extractExpensesFromOcr('');
    expect(result.items).toHaveLength(0);
    expect(result.totalAmount).toBeNull();
    expect(mockStreamMistralChat).not.toHaveBeenCalled();
  });

  it('should return empty result for very short OCR text', async () => {
    const result = await extractExpensesFromOcr('abc');
    expect(result.items).toHaveLength(0);
    expect(mockStreamMistralChat).not.toHaveBeenCalled();
  });

  it('should extract structured expense items from LLM response', async () => {
    mockLlmResult([
      {
        date: '2025-10-22',
        description: 'Visita ortopedica',
        amount: 150.00,
        receiptNumber: 'FAT-2025-001',
        drugType: null,
        category: 'visite_specialistiche',
        facility: 'Poliambulatorio Verona',
        linkedDiagnosis: 'Frattura radio distale',
        isJustified: null,
        notes: 'Privato',
      },
      {
        date: '2025-10-23',
        description: 'Paracetamolo 1000mg',
        amount: 5.90,
        receiptNumber: 'SC-45678',
        drugType: 'Paracetamolo',
        category: 'farmaci',
        facility: 'Farmacia Comunale',
        linkedDiagnosis: 'Frattura radio distale',
        isJustified: null,
        notes: 'OTC',
      },
    ]);

    const result = await extractExpensesFromOcr('Fattura n. FAT-2025-001 del 22/10/2025 Visita ortopedica € 150,00');

    expect(result.items).toHaveLength(2);
    expect(result.totalAmount).toBeCloseTo(155.90);
    expect(result.currency).toBe('EUR');

    // Check first item
    expect(result.items[0].date).toBe('2025-10-22');
    expect(result.items[0].amount).toBe(150.00);
    expect(result.items[0].receiptNumber).toBe('FAT-2025-001');
    expect(result.items[0].category).toBe('visite_specialistiche');

    // Check second item
    expect(result.items[1].drugType).toBe('Paracetamolo');
    expect(result.items[1].category).toBe('farmaci');
  });

  it('should always set isJustified to null — congruità is for the medical expert', async () => {
    mockLlmResult([
      {
        date: '2025-11-01',
        description: 'RX polso',
        amount: 45.00,
        category: 'esami_diagnostici',
        isJustified: true as unknown as null, // LLM might return true, we must override
      },
    ]);

    const result = await extractExpensesFromOcr('RX polso destro € 45,00');

    expect(result.items[0].isJustified).toBeNull();
  });

  it('should handle null amounts gracefully', async () => {
    mockLlmResult([
      {
        date: '2025-12-10',
        description: 'Fisioterapia 10 sedute',
        amount: null,
        category: 'riabilitazione',
      },
    ]);

    const result = await extractExpensesFromOcr('Programma riabilitativo: 10 sedute FKT');

    expect(result.items[0].amount).toBeNull();
    expect(result.totalAmount).toBeNull();
  });

  it('should default unknown categories to altro', async () => {
    mockLlmResult([
      {
        date: '2025-10-22',
        description: 'Test item',
        amount: 10.00,
        category: 'invalid_category' as unknown as ExtractedExpenseItem['category'],
      },
    ]);

    const result = await extractExpensesFromOcr('Some expense document text here');

    expect(result.items[0].category).toBe('altro');
  });

  it('should handle malformed LLM response gracefully', async () => {
    mockStreamMistralChat.mockResolvedValueOnce({
      content: 'This is not JSON at all',
      usage: { promptTokens: 100, completionTokens: 10, totalTokens: 110 },
      finishReason: 'stop',
    });

    const result = await extractExpensesFromOcr('Some expense document text here');

    expect(result.items).toHaveLength(0);
    expect(result.totalAmount).toBeNull();
  });

  it('should sort items by date', async () => {
    mockLlmResult([
      { date: '2025-12-10', description: 'Third', amount: 30.00, category: 'altro' },
      { date: '2025-10-22', description: 'First', amount: 10.00, category: 'altro' },
      { date: '2025-11-15', description: 'Second', amount: 20.00, category: 'altro' },
    ]);

    const result = await extractExpensesFromOcr('Multiple expense documents');

    expect(result.items[0].description).toBe('First');
    expect(result.items[1].description).toBe('Second');
    expect(result.items[2].description).toBe('Third');
  });

  it('should pass diagnosis context to LLM when provided', async () => {
    mockLlmResult([]);

    await extractExpensesFromOcr('Fattura medica del 22/10/2025 per visita specialistica', 'Frattura composta radio distale destro');

    expect(mockStreamMistralChat).toHaveBeenCalledTimes(1);
    const callArgs = mockStreamMistralChat.mock.calls[0][0];
    expect(callArgs.messages[1].content).toContain('Frattura composta radio distale destro');
  });

  it('should truncate very long OCR text', async () => {
    mockLlmResult([]);

    const longText = 'A'.repeat(160_000);
    await extractExpensesFromOcr(longText);

    const callArgs = mockStreamMistralChat.mock.calls[0][0];
    expect(callArgs.messages[1].content).toContain('[... testo troncato');
    // Should be capped around 150K + prompt overhead
    expect(callArgs.messages[1].content.length).toBeLessThan(155_000);
  });

  it('should handle negative amounts by setting to null', async () => {
    mockLlmResult([
      { date: '2025-10-22', description: 'Refund', amount: -50.00, category: 'altro' },
      { date: '2025-10-23', description: 'Valid', amount: 10.00, category: 'altro' },
    ]);

    const result = await extractExpensesFromOcr('Rimborso spesa medica del 22/10/2025 nota credito');

    // First item has null amount (negative was rejected)
    expect(result.items[0].amount).toBeNull();
    // Second item has valid amount
    expect(result.items[1].amount).toBe(10.00);
  });
});
