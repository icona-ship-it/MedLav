import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextRequest } from 'next/server';

const UUID = '33333333-3333-4333-8333-333333333333';

const { inngestSend, casesSingle } = vi.hoisted(() => ({
  inngestSend: vi.fn(),
  casesSingle: vi.fn(),
}));

vi.mock('@/lib/csrf', () => ({ validateCsrfToken: () => null }));
vi.mock('@/lib/subscription', () => ({ checkFeatureAccess: async () => ({ allowed: true }) }));
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: async () => ({ success: true }), RATE_LIMITS: { PROCESSING: {} } }));
vi.mock('@/lib/inngest/client', () => ({ inngest: { send: inngestSend } }));
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: UUID } } }) },
    from: () => ({ select: () => ({ eq: () => ({ eq: () => ({ single: casesSingle }) }) }) }),
  }),
}));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: () => ({}) }) }));
// Pure helpers pulled in by the route — stubbed so import never touches Mistral/etc.
vi.mock('@/services/validation/anomaly-detector', () => ({ detectAnomalies: () => [] }));
vi.mock('@/services/validation/missing-doc-detector', () => ({ detectMissingDocuments: () => [] }));
vi.mock('@/services/validation/anomaly-resolver', () => ({ resolveAnomalies: async () => [] }));
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

import { POST } from './route';

function makeReq(): NextRequest {
  return { json: async () => ({ caseId: UUID }) } as unknown as NextRequest;
}

beforeEach(() => {
  vi.clearAllMocks();
  casesSingle.mockResolvedValue({ data: { id: UUID, case_type: 'rc_auto', case_types: null, case_role: 'ctu', patient_initials: 'AB', perizia_metadata: {}, processing_stage: 'completato' } });
});

describe('POST /api/processing/regenerate — concurrency guard', () => {
  it('rejects (409) and does NOT dispatch when a generation is already in progress', async () => {
    casesSingle.mockResolvedValue({ data: { id: UUID, processing_stage: 'generazione_report' } });
    const res = await POST(makeReq());
    expect(res.status).toBe(409);
    expect(inngestSend).not.toHaveBeenCalled();
  });

  it('rejects (409) while the initial pipeline is running (elaborazione)', async () => {
    casesSingle.mockResolvedValue({ data: { id: UUID, processing_stage: 'elaborazione' } });
    const res = await POST(makeReq());
    expect(res.status).toBe(409);
    expect(inngestSend).not.toHaveBeenCalled();
  });

  it('returns 404 when the case is not owned by the user', async () => {
    casesSingle.mockResolvedValue({ data: null });
    const res = await POST(makeReq());
    expect(res.status).toBe(404);
    expect(inngestSend).not.toHaveBeenCalled();
  });
});
