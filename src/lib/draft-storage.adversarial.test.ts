/**
 * Adversarial tests for draft-storage.
 * Tests boundary conditions, malicious data, and extreme scenarios.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { saveDraft, getDraft, clearDraft, isDraftNewer, isDraftFromOtherTab } from './draft-storage';

const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => { store[key] = value; }),
    removeItem: vi.fn((key: string) => { delete store[key]; }),
    clear: () => { store = {}; },
  };
})();

Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock });

describe('draft-storage — adversarial', () => {
  beforeEach(() => {
    localStorageMock.clear();
    vi.clearAllMocks();
  });

  it('should handle caseId with special characters', () => {
    const weirdId = 'case-with-special/chars?query=true&foo=bar';
    saveDraft(weirdId, 'Content');
    const draft = getDraft(weirdId);
    expect(draft).not.toBeNull();
    expect(draft!.content).toBe('Content');
  });

  it('should handle very large content (1MB+)', () => {
    const largeContent = 'x'.repeat(1_000_000);
    saveDraft('large-case', largeContent);
    const draft = getDraft('large-case');
    expect(draft).not.toBeNull();
    expect(draft!.content.length).toBe(1_000_000);
  });

  it('should handle content with JSON-breaking characters', () => {
    const dangerousContent = '{"key": "value"}\n"quotes"\ttabs\r\nnewlines\\backslashes';
    saveDraft('json-break', dangerousContent);
    const draft = getDraft('json-break');
    expect(draft).not.toBeNull();
    expect(draft!.content).toBe(dangerousContent);
  });

  it('should handle empty caseId', () => {
    saveDraft('', 'Content');
    const draft = getDraft('');
    expect(draft).not.toBeNull();
    expect(draft!.content).toBe('Content');
  });

  it('should handle content with null bytes', () => {
    const nullContent = 'before\x00after';
    saveDraft('null-bytes', nullContent);
    const draft = getDraft('null-bytes');
    expect(draft).not.toBeNull();
  });

  it('should handle localStorage.setItem throwing (quota exceeded)', () => {
    localStorageMock.setItem.mockImplementationOnce(() => {
      throw new DOMException('QuotaExceededError', 'QuotaExceededError');
    });
    // Should not throw
    expect(() => saveDraft('full-case', 'Content')).not.toThrow();
  });

  it('should handle localStorage.getItem throwing', () => {
    localStorageMock.getItem.mockImplementationOnce(() => {
      throw new Error('SecurityError');
    });
    expect(getDraft('error-case')).toBeNull();
  });

  it('should handle localStorage.removeItem throwing', () => {
    localStorageMock.removeItem.mockImplementationOnce(() => {
      throw new Error('SecurityError');
    });
    expect(() => clearDraft('error-case')).not.toThrow();
  });

  it('should handle tampered localStorage data (missing fields)', () => {
    localStorageMock.setItem('legmed-draft-tampered', JSON.stringify({ content: 'ok' }));
    localStorageMock.getItem.mockReturnValueOnce(JSON.stringify({ content: 'ok' }));
    // Missing savedAt — should return null
    const draft = getDraft('tampered');
    expect(draft).toBeNull();
  });

  it('should handle tampered localStorage data (wrong types)', () => {
    const tampered = JSON.stringify({ content: 12345, savedAt: true, tabId: null });
    localStorageMock.setItem('legmed-draft-types', tampered);
    localStorageMock.getItem.mockReturnValueOnce(tampered);
    // content is truthy (number 12345), savedAt is truthy (true)
    // getDraft uses if (!draft.content || !draft.savedAt) which treats these as valid
    const draft = getDraft('types');
    // This reveals the draft will be returned even with wrong types
    // Not a security issue, but documents the behavior
    expect(draft).not.toBeNull();
  });

  it('should handle isDraftNewer with invalid date strings', () => {
    saveDraft('date-test', 'Content');
    // Invalid date string — Date constructor returns NaN
    const result = isDraftNewer('date-test', 'not-a-date');
    // NaN comparison: new Date(draft.savedAt) > new Date('not-a-date') === NaN > NaN === false
    expect(result).toBe(false);
  });

  it('should handle isDraftFromOtherTab when draft has no tabId (legacy format)', () => {
    const legacyDraft = JSON.stringify({ content: 'old', savedAt: '2025-01-01T00:00:00Z' });
    localStorageMock.setItem('legmed-draft-legacy', legacyDraft);
    localStorageMock.getItem.mockReturnValueOnce(legacyDraft);
    // No tabId → should not be treated as "other tab"
    const result = isDraftFromOtherTab('legacy');
    expect(result).toBe(false);
  });

  it('should handle rapid successive saves (last one wins)', () => {
    saveDraft('rapid', 'First');
    saveDraft('rapid', 'Second');
    saveDraft('rapid', 'Third');
    const draft = getDraft('rapid');
    expect(draft!.content).toBe('Third');
  });

  it('should handle clearDraft on non-existent draft', () => {
    expect(() => clearDraft('nonexistent')).not.toThrow();
  });
});
