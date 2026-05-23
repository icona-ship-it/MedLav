import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Mock } from 'vitest';

vi.mock('@/lib/mistral/client', () => ({
  transcribeAudio: vi.fn(),
  MISTRAL_MODELS: { VOXTRAL_MINI: 'voxtral-mini-latest' },
}));

vi.mock('@/lib/logger', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import { transcribeDictation } from './transcription-service';
import { transcribeAudio } from '@/lib/mistral/client';

const mockTranscribe = transcribeAudio as Mock;

function audioBytes(size = 1024): Uint8Array {
  return new Uint8Array(size).fill(0);
}

function mockOk(over: Partial<{ text: string; language: string | null; durationSec: number; model: string }> = {}) {
  mockTranscribe.mockResolvedValue({
    text: 'Il paziente riferisce dolore al ginocchio destro.',
    language: 'it',
    durationSec: 12,
    model: 'voxtral-mini-latest',
    ...over,
  });
}

describe('transcribeDictation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should pass audio + mimeType + filename through to the client', async () => {
    mockOk();
    const audio = audioBytes(2048);

    await transcribeDictation({
      audio,
      mimeType: 'audio/webm;codecs=opus',
      filename: 'clip.webm',
      language: 'auto',
      label: 'dictation:test',
    });

    expect(mockTranscribe).toHaveBeenCalledTimes(1);
    const args = mockTranscribe.mock.calls[0][0];
    expect(args.audio).toBe(audio);
    expect(args.mimeType).toBe('audio/webm;codecs=opus');
    expect(args.filename).toBe('clip.webm');
    expect(args.label).toBe('dictation:test');
    expect(args.model).toBe('voxtral-mini-latest');
  });

  it('should omit language when auto-detect is requested', async () => {
    mockOk();

    await transcribeDictation({
      audio: audioBytes(),
      mimeType: 'audio/webm',
      filename: 'a.webm',
      language: 'auto',
      label: 'l',
    });

    const args = mockTranscribe.mock.calls[0][0];
    expect(args.language).toBeUndefined();
  });

  it('should pass language ISO code when pinned', async () => {
    mockOk();

    await transcribeDictation({
      audio: audioBytes(),
      mimeType: 'audio/webm',
      filename: 'a.webm',
      language: 'de',
      label: 'l',
    });

    expect(mockTranscribe.mock.calls[0][0].language).toBe('de');
  });

  it('should pass contextBias when a hint is given', async () => {
    mockOk();

    await transcribeDictation({
      audio: audioBytes(),
      mimeType: 'audio/webm',
      filename: 'a.webm',
      language: 'auto',
      contextHint: 'anamnesi ortopedica, ginocchio destro, frattura',
      label: 'l',
    });

    const args = mockTranscribe.mock.calls[0][0];
    expect(args.contextBias).toEqual(['anamnesi ortopedica', 'ginocchio destro', 'frattura']);
  });

  it('should cap contextBias to 8 terms', async () => {
    mockOk();
    const manyTerms = Array.from({ length: 15 }, (_, i) => `term${i}`).join(', ');

    await transcribeDictation({
      audio: audioBytes(),
      mimeType: 'audio/webm',
      filename: 'a.webm',
      language: 'auto',
      contextHint: manyTerms,
      label: 'l',
    });

    expect(mockTranscribe.mock.calls[0][0].contextBias).toHaveLength(8);
  });

  it('should drop empty / oversize context terms', async () => {
    mockOk();
    const tooLong = 'a'.repeat(100);
    await transcribeDictation({
      audio: audioBytes(),
      mimeType: 'audio/webm',
      filename: 'a.webm',
      language: 'auto',
      contextHint: `valid, , ${tooLong}, ok`,
      label: 'l',
    });

    expect(mockTranscribe.mock.calls[0][0].contextBias).toEqual(['valid', 'ok']);
  });

  it('should omit contextBias when hint resolves to no valid terms', async () => {
    mockOk();
    await transcribeDictation({
      audio: audioBytes(),
      mimeType: 'audio/webm',
      filename: 'a.webm',
      language: 'auto',
      contextHint: '  ,  ',
      label: 'l',
    });

    expect(mockTranscribe.mock.calls[0][0].contextBias).toBeUndefined();
  });

  it('should return text + language + durationSec from the client result', async () => {
    mockOk({ text: 'ciao mondo', language: 'it', durationSec: 7 });

    const result = await transcribeDictation({
      audio: audioBytes(),
      mimeType: 'audio/webm',
      filename: 'a.webm',
      language: 'auto',
      label: 'l',
    });

    expect(result).toEqual({
      text: 'ciao mondo',
      language: 'it',
      durationSec: 7,
      model: 'voxtral-mini-latest',
    });
  });

  it('should propagate errors from the underlying client', async () => {
    mockTranscribe.mockRejectedValue(new Error('voxtral 503'));

    await expect(
      transcribeDictation({
        audio: audioBytes(),
        mimeType: 'audio/webm',
        filename: 'a.webm',
        language: 'auto',
        label: 'l',
      }),
    ).rejects.toThrow('voxtral 503');
  });
});
