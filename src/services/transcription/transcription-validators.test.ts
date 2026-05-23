import { describe, it, expect } from 'vitest';
import {
  isAllowedDictationMime,
  looksLikeAudioBytes,
  filenameForMime,
} from './transcription-validators';

describe('isAllowedDictationMime', () => {
  it('accepts canonical audio MIME types', () => {
    expect(isAllowedDictationMime('audio/webm')).toBe(true);
    expect(isAllowedDictationMime('audio/mp4')).toBe(true);
    expect(isAllowedDictationMime('audio/mpeg')).toBe(true);
    expect(isAllowedDictationMime('audio/wav')).toBe(true);
    expect(isAllowedDictationMime('audio/ogg')).toBe(true);
  });

  it('accepts codec hints appended by browsers', () => {
    expect(isAllowedDictationMime('audio/webm;codecs=opus')).toBe(true);
    expect(isAllowedDictationMime('audio/ogg;codecs=opus')).toBe(true);
    expect(isAllowedDictationMime('audio/mp4;codecs=mp4a.40.2')).toBe(true);
  });

  it('accepts WAV aliases', () => {
    expect(isAllowedDictationMime('audio/wave')).toBe(true);
    expect(isAllowedDictationMime('audio/x-wav')).toBe(true);
  });

  it('rejects unrelated MIME types', () => {
    expect(isAllowedDictationMime('application/pdf')).toBe(false);
    expect(isAllowedDictationMime('image/png')).toBe(false);
    expect(isAllowedDictationMime('video/mp4')).toBe(false);
    expect(isAllowedDictationMime('text/plain')).toBe(false);
  });

  it('rejects empty / invalid input', () => {
    expect(isAllowedDictationMime('')).toBe(false);
    // @ts-expect-error testing runtime defensive behavior
    expect(isAllowedDictationMime(undefined)).toBe(false);
  });
});

describe('looksLikeAudioBytes', () => {
  it('detects OGG header', () => {
    const oggHeader = new Uint8Array([0x4f, 0x67, 0x67, 0x53, 0, 0, 0, 0, 0, 0]);
    expect(looksLikeAudioBytes(oggHeader)).toBe(true);
  });

  it('detects RIFF/WAV header', () => {
    const wav = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x41, 0x56, 0x45]);
    expect(looksLikeAudioBytes(wav)).toBe(true);
  });

  it('detects MP3 with ID3 tag', () => {
    const mp3 = new Uint8Array([0x49, 0x44, 0x33, 0x04, 0, 0, 0, 0]);
    expect(looksLikeAudioBytes(mp3)).toBe(true);
  });

  it('detects MP3 with MPEG sync word', () => {
    const mp3 = new Uint8Array([0xff, 0xfb, 0x90, 0, 0, 0, 0, 0]);
    expect(looksLikeAudioBytes(mp3)).toBe(true);
  });

  it('detects WebM/Matroska EBML header', () => {
    const webm = new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0, 0, 0, 0]);
    expect(looksLikeAudioBytes(webm)).toBe(true);
  });

  it('detects MP4 ftyp box', () => {
    const m4a = new Uint8Array([0, 0, 0, 0x20, 0x66, 0x74, 0x79, 0x70, 0, 0, 0, 0]);
    expect(looksLikeAudioBytes(m4a)).toBe(true);
  });

  it('rejects PDF header', () => {
    const pdf = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]);
    expect(looksLikeAudioBytes(pdf)).toBe(false);
  });

  it('rejects PNG header', () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    expect(looksLikeAudioBytes(png)).toBe(false);
  });

  it('rejects too-short buffers', () => {
    expect(looksLikeAudioBytes(new Uint8Array(0))).toBe(false);
    expect(looksLikeAudioBytes(new Uint8Array([0x1a, 0x45]))).toBe(false);
  });
});

describe('filenameForMime', () => {
  it('maps each supported MIME to the right extension', () => {
    expect(filenameForMime('audio/webm')).toBe('dictation.webm');
    expect(filenameForMime('audio/webm;codecs=opus')).toBe('dictation.webm');
    expect(filenameForMime('audio/mp4')).toBe('dictation.m4a');
    expect(filenameForMime('audio/mpeg')).toBe('dictation.mp3');
    expect(filenameForMime('audio/wav')).toBe('dictation.wav');
    expect(filenameForMime('audio/wave')).toBe('dictation.wav');
    expect(filenameForMime('audio/x-wav')).toBe('dictation.wav');
    expect(filenameForMime('audio/ogg')).toBe('dictation.ogg');
  });

  it('falls back to ogg for unknown but accepted-ish MIME', () => {
    expect(filenameForMime('audio/x-vorbis')).toBe('dictation.ogg');
  });
});
