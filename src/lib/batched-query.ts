/**
 * Utility for batching Supabase .in() queries to stay under PostgREST's ~8KB URL limit.
 * With UUIDs (36 chars each), 200 IDs ~ 7.2KB — safely under the limit.
 */

/** Safe batch size for .in() queries with UUID values. */
export const IN_BATCH_SIZE = 200;
