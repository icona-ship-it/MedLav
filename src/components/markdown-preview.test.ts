import { describe, it, expect } from 'vitest';
import { isSafeUrl } from './markdown-preview';

describe('isSafeUrl', () => {
  it('should allow normal URLs', () => {
    expect(isSafeUrl('https://example.com')).toBe(true);
    expect(isSafeUrl('http://example.com')).toBe(true);
    expect(isSafeUrl('/api/cases/123/images?path=foo.png')).toBe(true);
    expect(isSafeUrl('#section')).toBe(true);
    expect(isSafeUrl('mailto:test@example.com')).toBe(true);
  });

  it('should block javascript: protocol', () => {
    expect(isSafeUrl('javascript:alert(1)')).toBe(false);
    expect(isSafeUrl('JavaScript:alert(1)')).toBe(false);
    expect(isSafeUrl('JAVASCRIPT:alert(document.cookie)')).toBe(false);
    expect(isSafeUrl('  javascript:void(0)')).toBe(false);
  });

  it('should block vbscript: protocol', () => {
    expect(isSafeUrl('vbscript:MsgBox("XSS")')).toBe(false);
    expect(isSafeUrl('VBScript:alert')).toBe(false);
  });

  it('should block data:text/html', () => {
    expect(isSafeUrl('data:text/html,<script>alert(1)</script>')).toBe(false);
    expect(isSafeUrl('data:text/html;base64,PHNjcmlwdD4=')).toBe(false);
  });

  it('should allow data: URLs for images (not text/html)', () => {
    expect(isSafeUrl('data:image/png;base64,iVBOR')).toBe(true);
    expect(isSafeUrl('data:image/jpeg;base64,/9j/')).toBe(true);
  });

  it('should allow undefined and empty strings', () => {
    expect(isSafeUrl(undefined)).toBe(true);
    expect(isSafeUrl('')).toBe(true);
  });
});
