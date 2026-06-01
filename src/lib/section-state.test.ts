import { describe, it, expect } from 'vitest';
import { markSectionState, getSectionStatus, getSectionState } from './section-state';
import type { ReportGenerationMetadata } from '@/db/schema/reports';

describe('section-state helpers', () => {
  it('getSectionStatus defaults to auto when absent', () => {
    expect(getSectionStatus(null, 'epicrisi')).toBe('auto');
    expect(getSectionStatus(undefined, 'epicrisi')).toBe('auto');
    expect(getSectionStatus({}, 'epicrisi')).toBe('auto');
    expect(getSectionStatus({ sections: {} }, 'epicrisi')).toBe('auto');
  });

  it('markSectionState returns null when no canonicalId (caller skips write)', () => {
    expect(markSectionState({}, undefined, () => ({ status: 'edited' }))).toBeNull();
    expect(markSectionState({}, null, () => ({ status: 'edited' }))).toBeNull();
  });

  it('markSectionState sets edited and preserves other metadata + other sections', () => {
    const meta: ReportGenerationMetadata = {
      promptVersion: 'abc123',
      sections: { epicrisi: { status: 'locked', lockedAt: '2026-01-01T00:00:00Z' } },
    };
    const next = markSectionState(meta, 'documentazione_sanitaria', (prev) => ({
      ...prev,
      status: 'edited',
      editedAt: '2026-06-01T10:00:00Z',
    }));
    expect(next?.promptVersion).toBe('abc123'); // unrelated metadata preserved
    expect(next?.sections?.epicrisi?.status).toBe('locked'); // other section untouched
    expect(next?.sections?.documentazione_sanitaria?.status).toBe('edited');
    expect(next?.sections?.documentazione_sanitaria?.editedAt).toBe('2026-06-01T10:00:00Z');
    // immutability: original not mutated
    expect(meta.sections?.documentazione_sanitaria).toBeUndefined();
  });

  it('updater receives previous state (lock stays locked on edit)', () => {
    const meta: ReportGenerationMetadata = { sections: { epicrisi: { status: 'locked' } } };
    const next = markSectionState(meta, 'epicrisi', (prev) => ({
      ...prev,
      status: prev?.status === 'locked' ? 'locked' : 'edited',
      editedAt: '2026-06-01T10:00:00Z',
    }));
    expect(getSectionStatus(next, 'epicrisi')).toBe('locked');
    expect(getSectionState(next, 'epicrisi')?.editedAt).toBe('2026-06-01T10:00:00Z');
  });

  it('starts a sections map when metadata had none', () => {
    const next = markSectionState(null, 'epicrisi', () => ({ status: 'locked', lockedAt: 'x' }));
    expect(next?.sections?.epicrisi?.status).toBe('locked');
  });
});
