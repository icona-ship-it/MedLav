import { describe, it, expect } from 'vitest';
import {
  resolveEffectiveRetentionDays,
  computeDeleteAfter,
  planRetentionActions,
  DEFAULT_RETENTION_DAYS,
  type RetentionCaseInput,
} from './retention-policy';

const NOW = new Date('2026-06-10T03:00:00.000Z');

function caseInput(overrides: Partial<RetentionCaseInput> = {}): RetentionCaseInput {
  return {
    id: 'case-1',
    code: 'CASO-2026-001',
    updatedAt: '2025-01-01T00:00:00.000Z',
    noticeSentAt: null,
    ...overrides,
  };
}

describe('resolveEffectiveRetentionDays', () => {
  it('should default to 365 days when nothing is configured (null)', () => {
    expect(resolveEffectiveRetentionDays(null)).toBe(DEFAULT_RETENTION_DAYS);
  });

  it('should default to 365 days when undefined', () => {
    expect(resolveEffectiveRetentionDays(undefined)).toBe(DEFAULT_RETENTION_DAYS);
  });

  it('should return null (never delete) for the explicit "Mai" sentinel 0', () => {
    expect(resolveEffectiveRetentionDays(0)).toBeNull();
  });

  it('should return null for invalid negative values (fail-safe)', () => {
    expect(resolveEffectiveRetentionDays(-5)).toBeNull();
  });

  it('should return the configured value when positive', () => {
    expect(resolveEffectiveRetentionDays(90)).toBe(90);
    expect(resolveEffectiveRetentionDays(730)).toBe(730);
  });
});

describe('computeDeleteAfter', () => {
  it('should add the retention period to the last update', () => {
    const result = computeDeleteAfter('2026-01-01T00:00:00.000Z', 30);
    expect(result.toISOString()).toBe('2026-01-31T00:00:00.000Z');
  });

  it('should accept Date input', () => {
    const result = computeDeleteAfter(new Date('2026-01-01T00:00:00.000Z'), 1);
    expect(result.toISOString()).toBe('2026-01-02T00:00:00.000Z');
  });
});

