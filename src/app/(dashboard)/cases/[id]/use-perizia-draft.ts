'use client';

/**
 * Draft + dirty-state machinery for the perizia metadata form.
 *
 * Responsibilities (scorecard 2026-06-10 fix 1.2 — stop silent data loss):
 * - autosave a localStorage draft ~2s after the last edit (debounced)
 * - `beforeunload` guard while the form has unsaved changes
 * - expose `isDirty` upward (client.tsx blocks wizard auto-advance on it)
 * - draft recovery banner on mount when a draft is newer than the saved data
 * - flush a final draft on unmount (manual navigation away mid-typing)
 *
 * Pure storage/compare logic lives in `@/lib/perizia-draft-storage` (unit-tested).
 */

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  savePeriziaDraft,
  getPeriziaDraft,
  clearPeriziaDraft,
  isPeriziaDraftNewer,
  serializePeriziaSnapshot,
  type PeriziaDraft,
  type PeriziaDraftPayload,
} from '@/lib/perizia-draft-storage';

const AUTOSAVE_DEBOUNCE_MS = 2_000;

interface UsePeriziaDraftParams {
  caseId: string;
  /** Current form snapshot — caller must memoize on [form, quesiti, excludedSections]. */
  payload: PeriziaDraftPayload;
  /** `updated_at` of the case row, to discard drafts older than the saved data. */
  savedUpdatedAt: string | null;
  /** Reported upward so the wizard never auto-advances while dirty. */
  onDirtyChange?: (dirty: boolean) => void;
  /** Apply a recovered draft to the form state (setForm/setQuesiti/...). */
  onRestore: (draft: PeriziaDraft) => void;
}

interface UsePeriziaDraftResult {
  isDirty: boolean;
  draftBanner: PeriziaDraft | null;
  restoreDraft: () => void;
  discardDraft: () => void;
  /** Call after a successful server save: clears the draft, resets the baseline. */
  markSaved: () => void;
  /** Absorb non-user changes (perito prefill) into the baseline so they don't count as dirty. */
  absorbIntoBaseline: (formPatch: Record<string, string>) => void;
}

export function usePeriziaDraft({
  caseId, payload, savedUpdatedAt, onDirtyChange, onRestore,
}: UsePeriziaDraftParams): UsePeriziaDraftResult {
  // Baseline = last known SAVED state. Dirty = current differs from baseline.
  const [baseline, setBaseline] = useState<PeriziaDraftPayload>(payload);
  const [draftBanner, setDraftBanner] = useState<PeriziaDraft | null>(null);

  const serialized = useMemo(() => serializePeriziaSnapshot(payload), [payload]);
  const baselineSerialized = useMemo(() => serializePeriziaSnapshot(baseline), [baseline]);
  const isDirty = serialized !== baselineSerialized;

  // Refs so unmount/debounce callbacks never act on stale data.
  const payloadRef = useRef(payload);
  const dirtyRef = useRef(isDirty);
  useEffect(() => {
    payloadRef.current = payload;
    dirtyRef.current = isDirty;
  }, [payload, isDirty]);

  // Report dirty state upward; always reset on unmount so the wizard resumes.
  useEffect(() => {
    onDirtyChange?.(isDirty);
  }, [isDirty, onDirtyChange]);
  useEffect(() => {
    return () => { onDirtyChange?.(false); };
  }, [onDirtyChange]);

  // Draft recovery check — once per mount, deferred to a macrotask so the
  // localStorage read + setState happen outside the effect body (lint rule)
  // and never during SSR/hydration.
  const recoveryCheckedRef = useRef(false);
  useEffect(() => {
    const timer = setTimeout(() => {
      if (recoveryCheckedRef.current) return;
      recoveryCheckedRef.current = true;
      const draft = getPeriziaDraft(caseId);
      if (!draft) return;
      const draftSnapshot = serializePeriziaSnapshot(draft);
      // Draft identical to what's already loaded → nothing to recover.
      if (draftSnapshot === serializePeriziaSnapshot(payloadRef.current)) {
        clearPeriziaDraft(caseId);
        return;
      }
      // Draft older than the last server save → stale, the DB version wins.
      if (!isPeriziaDraftNewer(draft, savedUpdatedAt)) {
        clearPeriziaDraft(caseId);
        return;
      }
      setDraftBanner(draft);
    }, 0);
    return () => clearTimeout(timer);
  }, [caseId, savedUpdatedAt]);

  // Debounced autosave while dirty.
  useEffect(() => {
    if (!isDirty) return;
    const timer = setTimeout(() => {
      savePeriziaDraft(caseId, payloadRef.current);
    }, AUTOSAVE_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [serialized, isDirty, caseId]);

  // Flush a final draft on unmount (e.g. user manually navigates the wizard
  // away less than 2s after typing — the debounce alone would lose it).
  useEffect(() => {
    return () => {
      if (dirtyRef.current) {
        savePeriziaDraft(caseId, payloadRef.current);
      }
    };
  }, [caseId]);

  // Native beforeunload guard while dirty (tab close / hard navigation).
  useEffect(() => {
    if (!isDirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      // Legacy requirement for Chrome to show the prompt.
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isDirty]);

  const restoreDraft = useCallback(() => {
    if (!draftBanner) return;
    onRestore(draftBanner);
    setDraftBanner(null);
  }, [draftBanner, onRestore]);

  const discardDraft = useCallback(() => {
    clearPeriziaDraft(caseId);
    setDraftBanner(null);
  }, [caseId]);

  const markSaved = useCallback(() => {
    clearPeriziaDraft(caseId);
    setBaseline(payloadRef.current);
  }, [caseId]);

  const absorbIntoBaseline = useCallback((formPatch: Record<string, string>) => {
    setBaseline((prev) => ({ ...prev, form: { ...prev.form, ...formPatch } }));
  }, []);

  return { isDirty, draftBanner, restoreDraft, discardDraft, markSaved, absorbIntoBaseline };
}
