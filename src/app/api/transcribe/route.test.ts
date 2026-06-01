import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextRequest } from 'next/server';

const UUID = '22222222-2222-4222-8222-222222222222';

const { transcribeDictation, logAccess, refundCredits, deductCredits } = vi.hoisted(() => ({
  transcribeDictation: vi.fn(),
  logAccess: vi.fn(),
  refundCredits: vi.fn(),
  deductCredits: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: UUID } } }) } }),
}));
vi.mock('@/lib/csrf', () => ({ validateCsrfToken: () => null }));
vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: async () => ({ success: true }),
  RATE_LIMITS: { DICTATION: { limit: 30, windowSec: 3600 } },
}));
vi.mock('@/services/credits/credit-service', () => ({ deductCredits, refundCredits }));
vi.mock('@/services/credits/credit-costs', () => ({ CREDIT_COSTS: { dettatura: 1 } }));
vi.mock('@/services/transcription/transcription-service', () => ({ transcribeDictation }));
vi.mock('@/services/transcription/transcription-types', () => ({ DICTATION_MAX_AUDIO_BYTES: 25 * 1024 * 1024 }));
vi.mock('@/services/transcription/transcription-validators', () => ({
  isAllowedDictationMime: () => true,
  looksLikeAudioBytes: () => true,
  filenameForMime: () => 'audio.webm',
}));
vi.mock('@/lib/audit', () => ({ logAccess }));
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock('@/lib/user-error-messages', () => ({ toUserMessage: (m: string) => m }));

import { POST } from './route';

function makeReq(): NextRequest {
  const fd = new FormData();
  fd.append('audio', new Blob([new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8])], { type: 'audio/webm' }));
  fd.append('metadata', JSON.stringify({ language: 'it' }));
  return {
    formData: async () => fd,
    headers: { get: () => null },
  } as unknown as NextRequest;
}

beforeEach(() => {
  vi.clearAllMocks();
  deductCredits.mockResolvedValue({ success: true });
});

describe('POST /api/transcribe — GDPR: audio never persisted, transcript not logged', () => {
  it('returns the transcript but the audit log records ONLY metadata (no transcript text)', async () => {
    transcribeDictation.mockResolvedValue({
      text: 'Il paziente riferisce dolore al ginocchio destro', // sensitive — must NOT be logged
      language: 'it',
      durationSec: 4,
      model: 'voxtral-mini-latest',
    });

    const res = await POST(makeReq());
    const json = await res.json() as { success: boolean; data?: { text: string } };

    // Transcript IS returned to the caller…
    expect(json.success).toBe(true);
    expect(json.data?.text).toContain('ginocchio');

    // …but the audit log NEVER contains it (GDPR: only metadata).
    expect(logAccess).toHaveBeenCalledTimes(1);
    const auditArg = logAccess.mock.calls[0][0] as { metadata: Record<string, unknown> };
    const serialized = JSON.stringify(auditArg.metadata);
    expect(serialized).not.toContain('ginocchio');
    expect(serialized).not.toContain('paziente');
    expect(auditArg.metadata).toMatchObject({ durationSec: 4, languageDetected: 'it' });
    // metadata carries no transcript field
    expect(auditArg.metadata.text).toBeUndefined();
    expect(auditArg.metadata.transcript).toBeUndefined();
  });

  it('refunds the credit when transcription fails (no silent charge)', async () => {
    transcribeDictation.mockRejectedValue(new Error('voxtral 503'));

    const res = await POST(makeReq());
    expect(res.status).toBe(500);
    expect(refundCredits).toHaveBeenCalledWith(UUID, 1, 'dettatura', undefined, expect.objectContaining({ reason: 'transcription_failed' }));
  });

  it('does not transcribe (and does not charge) when the user is unauthenticated', async () => {
    // override auth for this test
    const mod = await import('@/lib/supabase/server');
    vi.spyOn(mod, 'createClient').mockResolvedValueOnce({
      auth: { getUser: async () => ({ data: { user: null } }) },
    } as unknown as Awaited<ReturnType<typeof mod.createClient>>);

    const res = await POST(makeReq());
    expect(res.status).toBe(401);
    expect(deductCredits).not.toHaveBeenCalled();
    expect(transcribeDictation).not.toHaveBeenCalled();
  });
});