describe('planRetentionActions', () => {
  it('should do nothing for an empty case list', () => {
    const plan = planRetentionActions([], 365, NOW);
    expect(plan).toEqual({ toNotify: [], toDelete: [], toClearNotice: [] });
  });

  it('should not touch cases far from expiry', () => {
    // updated yesterday, retention 365 → expires in ~1 year
    const plan = planRetentionActions(
      [caseInput({ updatedAt: '2026-06-09T00:00:00.000Z' })],
      365,
      NOW,
    );
    expect(plan.toNotify).toEqual([]);
    expect(plan.toDelete).toEqual([]);
  });

  it('should notify when the case enters the 30-day window before deletion', () => {
    // retention 365 → deleteAfter = 2026-06-20, window opens 2026-05-21 → NOW inside
    const plan = planRetentionActions(
      [caseInput({ updatedAt: '2025-06-20T00:00:00.000Z' })],
      365,
      NOW,
    );
    expect(plan.toNotify).toHaveLength(1);
    expect(plan.toNotify[0].id).toBe('case-1');
    expect(plan.toNotify[0].deleteAfter.toISOString()).toBe('2026-06-20T00:00:00.000Z');
    expect(plan.toDelete).toEqual([]);
  });

  it('should notify (not delete) an already-expired case that was never notified', () => {
    // Conservative: even long-expired cases get 30 days of notice first
    const plan = planRetentionActions(
      [caseInput({ updatedAt: '2024-01-01T00:00:00.000Z' })],
      365,
      NOW,
    );
    expect(plan.toNotify).toHaveLength(1);
    expect(plan.toDelete).toEqual([]);
  });

  it('should delete only when expired AND notice was sent at least 30 days ago', () => {
    const plan = planRetentionActions(
      [
        caseInput({
          updatedAt: '2024-01-01T00:00:00.000Z',
          noticeSentAt: '2026-05-01T00:00:00.000Z', // 40 days before NOW
        }),
      ],
      365,
      NOW,
    );
    expect(plan.toDelete).toHaveLength(1);
    expect(plan.toDelete[0].id).toBe('case-1');
    expect(plan.toNotify).toEqual([]);
  });

  it('should wait when notice is fresher than 30 days even if case is expired', () => {
    const plan = planRetentionActions(
      [
        caseInput({
          updatedAt: '2024-01-01T00:00:00.000Z',
          noticeSentAt: '2026-06-01T00:00:00.000Z', // only 9 days before NOW
        }),
      ],
      365,
      NOW,
    );
    expect(plan.toDelete).toEqual([]);
    expect(plan.toNotify).toEqual([]);
    expect(plan.toClearNotice).toEqual([]);
  });

  it('should wait at the exact boundary minus one ms and delete at maturity', () => {
    const noticeSentAt = '2026-05-11T03:00:00.000Z'; // matures exactly at NOW
    const expired = caseInput({
      updatedAt: '2024-01-01T00:00:00.000Z',
      noticeSentAt,
    });
    const justBefore = new Date(NOW.getTime() - 1);
    expect(planRetentionActions([expired], 365, justBefore).toDelete).toEqual([]);
    expect(planRetentionActions([expired], 365, NOW).toDelete).toHaveLength(1);
  });

  it('should clear a stale notice when the case clock was extended', () => {
    // Notice was sent, but the case was updated afterwards → no longer in window
    const plan = planRetentionActions(
      [
        caseInput({
          updatedAt: '2026-06-01T00:00:00.000Z', // fresh update
          noticeSentAt: '2026-04-01T00:00:00.000Z',
        }),
      ],
      365,
      NOW,
    );
    expect(plan.toClearNotice).toEqual([{ id: 'case-1' }]);
    expect(plan.toDelete).toEqual([]);
    expect(plan.toNotify).toEqual([]);
  });

  it('should never notify or delete when retention is null ("Mai")', () => {
    const plan = planRetentionActions(
      [caseInput({ updatedAt: '2020-01-01T00:00:00.000Z' })],
      null,
      NOW,
    );
    expect(plan.toNotify).toEqual([]);
    expect(plan.toDelete).toEqual([]);
  });

  it('should clear leftover notices when retention is switched to "Mai"', () => {
    const plan = planRetentionActions(
      [
        caseInput({
          updatedAt: '2020-01-01T00:00:00.000Z',
          noticeSentAt: '2026-05-01T00:00:00.000Z',
        }),
      ],
      null,
      NOW,
    );
    expect(plan.toClearNotice).toEqual([{ id: 'case-1' }]);
    expect(plan.toDelete).toEqual([]);
  });

  it('should handle a mixed batch independently per case', () => {
    const cases: RetentionCaseInput[] = [
      caseInput({ id: 'fresh', updatedAt: '2026-06-09T00:00:00.000Z' }),
      caseInput({ id: 'window', code: 'C-2', updatedAt: '2025-06-20T00:00:00.000Z' }),
      caseInput({
        id: 'ripe',
        code: 'C-3',
        updatedAt: '2024-01-01T00:00:00.000Z',
        noticeSentAt: '2026-05-01T00:00:00.000Z',
      }),
      caseInput({
        id: 'stale',
        code: 'C-4',
        updatedAt: '2026-06-05T00:00:00.000Z',
        noticeSentAt: '2026-01-01T00:00:00.000Z',
      }),
    ];
    const plan = planRetentionActions(cases, 365, NOW);
    expect(plan.toNotify.map((c) => c.id)).toEqual(['window']);
    expect(plan.toDelete.map((c) => c.id)).toEqual(['ripe']);
    expect(plan.toClearNotice.map((c) => c.id)).toEqual(['stale']);
  });

  it('should ignore cases with invalid noticeSentAt dates (treated as not matured)', () => {
    const plan = planRetentionActions(
      [
        caseInput({
          updatedAt: '2024-01-01T00:00:00.000Z',
          noticeSentAt: 'not-a-date',
        }),
      ],
      365,
      NOW,
    );
    // Invalid date → comparison false → never deleted (fail-safe)
    expect(plan.toDelete).toEqual([]);
  });
});
