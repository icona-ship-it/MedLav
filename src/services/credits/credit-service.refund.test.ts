/**
 * Invarianti del rimborso su annullo/auto-fail (audit 2026-08-11, A-1/C-1).
 *
 * refundLatestCaseConsumption deve rimborsare la consumption più recente NON
 * ancora rimborsata ATTRAVERSO le operazioni indicate — non la prima della lista.
 * Prima annullare una rigenerazione restituiva i crediti dell'elaborazione già
 * CONSEGNATA (soldi sbagliati in entrambe le direzioni).
 *
 * Mock: solo il client Supabase admin (dipendenza esterna); la logica sotto test
 * è quella reale del servizio.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

interface Tx {
  id: number; user_id: string; entity_id: string | null; type: string;
  operation: string | null; amount: number; balance_after: number;
  metadata: unknown; created_at: string;
}
const state = {
  credits: { user_id: 'u1', balance: 0, monthly_allowance: 900, monthly_used: 0, monthly_reset_at: null as string | null, id: 'row1' },
  transactions: [] as Tx[],
  nextId: 1,
};

function makeBuilder(table: string) {
  const eqFilters: Array<[string, unknown]> = [];
  const inFilters: Array<[string, unknown[]]> = [];
  let updatePayload: Record<string, unknown> | null = null;
  let insertPayload: Record<string, unknown> | null = null;
  let wantSingle = false;
  let descOrder = false;

  const rowMatches = (t: Tx): boolean =>
    eqFilters.every(([c, v]) => (t as unknown as Record<string, unknown>)[c] === v) &&
    inFilters.every(([c, vals]) => vals.includes((t as unknown as Record<string, unknown>)[c]));

  const exec = () => {
    if (table === 'credit_transactions') {
      if (insertPayload) {
        state.transactions.push({
          id: state.nextId++,
          user_id: insertPayload.user_id as string,
          entity_id: (insertPayload.entity_id as string | null) ?? null,
          type: insertPayload.type as string,
          operation: (insertPayload.operation as string | null) ?? null,
          amount: insertPayload.amount as number,
          balance_after: insertPayload.balance_after as number,
          metadata: insertPayload.metadata ?? null,
          created_at: new Date(Date.now() + state.nextId).toISOString(),
        });
        return { data: null, error: null };
      }
      let rows = state.transactions.filter(rowMatches);
      if (descOrder) rows = [...rows].sort((a, b) => b.created_at.localeCompare(a.created_at));
      return { data: rows, error: null };
    }
    // user_credits
    if (updatePayload) {
      const matches = eqFilters.every(([c, v]) => (state.credits as unknown as Record<string, unknown>)[c] === v);
      if (!matches) return { data: [], error: null };
      Object.assign(state.credits, updatePayload);
      return { data: [{ id: state.credits.id }], error: null };
    }
    const match = eqFilters.every(([c, v]) => (state.credits as unknown as Record<string, unknown>)[c] === v);
    const row = match ? { ...state.credits } : null;
    if (wantSingle) return row ? { data: row, error: null } : { data: null, error: { code: 'PGRST116', message: 'no rows' } };
    return { data: row ? [row] : [], error: null };
  };

  const builder: Record<string, unknown> = {
    select() { return builder; },
    eq(col: string, val: unknown) { eqFilters.push([col, val]); return builder; },
    in(col: string, vals: unknown[]) { inFilters.push([col, vals]); return builder; },
    order(_col: string, opts?: { ascending?: boolean }) { descOrder = opts?.ascending === false; return builder; },
    limit() { return builder; },
    single() { wantSingle = true; return Promise.resolve(exec()); },
    maybeSingle() { wantSingle = true; return Promise.resolve(exec()); },
    update(payload: Record<string, unknown>) { updatePayload = payload; return builder; },
    insert(payload: Record<string, unknown>) { insertPayload = payload; return builder; },
    upsert(payload: Record<string, unknown>) { updatePayload = payload; return builder; },
    then(resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) {
      return Promise.resolve(exec()).then(resolve, reject);
    },
  };
  return builder;
}

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ from: (table: string) => makeBuilder(table) }),
}));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { refundLatestCaseConsumption } from '@/services/credits/credit-service';

function seedConsumption(operation: string, amount: number, caseId = 'c1') {
  state.transactions.push({
    id: state.nextId++, user_id: 'u1', entity_id: caseId, type: 'consumption',
    operation, amount: -amount, balance_after: 0, metadata: null,
    created_at: new Date(Date.now() + state.nextId).toISOString(),
  });
}
function seedRefund(operation: string, amount: number, caseId = 'c1') {
  state.transactions.push({
    id: state.nextId++, user_id: 'u1', entity_id: caseId, type: 'refund',
    operation, amount, balance_after: 0, metadata: null,
    created_at: new Date(Date.now() + state.nextId).toISOString(),
  });
}

const OPS = ['elaborazione', 'rigenerazione_report', 'rigenerazione_sezione'];

beforeEach(() => {
  state.credits = { user_id: 'u1', balance: 0, monthly_allowance: 900, monthly_used: 0, monthly_reset_at: null, id: 'row1' };
  state.transactions = [];
  state.nextId = 1;
});

describe('refundLatestCaseConsumption — rimborsa l\'operazione GIUSTA', () => {
  it('annullo di una rigenerazione → rimborsa la REGEN (20), non l\'elaborazione consegnata (30)', async () => {
    seedConsumption('elaborazione', 30);         // analisi consegnata (più vecchia)
    seedConsumption('rigenerazione_report', 20); // rigenerazione in corso (più recente)

    const refunded = await refundLatestCaseConsumption('u1', 'c1', OPS, 'user_cancelled');

    expect(refunded).toBe(20);
    const refunds = state.transactions.filter((t) => t.type === 'refund');
    expect(refunds).toHaveLength(1);
    expect(refunds[0].operation).toBe('rigenerazione_report');
  });

  it('annullo di una rigenerazione di SEZIONE → rimborsa i 5 cr della sezione', async () => {
    seedConsumption('elaborazione', 30);
    seedConsumption('rigenerazione_sezione', 5);

    const refunded = await refundLatestCaseConsumption('u1', 'c1', OPS, 'user_cancelled');

    expect(refunded).toBe(5);
    expect(state.transactions.find((t) => t.type === 'refund')?.operation).toBe('rigenerazione_sezione');
  });

  it('solo elaborazione in corso (nessuna regen) → rimborsa i 30', async () => {
    seedConsumption('elaborazione', 30);
    const refunded = await refundLatestCaseConsumption('u1', 'c1', OPS, 'user_cancelled');
    expect(refunded).toBe(30);
  });

  it('idempotenza per operazione: una regen già rimborsata non si rimborsa di nuovo', async () => {
    seedConsumption('rigenerazione_report', 20);
    seedRefund('rigenerazione_report', 20); // già rimborsata

    const refunded = await refundLatestCaseConsumption('u1', 'c1', ['rigenerazione_report'], 'user_cancelled');
    expect(refunded).toBe(0);
  });

  it('niente consumi → rimborso 0', async () => {
    const refunded = await refundLatestCaseConsumption('u1', 'c1', OPS, 'user_cancelled');
    expect(refunded).toBe(0);
  });
});
