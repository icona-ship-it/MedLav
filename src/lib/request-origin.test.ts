import { describe, expect, it } from 'vitest';
import { resolveRequestOrigin } from './request-origin';

function headersOf(entries: Record<string, string>): { get(name: string): string | null } {
  const lower = Object.fromEntries(
    Object.entries(entries).map(([k, v]) => [k.toLowerCase(), v]),
  );
  return { get: (name: string) => lower[name.toLowerCase()] ?? null };
}

describe('resolveRequestOrigin', () => {
  it('should build the origin from x-forwarded-host and x-forwarded-proto when present', () => {
    const headers = headersOf({
      'x-forwarded-host': 'legmed.vercel.app',
      'x-forwarded-proto': 'https',
    });

    expect(resolveRequestOrigin(headers, undefined)).toBe('https://legmed.vercel.app');
  });

  it('should fall back to the host header when x-forwarded-host is missing', () => {
    const headers = headersOf({ host: 'medlav.vercel.app' });

    expect(resolveRequestOrigin(headers, undefined)).toBe('https://medlav.vercel.app');
  });

  it('should take the first value when forwarded headers are comma-separated lists', () => {
    const headers = headersOf({
      'x-forwarded-host': 'legmed.vercel.app, internal.proxy',
      'x-forwarded-proto': 'https,http',
    });

    expect(resolveRequestOrigin(headers, undefined)).toBe('https://legmed.vercel.app');
  });

  it('should default to https when the proto header is missing on a public host', () => {
    const headers = headersOf({ host: 'legmed.vercel.app' });

    expect(resolveRequestOrigin(headers, undefined)).toBe('https://legmed.vercel.app');
  });

  it('should default to http when the host is localhost without a proto header', () => {
    const headers = headersOf({ host: 'localhost:3000' });

    expect(resolveRequestOrigin(headers, undefined)).toBe('http://localhost:3000');
  });

  it('should fall back to the configured site URL when no host header is available', () => {
    const headers = headersOf({});

    expect(resolveRequestOrigin(headers, 'https://legmed.vercel.app')).toBe('https://legmed.vercel.app');
  });

  it('should fall back to localhost when neither headers nor site URL are available', () => {
    const headers = headersOf({});

    expect(resolveRequestOrigin(headers, undefined)).toBe('http://localhost:3000');
  });

  it('should ignore an empty host header instead of building a broken origin', () => {
    const headers = headersOf({ host: '' });

    expect(resolveRequestOrigin(headers, 'https://legmed.vercel.app')).toBe('https://legmed.vercel.app');
  });
});
