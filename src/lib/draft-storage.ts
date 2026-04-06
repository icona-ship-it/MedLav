/**
 * Client-side draft storage using localStorage.
 * Saves report editor drafts for recovery after accidental page close.
 * Includes tab-awareness to detect cross-tab editing conflicts.
 */

const DRAFT_PREFIX = 'legmed-draft-';

/** Unique ID for this browser tab, survives re-renders but not page reload. */
const TAB_ID = typeof crypto !== 'undefined'
  ? crypto.randomUUID()
  : Math.random().toString(36).slice(2);

interface Draft {
  content: string;
  savedAt: string; // ISO timestamp
  tabId: string;
}

export function saveDraft(caseId: string, content: string): void {
  try {
    const draft: Draft = {
      content,
      savedAt: new Date().toISOString(),
      tabId: TAB_ID,
    };
    localStorage.setItem(DRAFT_PREFIX + caseId, JSON.stringify(draft));
  } catch {
    // localStorage full or unavailable — silently ignore
  }
}

export function getDraft(caseId: string): Draft | null {
  try {
    const raw = localStorage.getItem(DRAFT_PREFIX + caseId);
    if (!raw) return null;
    const draft = JSON.parse(raw) as Draft;
    if (!draft.content || !draft.savedAt) return null;
    return draft;
  } catch {
    return null;
  }
}

export function clearDraft(caseId: string): void {
  try {
    localStorage.removeItem(DRAFT_PREFIX + caseId);
  } catch {
    // silently ignore
  }
}

/**
 * Check if a draft is newer than the given database timestamp.
 */
export function isDraftNewer(caseId: string, dbUpdatedAt: string | null): boolean {
  const draft = getDraft(caseId);
  if (!draft) return false;
  if (!dbUpdatedAt) return true;
  return new Date(draft.savedAt) > new Date(dbUpdatedAt);
}

/**
 * Check if a draft was saved by a different browser tab.
 */
export function isDraftFromOtherTab(caseId: string): boolean {
  const draft = getDraft(caseId);
  if (!draft) return false;
  return !!draft.tabId && draft.tabId !== TAB_ID;
}

/**
 * Get the current tab's ID for comparison.
 */
export function getTabId(): string {
  return TAB_ID;
}
