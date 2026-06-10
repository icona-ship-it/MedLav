import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  savePeriziaDraft,
  getPeriziaDraft,
  clearPeriziaDraft,
  isPeriziaDraftNewer,
  serializePeriziaSnapshot,
  mergeDraftForm,
  formatDraftAge,
  type PeriziaDraftPayload,
} from './perizia-draft-storage';

// Mock localStorage (vitest runs in node environment)
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => { store[key] = value; }),
    removeItem: vi.fn((key: string) => { delete store[key]; }),
    clear: () => { store = {}; },
    inject: (key: string, value: string) => { store[key] = value; },
  };
})();

Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock, configurable: true });

const payload: PeriziaDraftPayload = {
  form: { ctuName: 'Dott. Mario Esempi', ambitoPenale: false },
  quesiti: ['Quesito 1'],
  excludedSections: ['bibliografia'],
};

describe('perizia-draft-storage', () => {
  beforeEach(() => {
    localStorageMock.clear();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('savePeriziaDraft / getPeriziaDraft', () => {
    it('should round-trip a payload with a savedAt timestamp', () => {
      savePeriziaDraft('case-1', payload);
      const draft = getPeriziaDraft('case-1');
      expect(draft).not.toBeNull();
      expect(draft?.form).toEqual(payload.form);
      expect(draft?.quesiti).toEqual(payload.quesiti);
      expect(draft?.excludedSections).toEqual(payload.excludedSections);
      expect(new Date(draft?.savedAt ?? '').getTime()).not.toBeNaN();
    });

    it('should use a per-case key separate from the report draft key', () => {
      savePeriziaDraft('case-1', payload);
      expect(localStorageMock.setItem).toHaveBeenCalledWith(
        'legmed-perizia-draft-case-1',
        expect.any(String),
      );
    });

    it('should return null when no draft exists', () => {
      expect(getPeriziaDraft('missing')).toBeNull();
    });

    it('should return null on malformed JSON', () => {
      localStorageMock.inject('legmed-perizia-draft-case-1', '{not json');
      expect(getPeriziaDraft('case-1')).toBeNull();
    });

    it('should return null when shape is invalid (missing fields, wrong types)', () => {
      localStorageMock.inject('legmed-perizia-draft-case-1', JSON.stringify({ savedAt: 'x' }));
      expect(getPeriziaDraft('case-1')).toBeNull();

      localStorageMock.inject('legmed-perizia-draft-case-1', JSON.stringify({
        savedAt: new Date().toISOString(),
        form: { a: 123 }, // number not allowed
        quesiti: [],
        excludedSections: [],
      }));
      expect(getPeriziaDraft('case-1')).toBeNull();

      localStorageMock.inject('legmed-perizia-draft-case-1', JSON.stringify({
        savedAt: new Date().toISOString(),
        form: {},
        quesiti: [1, 2], // non-string quesiti
        excludedSections: [],
      }));
      expect(getPeriziaDraft('case-1')).toBeNull();
    });

    it('should not throw when localStorage is unavailable', () => {
      localStorageMock.setItem.mockImplementationOnce(() => { throw new Error('quota'); });
      expect(() => savePeriziaDraft('case-1', payload)).not.toThrow();
    });
  });

  describe('clearPeriziaDraft', () => {
    it('should remove the draft', () => {
      savePeriziaDraft('case-1', payload);
      clearPeriziaDraft('case-1');
      expect(getPeriziaDraft('case-1')).toBeNull();
    });
  });

  describe('isPeriziaDraftNewer', () => {
    const draftAt = (iso: string) => ({ ...payload, savedAt: iso });

    it('should be true when draft is newer than the DB row', () => {
      expect(isPeriziaDraftNewer(draftAt('2026-06-10T12:00:00Z'), '2026-06-10T11:00:00Z')).toBe(true);
    });

    it('should be false when draft is older than the DB row', () => {
      expect(isPeriziaDraftNewer(draftAt('2026-06-10T10:00:00Z'), '2026-06-10T11:00:00Z')).toBe(false);
    });

    it('should be true when no DB timestamp exists', () => {
      expect(isPeriziaDraftNewer(draftAt('2026-06-10T10:00:00Z'), null)).toBe(true);
      expect(isPeriziaDraftNewer(draftAt('2026-06-10T10:00:00Z'), undefined)).toBe(true);
    });

    it('should be false when the draft timestamp is garbage', () => {
      expect(isPeriziaDraftNewer(draftAt('not-a-date'), null)).toBe(false);
    });
  });

  describe('serializePeriziaSnapshot', () => {
    it('should be stable across form key order', () => {
      const a = serializePeriziaSnapshot({ form: { x: '1', y: '2' }, quesiti: [], excludedSections: [] });
      const b = serializePeriziaSnapshot({ form: { y: '2', x: '1' }, quesiti: [], excludedSections: [] });
      expect(a).toBe(b);
    });

    it('should be stable across excludedSections order but sensitive to quesiti order', () => {
      const a = serializePeriziaSnapshot({ form: {}, quesiti: ['q1', 'q2'], excludedSections: ['b', 'a'] });
      const b = serializePeriziaSnapshot({ form: {}, quesiti: ['q1', 'q2'], excludedSections: ['a', 'b'] });
      const c = serializePeriziaSnapshot({ form: {}, quesiti: ['q2', 'q1'], excludedSections: ['a', 'b'] });
      expect(a).toBe(b);
      expect(a).not.toBe(c);
    });

    it('should differ when any value changes', () => {
      const a = serializePeriziaSnapshot(payload);
      const b = serializePeriziaSnapshot({ ...payload, form: { ...payload.form, ctuName: 'Altro' } });
      expect(a).not.toBe(b);
    });
  });

  describe('mergeDraftForm', () => {
    it('should apply known keys with matching types', () => {
      const current = { name: '', flag: false };
      const merged = mergeDraftForm(current, { name: 'Mario', flag: true });
      expect(merged).toEqual({ name: 'Mario', flag: true });
    });

    it('should drop unknown keys and type mismatches', () => {
      const current = { name: '', flag: false };
      const merged = mergeDraftForm(current, { name: 42, flag: 'yes', ghost: 'x' });
      expect(merged).toEqual({ name: '', flag: false });
    });

    it('should not mutate the current form (immutability)', () => {
      const current = { name: 'original' };
      const merged = mergeDraftForm(current, { name: 'changed' });
      expect(current.name).toBe('original');
      expect(merged.name).toBe('changed');
    });

    it('should restore empty strings from the draft (faithful restore)', () => {
      const current = { name: 'prefilled' };
      const merged = mergeDraftForm(current, { name: '' });
      expect(merged.name).toBe('');
    });
  });

  describe('formatDraftAge', () => {
    const now = new Date('2026-06-10T12:00:00Z');

    it('should describe recent drafts in minutes', () => {
      expect(formatDraftAge('2026-06-10T11:59:40Z', now)).toBe('meno di un minuto fa');
      expect(formatDraftAge('2026-06-10T11:59:00Z', now)).toBe('1 minuto fa');
      expect(formatDraftAge('2026-06-10T11:55:00Z', now)).toBe('5 minuti fa');
    });

    it('should describe older drafts in hours', () => {
      expect(formatDraftAge('2026-06-10T11:00:00Z', now)).toBe('1 ora fa');
      expect(formatDraftAge('2026-06-10T09:00:00Z', now)).toBe('3 ore fa');
    });

    it('should fall back to an absolute date after 24h', () => {
      expect(formatDraftAge('2026-06-08T12:00:00Z', now)).toMatch(/^il \d{2}\/\d{2}\/\d{4}/);
    });

    it('should return empty string on garbage input', () => {
      expect(formatDraftAge('garbage', now)).toBe('');
    });

    it('should clamp clock skew (draft in the future) to "now"', () => {
      expect(formatDraftAge('2026-06-10T12:05:00Z', now)).toBe('meno di un minuto fa');
    });
  });
});
