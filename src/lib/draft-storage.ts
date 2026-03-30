/**
 * Client-side draft storage using localStorage.
 * Saves report editor drafts for recovery after accidental page close.
 */

const DRAFT_PREFIX = 'medlav-draft-';

interface Draft {
  content: string;
  savedAt: string; // ISO timestamp
}

export function saveDraft(caseId: string, content: string): void {
  try {
    const draft: Draft = {
      content,
      savedAt: new Date().toISOString(),
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
