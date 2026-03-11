import { describe, it, expect } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import { validateCsrfToken, generateCsrfToken, withCsrf } from './csrf';

function makeRequest(opts: {
  cookieToken?: string;
  headerToken?: string;
}): NextRequest {
  const url = 'http://localhost:3000/api/test';
  const headers = new Headers();
  if (opts.headerToken) {
    headers.set('x-csrf-token', opts.headerToken);
  }
  if (opts.cookieToken) {
    headers.set('cookie', `csrf-token=${opts.cookieToken}`);
  }
  return new NextRequest(url, { method: 'POST', headers });
}

describe('csrf', () => {
  describe('validateCsrfToken', () => {
    it('should return null when token matches', () => {
      // Arrange
      const token = 'abc-123';
      const req = makeRequest({ cookieToken: token, headerToken: token });

      // Act
      const result = validateCsrfToken(req);

      // Assert
      expect(result).toBeNull();
    });

    it('should return 403 when header is missing', async () => {
      // Arrange
      const req = makeRequest({ cookieToken: 'abc-123' });

      // Act
      const result = validateCsrfToken(req);

      // Assert
      expect(result).not.toBeNull();
      expect(result!.status).toBe(403);
      const body = await result!.json();
      expect(body.success).toBe(false);
    });

    it('should return 403 when cookie is missing', async () => {
      // Arrange
      const req = makeRequest({ headerToken: 'abc-123' });

      // Act
      const result = validateCsrfToken(req);

      // Assert
      expect(result).not.toBeNull();
      expect(result!.status).toBe(403);
    });

    it('should return 403 when tokens mismatch', async () => {
      // Arrange
      const req = makeRequest({ cookieToken: 'token-a', headerToken: 'token-b' });

      // Act
      const result = validateCsrfToken(req);

      // Assert
      expect(result).not.toBeNull();
      expect(result!.status).toBe(403);
      const body = await result!.json();
      expect(body.error).toContain('CSRF');
    });
  });

  describe('generateCsrfToken', () => {
    it('should return a valid UUID string', () => {
      // Act
      const token = generateCsrfToken();

      // Assert
      expect(token).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
      );
    });
  });

  describe('withCsrf', () => {
    it('should call handler when CSRF token is valid', async () => {
      // Arrange
      const token = 'valid-token';
      const req = makeRequest({ cookieToken: token, headerToken: token });
      const handler = async () => NextResponse.json({ ok: true });

      // Act
      const wrapped = withCsrf(handler);
      const result = await wrapped(req);

      // Assert
      expect(result.status).toBe(200);
    });

    it('should return 403 without calling handler when CSRF token is invalid', async () => {
      // Arrange
      const req = makeRequest({ cookieToken: 'a', headerToken: 'b' });
      let handlerCalled = false;
      const handler = async () => {
        handlerCalled = true;
        return NextResponse.json({ ok: true });
      };

      // Act
      const wrapped = withCsrf(handler);
      const result = await wrapped(req);

      // Assert
      expect(result.status).toBe(403);
      expect(handlerCalled).toBe(false);
    });
  });
});
