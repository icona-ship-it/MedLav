/**
 * Client-side draft storage for the perizia metadata form (localStorage).
 *
 * Why this exists (scorecard 2026-06-10, "UX per il perito"): the perizia form
 * only saved on "Prosegui" — a perito dictating 10 minutes of anamnesi lost
 * everything if the tab closed or the wizard auto-advanced. This module gives
 * the form the same safety net the report editor already has (draft-storage.ts),
 * extended to the structured payload (fields + quesiti + excluded sections).
 *
 * Pure module: no React. Tested in perizia-draft-storage.test.ts.
 */

const DRAFT_PREFIX = 'legmed-perizia-draft-';

/** Snapshot of everything the perito can edit in the form. */
export interface PeriziaDraftPayload {
  form: Record<string, string | boolean>;
  quesiti: string[];
  excludedSections: string[];
}

export interface PeriziaDraft extends PeriziaDraftPayload {
  savedAt: string; // ISO timestamp
}

export function savePeriziaDraft(caseId: string, payload: PeriziaDraftPayload): void {
  try {
    const draft: PeriziaDraft = {
      ...payload,
      savedAt: new Date().toISOString(),
    };
    localStorage.setItem(DRAFT_PREFIX + caseId, JSON.stringify(draft));
  } catch {
    // localStorage full or unavailable — silently ignore (best-effort safety net)
  }
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((v) => typeof v === 'string');
}

function isFormRecord(value: unknown): value is Record<string, string | boolean> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  return Object.values(value).every((v) => typeof v === 'string' || typeof v === 'boolean');
}

export function getPeriziaDraft(caseId: string): PeriziaDraft | null {
  try {
    const raw = localStorage.getItem(DRAFT_PREFIX + caseId);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed !== 'object' || parsed === null) return null;
    const candidate = parsed as Record<string, unknown>;
    if (typeof candidate.savedAt !== 'string') return null;
    if (!isFormRecord(candidate.form)) return null;
    if (!isStringArray(candidate.quesiti)) return null;
    if (!isStringArray(candidate.excludedSections)) return null;
    return {
      form: candidate.form,
      quesiti: candidate.quesiti,
      excludedSections: candidate.excludedSections,
      savedAt: candidate.savedAt,
    };
  } catch {
    return null;
  }
}

export function clearPeriziaDraft(caseId: string): void {
  try {
    localStorage.removeItem(DRAFT_PREFIX + caseId);
  } catch {
    // silently ignore
  }
}

/**
 * True if the draft was saved AFTER the case row was last updated.
 * No saved timestamp → the draft is the only copy → treat as newer.
 */
export function isPeriziaDraftNewer(draft: PeriziaDraft, dbUpdatedAt: string | null | undefined): boolean {
  const savedAtMs = new Date(draft.savedAt).getTime();
  if (Number.isNaN(savedAtMs)) return false;
  if (!dbUpdatedAt) return true;
  const dbMs = new Date(dbUpdatedAt).getTime();
  if (Number.isNaN(dbMs)) return true;
  return savedAtMs > dbMs;
}

/**
 * Stable serialization used for dirty-checking (current vs baseline) and for
 * "is this draft identical to the saved data?" comparisons. Key order is
 * normalized so two equivalent snapshots always serialize identically.
 */
export function serializePeriziaSnapshot(payload: PeriziaDraftPayload): string {
  const sortedForm = Object.fromEntries(
    Object.entries(payload.form).sort(([a], [b]) => a.localeCompare(b)),
  );
  return JSON.stringify({
    form: sortedForm,
    quesiti: payload.quesiti,
    excludedSections: [...payload.excludedSections].sort(),
  });
}

/**
 * Merge a (possibly stale/partial) draft form into the current form state.
 * Only keys that exist in `current` with the same value type are applied —
 * unknown keys or type mismatches from old drafts are silently dropped.
 */
export function mergeDraftForm<T extends Record<string, string | boolean>>(
  current: T,
  draftForm: Record<string, unknown>,
): T {
  const next: Record<string, string | boolean> = { ...current };
  for (const [key, value] of Object.entries(draftForm)) {
    if (!(key in current)) continue;
    if (typeof value !== typeof current[key]) continue;
    if (typeof value === 'string' || typeof value === 'boolean') {
      next[key] = value;
    }
  }
  return next as T;
}

/**
 * Human-friendly age of a draft in Italian ("5 minuti fa", "2 ore fa",
 * fallback to absolute date for very old drafts). Empty string on bad input.
 */
export function formatDraftAge(savedAt: string, now: Date = new Date()): string {
  const savedMs = new Date(savedAt).getTime();
  if (Number.isNaN(savedMs)) return '';
  const diffMinutes = Math.max(0, Math.floor((now.getTime() - savedMs) / 60_000));
  if (diffMinutes < 1) return 'meno di un minuto fa';
  if (diffMinutes === 1) return '1 minuto fa';
  if (diffMinutes < 60) return `${diffMinutes} minuti fa`;
  const hours = Math.floor(diffMinutes / 60);
  if (hours === 1) return '1 ora fa';
  if (hours < 24) return `${hours} ore fa`;
  const formatted = new Date(savedAt).toLocaleString('it-IT', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
  return `il ${formatted}`;
}
