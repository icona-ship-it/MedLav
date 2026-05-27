import { describe, it, expect } from 'vitest';
import {
  isAllowedDocumentMime,
  detectMimeFromMagic,
  validateDocumentBytes,
} from './file-validators';

describe('isAllowedDocumentMime', () => {
  it('accepts whitelisted MIME types', () => {
    expect(isAllowedDocumentMime('application/pdf')).toBe(true);
    expect(isAllowedDocumentMime('image/jpeg')).toBe(true);
    expect(isAllowedDocumentMime('image/png')).toBe(true);
    expect(isAllowedDocumentMime('image/tiff')).toBe(true);
    expect(isAllowedDocumentMime('image/webp')).toBe(true);
    expect(isAllowedDocumentMime('application/msword')).toBe(true);
    expect(isAllowedDocumentMime('application/vnd.openxmlformats-officedocument.wordprocessingml.document')).toBe(true);
    expect(isAllowedDocumentMime('application/vnd.ms-excel')).toBe(true);
    expect(isAllowedDocumentMime('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')).toBe(true);
  });

  it('rejects unrelated types', () => {
    expect(isAllowedDocumentMime('application/x-executable')).toBe(false);
    expect(isAllowedDocumentMime('text/html')).toBe(false);
    expect(isAllowedDocumentMime('application/zip')).toBe(false);
    expect(isAllowedDocumentMime('video/mp4')).toBe(false);
    expect(isAllowedDocumentMime('')).toBe(false);
  });
});

describe('detectMimeFromMagic', () => {
  it('detects PDF', () => {
    const bytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]); // %PDF-1.4
    expect(detectMimeFromMagic(bytes)).toBe('application/pdf');
  });

  it('detects JPEG', () => {
    const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0]);
    expect(detectMimeFromMagic(bytes)).toBe('image/jpeg');
  });

  it('detects PNG', () => {
    const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    expect(detectMimeFromMagic(bytes)).toBe('image/png');
  });

  it('detects TIFF little-endian', () => {
    const bytes = new Uint8Array([0x49, 0x49, 0x2a, 0x00, 0, 0, 0, 0]);
    expect(detectMimeFromMagic(bytes)).toBe('image/tiff');
  });

  it('detects TIFF big-endian', () => {
    const bytes = new Uint8Array([0x4d, 0x4d, 0x00, 0x2a, 0, 0, 0, 0]);
    expect(detectMimeFromMagic(bytes)).toBe('image/tiff');
  });

  it('detects WebP', () => {
    const bytes = new Uint8Array([
      0x52, 0x49, 0x46, 0x46, // RIFF
      0, 0, 0, 0,             // size placeholder
      0x57, 0x45, 0x42, 0x50, // WEBP
    ]);
    expect(detectMimeFromMagic(bytes)).toBe('image/webp');
  });

  it('detects DOCX/XLSX as zip-office sentinel', () => {
    const bytes = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0, 0, 0, 0]);
    expect(detectMimeFromMagic(bytes)).toBe('application/zip-office');
  });

  it('detects legacy DOC/XLS as cfb-office sentinel', () => {
    const bytes = new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
    expect(detectMimeFromMagic(bytes)).toBe('application/cfb-office');
  });

  it('returns null for unknown magic', () => {
    expect(detectMimeFromMagic(new Uint8Array([0x00, 0x00, 0x00, 0x00]))).toBe(null);
    expect(detectMimeFromMagic(new Uint8Array([0xff, 0xff, 0xff, 0xff]))).toBe(null);
  });

  it('returns null for too-short buffers', () => {
    expect(detectMimeFromMagic(new Uint8Array(0))).toBe(null);
    expect(detectMimeFromMagic(new Uint8Array([0x25, 0x50]))).toBe(null);
  });
});

describe('validateDocumentBytes', () => {
  it('approves a real PDF', () => {
    const bytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]);
    expect(validateDocumentBytes(bytes, 'application/pdf')).toEqual({ ok: true });
  });

  it('approves a real PNG', () => {
    const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    expect(validateDocumentBytes(bytes, 'image/png')).toEqual({ ok: true });
  });

  it('approves DOCX claiming the right MIME', () => {
    const bytes = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0, 0, 0, 0]);
    const result = validateDocumentBytes(
      bytes,
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    );
    expect(result.ok).toBe(true);
  });

  it('approves XLSX with matching MIME', () => {
    const bytes = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0, 0, 0, 0]);
    expect(
      validateDocumentBytes(
        bytes,
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      ).ok,
    ).toBe(true);
  });

  it('approves legacy DOC', () => {
    const bytes = new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
    expect(validateDocumentBytes(bytes, 'application/msword').ok).toBe(true);
  });

  it('rejects empty buffer', () => {
    expect(validateDocumentBytes(new Uint8Array(0), 'application/pdf').ok).toBe(false);
  });

  it('rejects unknown MIME', () => {
    const bytes = new Uint8Array([0x25, 0x50, 0x44, 0x46]);
    const result = validateDocumentBytes(bytes, 'application/x-executable');
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('non supportato');
  });

  it('rejects file that lies about MIME (PDF bytes, claims PNG)', () => {
    const bytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]);
    const result = validateDocumentBytes(bytes, 'image/png');
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('non corrisponde');
  });

  it('rejects file with unrecognized magic but allowed MIME (e.g. exe renamed pdf)', () => {
    // Windows PE/COFF magic "MZ"
    const bytes = new Uint8Array([0x4d, 0x5a, 0x90, 0x00, 0, 0, 0, 0]);
    const result = validateDocumentBytes(bytes, 'application/pdf');
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('non riconosciuto');
  });

  it('rejects DOCX claiming PDF MIME', () => {
    const bytes = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0, 0, 0, 0]);
    const result = validateDocumentBytes(bytes, 'application/pdf');
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('non corrisponde');
  });
});
