import type { NextConfig } from 'next';
import { withSentryConfig } from '@sentry/nextjs';

const nextConfig: NextConfig = {
  // Security headers
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'X-XSS-Protection',
            value: '1; mode=block',
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=()',
          },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=31536000; includeSubDomains',
          },
          {
            key: 'Content-Security-Policy',
            value: process.env.NODE_ENV === 'development'
              ? "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; font-src 'self' data:; connect-src 'self' https://*.supabase.co https://*.mistral.ai https://*.inngest.com https://*.sentry.io; frame-ancestors 'none';"
              : "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; font-src 'self' data:; connect-src 'self' https://*.supabase.co https://*.mistral.ai https://*.inngest.com https://*.sentry.io; frame-ancestors 'none';",
          },
        ],
      },
    ];
  },
};

export default withSentryConfig(nextConfig, {
  // Sentry build options — silent when no DSN configured
  silent: !process.env.NEXT_PUBLIC_SENTRY_DSN,
  disableLogger: true,
  // Only upload source maps when DSN is configured
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
});
