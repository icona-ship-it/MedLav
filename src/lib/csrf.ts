import { NextRequest, NextResponse } from 'next/server';

/**
 * Generate a cryptographically random CSRF token.
 * Uses Web Crypto API (available in Edge Runtime, Node.js, and browsers).
 */
export function generateCsrfToken(): string {
  return globalThis.crypto.randomUUID();
}

/**
 * Validate the double-submit cookie CSRF pattern.
 * Compares the `x-csrf-token` header against the `csrf-token` cookie.
 * Returns null if valid, or a 403 NextResponse if invalid.
 */
export function validateCsrfToken(request: NextRequest): NextResponse | null {
  const cookieToken = request.cookies.get('csrf-token')?.value;
  const headerToken = request.headers.get('x-csrf-token');

  if (!cookieToken || !headerToken || cookieToken !== headerToken) {
    return NextResponse.json(
      { success: false, error: 'Token CSRF non valido. Ricarica la pagina e riprova.' },
      { status: 403 },
    );
  }

  return null;
}

type ApiRouteHandler = (request: NextRequest, context?: unknown) => Promise<NextResponse>;

/**
 * Higher-order function that wraps an API route handler with CSRF validation.
 * If the CSRF token is invalid, returns 403 without calling the handler.
 */
export function withCsrf(handler: ApiRouteHandler): ApiRouteHandler {
  return async (request: NextRequest, context?: unknown) => {
    const csrfError = validateCsrfToken(request);
    if (csrfError) {
      return csrfError;
    }
    return handler(request, context);
  };
}
