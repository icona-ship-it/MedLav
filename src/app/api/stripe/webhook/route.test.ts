import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextRequest } from 'next/server';

// --- Mocks (external deps only). vi.hoisted so the hoisted vi.mock factories
// can reference these without a TDZ ReferenceError. ---
const { grantCredits, grantMonthlyCredits, revokeMonthlyCredits, insertSpy } = vi.hoisted(() => ({
  grantCredits: vi.fn(),
  grantMonthlyCredits: vi.fn(),
  revokeMonthlyCredits: vi.fn(),
  insertSpy: vi.fn(),
}));

// Per-test mutable state (read at call time inside the mocks → no hoisting issue)
let mockEvent: unknown;
let dedupResult: { error: { code?: string; message?: string } | null };

vi.mock('@/lib/stripe/client', () => ({
  getStripeClient: () => ({
    webhooks: { constructEvent: () => mockEvent },
    subscriptions: {
      retrieve: vi.fn().mockResolvedValue({ status: 'active', current_period_end: 1893456000 }),
    },
  }),
}));
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      if (table === 'stripe_processed_events') {
        return { insert: (...args: unknown[]) => { insertSpy(...args); return Promise.resolve(dedupResult); } };
      }
      // profiles etc. — chainable no-op
      return {
        insert: () => Promise.resolve({ error: null }),
        update: () => ({ eq: () => Promise.resolve({ error: null }) }),
        select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: { id: 'u1' } }) }) }),
      };
    },
  }),
}));
vi.mock('@/services/credits/credit-service', () => ({ grantCredits, grantMonthlyCredits, revokeMonthlyCredits }));
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

import { POST } from './route';

const UUID = '11111111-1111-4111-8111-111111111111';

/** Minimal NextRequest stand-in — the handler only uses .text() + headers.get(). */
function makeReq(body = '{}', sig: string | null = 'test-sig'): NextRequest {
  return {
    text: async () => body,
    headers: { get: (k: string) => (k === 'stripe-signature' ? sig : null) },
  } as unknown as NextRequest;
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test';
  dedupResult = { error: null };
});

describe('POST /api/stripe/webhook — idempotency (money-leak prevention)', () => {
  it('rejects when the stripe-signature header is missing', async () => {
    const res = await POST(makeReq('{}', null));
    expect(res.status).toBe(400);
  });

  it('grants a credit pack on FIRST delivery', async () => {
    mockEvent = {
      id: 'evt_first',
      type: 'checkout.session.completed',
      data: { object: { id: 'cs_1', mode: 'payment', metadata: { userId: UUID, creditPack: '100' } } },
    };
    dedupResult = { error: null }; // not a duplicate

    const res = await POST(makeReq());
    const json = await res.json() as { received: boolean; duplicate?: boolean };

    expect(json.received).toBe(true);
    expect(json.duplicate).toBeUndefined();
    expect(insertSpy).toHaveBeenCalledWith(expect.objectContaining({ event_id: 'evt_first' }));
    expect(grantCredits).toHaveBeenCalledWith(UUID, 100, 'purchase', expect.objectContaining({ pack: 100 }));
  });

  it('SKIPS a duplicate event and does NOT grant credits again (23505)', async () => {
    mockEvent = {
      id: 'evt_dup',
      type: 'checkout.session.completed',
      data: { object: { id: 'cs_1', mode: 'payment', metadata: { userId: UUID, creditPack: '100' } } },
    };
    dedupResult = { error: { code: '23505', message: 'duplicate key' } }; // already processed

    const res = await POST(makeReq());
    const json = await res.json() as { received: boolean; duplicate?: boolean };

    expect(json).toEqual({ received: true, duplicate: true });
    expect(grantCredits).not.toHaveBeenCalled(); // the whole point: no double-grant
    expect(grantMonthlyCredits).not.toHaveBeenCalled();
  });

  it('fails OPEN if the dedup table is missing (non-23505 error) — webhook keeps working', async () => {
    mockEvent = {
      id: 'evt_failopen',
      type: 'checkout.session.completed',
      data: { object: { id: 'cs_1', mode: 'payment', metadata: { userId: UUID, creditPack: '50' } } },
    };
    dedupResult = { error: { code: '42P01', message: 'relation does not exist' } };

    const res = await POST(makeReq());
    const json = await res.json() as { received: boolean };
    expect(json.received).toBe(true);
    // fail-open: processing continues, credits granted
    expect(grantCredits).toHaveBeenCalledWith(UUID, 50, 'purchase', expect.anything());
  });
});
