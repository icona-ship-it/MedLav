import { revalidateTag } from 'next/cache';

/**
 * Cache tag constants for Next.js on-demand revalidation.
 *
 * NOTE: Do NOT cache anything related to the processing pipeline
 * (documents in processing, events being extracted, etc.)
 * — those need real-time data.
 */
export const CACHE_TAGS = {
  /** Cases list (dashboard, /cases) */
  CASES: 'cases',
  /** Single case detail page data */
  CASE_DETAIL: 'case-detail',
  /** User profile / settings */
  PROFILE: 'profile',
  /** Admin guidelines (RAG) */
  GUIDELINES: 'guidelines',
} as const;

/**
 * Revalidate a specific case's detail page and the cases list.
 * Call after any mutation that modifies case data, documents, events, or reports.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function revalidateCase(_caseId: string): void {
  revalidateTag(CACHE_TAGS.CASE_DETAIL);
  revalidateTag(CACHE_TAGS.CASES);
}

/**
 * Revalidate the cases list (dashboard stats + /cases page).
 * Call after create, delete, or status change on a case.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function revalidateCases(_userId: string): void {
  revalidateTag(CACHE_TAGS.CASES);
}
