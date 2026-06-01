import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextRequest } from 'next/server';

const UUID = '44444444-4444-4444-8444-444444444444';

const { inngestSend, getUser, profileResult, caseResult } = vi.hoisted(() => ({
  inngestSend: vi.fn(),
  getUser: vi.fn(),
  profileResult: { value: { data: { subscription_status: 'active' } } as { data: unknown } },
  caseResult: { value: { data: null, error: null } as { data: unknown; error: unknown } },
}));

vi.mock('@/lib/csrf', () => ({ validateCsrfToken: () => null }));
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: async () => ({ success: true }), RATE_LIMITS: { PROCESSING: {} } }));
vi.mock('@/lib/inngest/client', () => ({ inngest: { send: inngestSend } }));
vi.mock('@/lib/pipeline-limits', () => ({ validateCaseForProcessing: async () => ({ valid: true }) }));
vi.mock('@/services/credits/credit-service', () => ({
  getBalance: async () => ({ balance: 1000 }),
  deductCredits: vi.fn(async () => ({ success: true })),
  refundCredits: vi.fn(),
}));
vi.mock('@/services/credits/credit-costs', () => ({ getElaborationCost: () => 30 }));
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

function makeChain(result: unknown) {
  const c: Record<string, unknown> = {};
  c.select = () => c;
  c.eq = () => c;
  c.in = () => c;
  c.single = async () => result;
  return c;
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: getUser },
    from: (table: string) => (table === 'profiles' ? makeChain(profileResult.value) : makeChain(caseResult.value)),
  }),
}));

import { POST } from './route';

function makeReq(): NextRequest {
  return { headers: { get: () => null }, json: async () => ({ caseId: UUID }) } as unknown as NextRequest;
}

beforeEach(() => {
  vi.clearAllMocks();
  getUser.mockResolvedValue({ data: { user: { id: UUID } } });
  profileResult.value = { data: { subscription_status: 'active' } };
  caseResult.value = { data: { id: UUID, user_id: UUID, processing_stage: 'idle', pipeline_mode: 'full' }, error: null };
});

describe('POST /api/processing/start — entry guards', () => {
  it('401 when unauthenticated (no pipeline dispatched)', async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    const res = await POST(makeReq());
    expect(res.status).toBe(401);
    expect(inngestSend).not.toHaveBeenCalled();
  });

  it('403 when the subscription is canceled', async () => {
    profileResult.value = { data: { subscription_status: 'canceled' } };
    const res = await POST(makeReq());
    expect(res.status).toBe(403);
    expect(inngestSend).not.toHaveBeenCalled();
  });

  it('404 when the case is not owned by the user', async () => {
    caseResult.value = { data: null, error: { message: 'not found' } };
    const res = await POST(makeReq());
    expect(res.status).toBe(404);
    expect(inngestSend).not.toHaveBeenCalled();
  });

  it('409 when the pipeline is already running (anti double-start / double-charge)', async () => {
    caseResult.value = { data: { id: UUID, user_id: UUID, processing_stage: 'elaborazione', pipeline_mode: 'full' }, error: null };
    const res = await POST(makeReq());
    expect(res.status).toBe(409);
    expect(inngestSend).not.toHaveBeenCalled();
  });

  it('409 when a report is being generated (generazione_report)', async () => {
    caseResult.value = { data: { id: UUID, user_id: UUID, processing_stage: 'generazione_report', pipeline_mode: 'full' }, error: null };
    const res = await POST(makeReq());
    expect(res.status).toBe(409);
    expect(inngestSend).not.toHaveBeenCalled();
  });
});
