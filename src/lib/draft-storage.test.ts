import { describe, it, expect, beforeEach, vi } from 'vitest';
import { saveDraft, getDraft, clearDraft, isDraftNewer, isDraftFromOtherTab, getTabId } from './draft-storage';

// Mock localStorage
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

describe('draft-storage', () => {
  beforeEach(() => {
    localStorageMock.clear();
    vi.clearAllMocks();
  });

  describe('saveDraft', () => {
    it('should save draft to localStorage', () => {
      saveDraft('case-123', 'Draft content');
      expect(localStorageMock.setItem).toHaveBeenCalledWith(
        'medlav-draft-case-123',
        expect.stringContaining('"content":"Draft content"'),
      );
    });

    it('should include a timestamp and tabId', () => {
      saveDraft('case-123', 'Content');
      const call = localStorageMock.setItem.mock.calls[0][1];
      const parsed = JSON.parse(call);
      expect(parsed.savedAt).toBeDefined();
      expect(new Date(parsed.savedAt).getTime()).not.toBeNaN();
      expect(parsed.tabId).toBeDefined();
      expect(typeof parsed.tabId).toBe('string');
    });
  });

  describe('getDraft', () => {
    it('should return null when no draft exists', () => {
      expect(getDraft('nonexistent')).toBeNull();
    });

    it('should return saved draft', () => {
      saveDraft('case-456', 'Saved content');
      const draft = getDraft('case-456');
      expect(draft).not.toBeNull();
      expect(draft!.content).toBe('Saved content');
    });

    it('should return null for invalid JSON', () => {
      localStorageMock.setItem('medlav-draft-bad', 'not json');
      localStorageMock.getItem.mockReturnValueOnce('not json');
      expect(getDraft('bad')).toBeNull();
    });
  });

  describe('clearDraft', () => {
    it('should remove draft from localStorage', () => {
      saveDraft('case-789', 'Content');
      clearDraft('case-789');
      expect(localStorageMock.removeItem).toHaveBeenCalledWith('medlav-draft-case-789');
    });
  });

  describe('isDraftNewer', () => {
    it('should return false when no draft exists', () => {
      expect(isDraftNewer('no-draft', '2026-03-30T10:00:00Z')).toBe(false);
    });

    it('should return true when draft is newer than DB timestamp', () => {
      saveDraft('case-new', 'Content');
      expect(isDraftNewer('case-new', '2025-01-01T00:00:00Z')).toBe(true);
    });

    it('should return true when dbUpdatedAt is null', () => {
      saveDraft('case-null', 'Content');
      expect(isDraftNewer('case-null', null)).toBe(true);
    });
  });

  describe('isDraftFromOtherTab', () => {
    it('should return false when no draft exists', () => {
      expect(isDraftFromOtherTab('no-draft')).toBe(false);
    });

    it('should return false for draft from current tab', () => {
      saveDraft('case-same', 'Content');
      expect(isDraftFromOtherTab('case-same')).toBe(false);
    });

    it('should return true for draft from another tab', () => {
      // Simulate a draft from another tab by writing directly
      const otherDraft = JSON.stringify({
        content: 'Other tab content',
        savedAt: new Date().toISOString(),
        tabId: 'other-tab-id',
      });
      localStorageMock.setItem('medlav-draft-case-other', otherDraft);
      // Reset mock so getDraft reads from store
      localStorageMock.getItem.mockImplementation((key: string) =>
        key === 'medlav-draft-case-other' ? otherDraft : '',
      );
      expect(isDraftFromOtherTab('case-other')).toBe(true);
    });
  });

  describe('getTabId', () => {
    it('should return a non-empty string', () => {
      expect(getTabId()).toBeTruthy();
      expect(typeof getTabId()).toBe('string');
    });

    it('should return the same value on repeated calls', () => {
      expect(getTabId()).toBe(getTabId());
    });
  });
});
