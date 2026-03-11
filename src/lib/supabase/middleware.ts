import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { generateCsrfToken } from '@/lib/csrf';

/**
 * Build a Content-Security-Policy header.
 * Uses 'unsafe-inline' for both script-src and style-src because:
 * - Next.js App Router injects inline scripts for hydration without nonce support
 * - Tailwind CSS / shadcn inject inline styles
 * In development, 'unsafe-eval' is added for HMR.
 */
function buildCspHeader(): string {
  const isDev = process.env.NODE_ENV === 'development';

  const scriptSrc = isDev
    ? `'self' 'unsafe-inline' 'unsafe-eval'`
    : `'self' 'unsafe-inline'`;

  const directives = [
    `default-src 'self'`,
    `script-src ${scriptSrc}`,
    `style-src 'self' 'unsafe-inline'`,
    `img-src 'self' data: blob: https:`,
    `font-src 'self' data:`,
    `connect-src 'self' https://*.supabase.co https://*.mistral.ai https://*.inngest.com https://*.sentry.io`,
    `frame-ancestors 'none'`,
  ];

  return directives.join('; ') + ';';
}

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const publicPaths = ['/landing', '/login', '/register', '/forgot-password', '/auth', '/shared', '/terms', '/privacy', '/security', '/pricing', '/help'];
  const isPublicPath = publicPaths.some((path) =>
    request.nextUrl.pathname.startsWith(path),
  );

  // Redirect unauthenticated users to landing page
  if (!user && !isPublicPath) {
    const url = request.nextUrl.clone();
    url.pathname = '/landing';
    return NextResponse.redirect(url);
  }

  // Check if the user has been deactivated (cookie set by signIn check)
  if (user && !isPublicPath && request.cookies.get('deactivated')?.value) {
    await supabase.auth.signOut();
    const url = request.nextUrl.clone();
    url.pathname = '/landing';
    const redirectResponse = NextResponse.redirect(url);
    redirectResponse.cookies.delete('deactivated');
    return redirectResponse;
  }

  // Redirect authenticated users away from public pages to dashboard
  if (
    user &&
    (request.nextUrl.pathname.startsWith('/login') ||
      request.nextUrl.pathname.startsWith('/register') ||
      request.nextUrl.pathname.startsWith('/forgot-password') ||
      request.nextUrl.pathname.startsWith('/landing'))
  ) {
    const url = request.nextUrl.clone();
    url.pathname = '/';
    return NextResponse.redirect(url);
  }

  // Set CSRF token cookie if not present (double-submit cookie pattern)
  if (!isPublicPath && !request.cookies.get('csrf-token')?.value) {
    const csrfToken = generateCsrfToken();
    supabaseResponse.cookies.set('csrf-token', csrfToken, {
      httpOnly: false, // JS must read this to send as header
      sameSite: 'strict',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
    });
  }

  // Set CSP header (without nonce — Next.js App Router doesn't propagate nonces to hydration scripts)
  supabaseResponse.headers.set('Content-Security-Policy', buildCspHeader());

  return supabaseResponse;
}
