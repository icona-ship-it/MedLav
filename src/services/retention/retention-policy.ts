/**
 * Pure retention-policy logic (no I/O) for the daily data-retention cron
 * (src/inngest/functions/data-retention.ts). Unit-tested with injected dates.
 *
 * Policy (DPIA.md §7 — GDPR Art. 5(1)(e), limitazione della conservazione):
 * - Default: ARCHIVED cases are deleted 365 days after their last update
 *   when the user has not configured anything (profiles.data_retention_days
 *   IS NULL). This matches the default declared in the DPIA and shown in the
 *   settings UI.
 * - Explicit opt-out: data_retention_days = 0 (sentinel RETENTION_NEVER,
 *   selected as "Mai" in settings) → cases are never auto-deleted. The
 *   perito is the data controller of his fascicoli and may have legal
 *   grounds to keep them (e.g. own professional liability defense, 10-year
 *   civil statute).
 * - ACTIVE cases (bozza / in_revisione / definitivo) are NEVER auto-deleted:
 *   they are ongoing professional engagements — auto-deleting work in
 *   progress would be silent data loss, not data minimization. The retention
 *   clock starts when the perito archives the case (status 'archiviato',
 *   which bumps updated_at).
 * - No surprise deletions: a notice email is sent at least NOTICE_PERIOD_DAYS
 *   before deletion, and deletion never happens earlier than
 *   NOTICE_PERIOD_DAYS after the notice was actually sent.
 */

export const DEFAULT_RETENTION_DAYS = 365;
/** Sentinel stored in profiles.data_retention_days meaning "Mai" (keep forever). */
export const RETENTION_NEVER = 0;
/** Days of advance notice before an automatic deletion. */
export const NOTICE_PERIOD_DAYS = 30;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Effective retention in days for a profile value:
 * - null/undefined (never configured) → DEFAULT_RETENTION_DAYS
 * - 0 or negative (explicit "Mai")    → null (never delete)
 * - positive number                   → that number of days
 */
export function resolveEffectiveRetentionDays(
  dataRetentionDays: number | null | undefined,
): number | null {
  if (dataRetentionDays === null || dataRetentionDays === undefined) {
    return DEFAULT_RETENTION_DAYS;
  }
  if (dataRetentionDays <= RETENTION_NEVER) {
    return null;
  }
  return dataRetentionDays;
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * MS_PER_DAY);
}

/** Scheduled deletion date for a case: last update + retention period. */
export function computeDeleteAfter(updatedAt: string | Date, retentionDays: number): Date {
  const base = typeof updatedAt === 'string' ? new Date(updatedAt) : updatedAt;
  return addDays(base, retentionDays);
}

export interface RetentionCaseInput {
  id: string;
  code: string;
  /** Last update of the case (ISO) — retention clock base. */
  updatedAt: string;
  /** When the 30-day notice email was sent for this case (ISO), if ever. */
  noticeSentAt: string | null;
}

export interface RetentionNoticeItem {
  id: string;
  code: string;
  deleteAfter: Date;
}

export interface RetentionDeleteItem {
  id: string;
  code: string;
  noticeSentAt: string;
}

export interface RetentionPlan {
  /** Cases entering the deletion window — send ONE notice email, then mark. */
  toNotify: RetentionNoticeItem[];
  /** Cases expired AND notified at least NOTICE_PERIOD_DAYS ago — delete. */
  toDelete: RetentionDeleteItem[];
  /** Cases with a stale notice (clock extended / policy changed) — clear it. */
  toClearNotice: Array<{ id: string }>;
}

/**
 * Decide what the cron must do for each ARCHIVED case of one user.
 * Pure function: caller injects `now` and executes the plan.
 */
export function planRetentionActions(
  cases: readonly RetentionCaseInput[],
  retentionDays: number | null,
  now: Date,
): RetentionPlan {
  const plan: RetentionPlan = { toNotify: [], toDelete: [], toClearNotice: [] };

  // Retention disabled ("Mai"): nothing expires; clear any leftover notices
  // so a future policy change re-triggers a fresh notice.
  if (retentionDays === null) {
    for (const c of cases) {
      if (c.noticeSentAt) plan.toClearNotice.push({ id: c.id });
    }
    return plan;
  }

  for (const c of cases) {
    const deleteAfter = computeDeleteAfter(c.updatedAt, retentionDays);
    const noticeDue = addDays(deleteAfter, -NOTICE_PERIOD_DAYS);

    if (now < noticeDue) {
      // Not in the deletion window. A previously-sent notice is stale
      // (case was touched or retention extended) — clear it.
      if (c.noticeSentAt) plan.toClearNotice.push({ id: c.id });
      continue;
    }

    if (!c.noticeSentAt) {
      // In the window, never notified → notify now (deletion will happen
      // no earlier than NOTICE_PERIOD_DAYS from now).
      plan.toNotify.push({ id: c.id, code: c.code, deleteAfter });
      continue;
    }

    const noticeMatured = addDays(new Date(c.noticeSentAt), NOTICE_PERIOD_DAYS);
    if (now >= deleteAfter && now >= noticeMatured) {
      plan.toDelete.push({ id: c.id, code: c.code, noticeSentAt: c.noticeSentAt });
    }
    // else: notified but either not yet expired or notice not matured → wait
  }

  return plan;
}
