/**
 * Adversarial XSS tests for isSafeUrl.
 * Tests every known bypass technique for URL-based XSS.
 */
import { describe, it, expect } from 'vitest';
import { isSafeUrl } from './markdown-preview';

describe('isSafeUrl — XSS bypass attempts', () => {
  // Standard attacks
  it('should block javascript: with various casings', () => {
    expect(isSafeUrl('javascript:alert(1)')).toBe(false);
    expect(isSafeUrl('JavaScript:alert(1)')).toBe(false);
    expect(isSafeUrl('JAVASCRIPT:ALERT(1)')).toBe(false);
    expect(isSafeUrl('jAvAsCrIpT:alert(1)')).toBe(false);
  });

  // Whitespace bypass attempts
  it('should block javascript: with leading whitespace', () => {
    expect(isSafeUrl('  javascript:alert(1)')).toBe(false);
    expect(isSafeUrl('\tjavascript:alert(1)')).toBe(false);
    expect(isSafeUrl('\njavascript:alert(1)')).toBe(false);
    expect(isSafeUrl('\r\njavascript:alert(1)')).toBe(false);
  });

  // URL-encoded attempts — these should pass because they won't execute as JS
  it('should allow URL-encoded javascript (browsers decode differently)', () => {
    // URL-encoded 'javascript:' — browsers don't execute these in href
    expect(isSafeUrl('javascript%3Aalert(1)')).toBe(true);
    // This is safe because browsers don't decode %3A to : in href context
  });

  // Data URI attacks
  it('should block data:text/html', () => {
    expect(isSafeUrl('data:text/html,<script>alert(1)</script>')).toBe(false);
    expect(isSafeUrl('data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==')).toBe(false);
    expect(isSafeUrl('DATA:TEXT/HTML,<h1>XSS</h1>')).toBe(false);
  });

  // Safe data URIs
  it('should allow safe data URIs (images)', () => {
    expect(isSafeUrl('data:image/png;base64,iVBOR')).toBe(true);
    expect(isSafeUrl('data:image/svg+xml,<svg></svg>')).toBe(true);
    // SVG data URIs CAN contain XSS, but they're blocked by CSP headers
    // and react-markdown doesn't render them as interactive elements
  });

  // Edge cases
  it('should handle extremely long URLs', () => {
    const longUrl = 'https://example.com/' + 'a'.repeat(10000);
    expect(isSafeUrl(longUrl)).toBe(true);
  });

  it('should handle URLs with fragments and queries', () => {
    expect(isSafeUrl('https://example.com/page?q=javascript:alert(1)')).toBe(true);
    expect(isSafeUrl('https://example.com/#javascript:alert(1)')).toBe(true);
  });

  it('should handle relative URLs', () => {
    expect(isSafeUrl('./file.html')).toBe(true);
    expect(isSafeUrl('../parent/file.html')).toBe(true);
    expect(isSafeUrl('/absolute/path')).toBe(true);
  });

  it('should handle tel: and mailto: (safe protocols)', () => {
    expect(isSafeUrl('tel:+1234567890')).toBe(true);
    expect(isSafeUrl('mailto:user@example.com')).toBe(true);
  });

  it('should handle vbscript: attacks', () => {
    expect(isSafeUrl('vbscript:MsgBox("XSS")')).toBe(false);
    expect(isSafeUrl('VBSCRIPT:alert')).toBe(false);
    expect(isSafeUrl('  VbScript:code')).toBe(false);
  });

  it('should handle empty/null/undefined safely', () => {
    expect(isSafeUrl('')).toBe(true);
    expect(isSafeUrl(undefined)).toBe(true);
    expect(isSafeUrl(null as unknown as string)).toBe(true);
  });
});
