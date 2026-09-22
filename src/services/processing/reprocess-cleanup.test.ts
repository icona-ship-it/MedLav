import { describe, it, expect } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { cleanupCaseDataForReprocess } from './reprocess-cleanup';

interface Call { table: string; op: string; args: unknown[] }

/** Mock minimale: registra le chiamate e simula le colonne delle tabelle. */
function makeSupabase(opts: { eventIds?: string[]; failTable?: string } = {}) {
  const calls: Call[] = [];
  const client = {
    from(table: string) {
      const chain: Record<string, unknown> = {};
      let op = '';
      const filters: unknown[] = [];
      const finish = () => {
        calls.push({ table, op, args: filters });
        if (table === opts.failTable) return { data: null, error: { message: `boom ${table}` } };
        if (table === 'event_images' && filters.some((f) => Array.isArray(f) && f[0] === 'case_id')) {
          return { data: null, error: { message: 'column event_images.case_id does not exist' } };
        }
        if (table === 'events' && op === 'select') return { data: (opts.eventIds ?? []).map((id) => ({ id })), error: null };
        return { data: null, error: null };
      };
      chain.select = () => { op = 'select'; return chain; };
      chain.delete = () => { op = 'delete'; return chain; };
      chain.eq = (col: string, val: unknown) => { filters.push([col, val]); return chain; };
      chain.in = (col: string, vals: unknown) => { filters.push([col, vals]); return chain; };
      chain.then = (resolve: (v: unknown) => unknown) => Promise.resolve(finish()).then(resolve);
      return chain;
    },
  };
  return { client: client as unknown as SupabaseClient, calls };
}

describe('cleanupCaseDataForReprocess — «Riavvia l\'analisi» non deve mai lasciare un caso svuotato e bloccato', () => {
  it('cancella le immagini per event_id (mai per case_id), poi eventi, anomalie, documenti mancanti e report: nessun errore', async () => {
    const { client, calls } = makeSupabase({ eventIds: ['e1', 'e2'] });
    const res = await cleanupCaseDataForReprocess(client, 'case-1');
    expect(res.failures).toEqual([]);
    expect(res.deletedImagesFor).toBe(2);
    const imageCalls = calls.filter((c) => c.table === 'event_images');
    expect(imageCalls).toHaveLength(1);
    expect(imageCalls[0].args).toEqual([['event_id', ['e1', 'e2']]]);
    const order = calls.filter((c) => c.op === 'delete').map((c) => c.table);
    expect(order).toEqual(['event_images', 'events', 'anomalies', 'missing_documents', 'reports']);
  });
  it('senza eventi non tocca event_images; con un errore su una tabella lo riporta invece di nasconderlo', async () => {
    const { client, calls } = makeSupabase({ eventIds: [] });
    const res = await cleanupCaseDataForReprocess(client, 'case-1');
    expect(res.failures).toEqual([]);
    expect(calls.some((c) => c.table === 'event_images')).toBe(false);
    const failing = makeSupabase({ eventIds: ['e1'], failTable: 'reports' });
    const res2 = await cleanupCaseDataForReprocess(failing.client, 'case-1');
    expect(res2.failures).toEqual(['reports: boom reports']);
  });
});
