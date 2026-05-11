import { describe, it, expect } from 'vitest';
import { computeFileSha256 } from './file-hash';

describe('computeFileSha256', () => {
  it('should compute the correct SHA-256 for empty content', async () => {
    const file = new File([], 'empty.txt', { type: 'text/plain' });
    const hash = await computeFileSha256(file);
    // SHA-256 of empty string
    expect(hash).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  });

  it('should compute deterministic hash for the same content', async () => {
    const content = 'Hello, MedLav!';
    const file1 = new File([content], 'a.txt', { type: 'text/plain' });
    const file2 = new File([content], 'b-different-name.txt', { type: 'text/plain' });
    const hash1 = await computeFileSha256(file1);
    const hash2 = await computeFileSha256(file2);
    expect(hash1).toBe(hash2);
    expect(hash1).toHaveLength(64);
  });

  it('should produce different hashes for different content', async () => {
    const file1 = new File(['content A'], 'a.txt', { type: 'text/plain' });
    const file2 = new File(['content B'], 'a.txt', { type: 'text/plain' });
    const hash1 = await computeFileSha256(file1);
    const hash2 = await computeFileSha256(file2);
    expect(hash1).not.toBe(hash2);
  });

  it('should return lowercase hex', async () => {
    const file = new File(['test'], 'test.txt', { type: 'text/plain' });
    const hash = await computeFileSha256(file);
    expect(hash).toBeTruthy();
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('should handle binary content (Uint8Array)', async () => {
    const bytes = new Uint8Array([0x00, 0x01, 0x02, 0xff, 0xfe]);
    const file = new File([bytes], 'bin.dat', { type: 'application/octet-stream' });
    const hash = await computeFileSha256(file);
    expect(hash).toBeTruthy();
    expect(hash).toHaveLength(64);
  });
});
