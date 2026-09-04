import type { NextConfig } from 'next';
import { withSentryConfig } from '@sentry/nextjs';
import { execSync } from 'node:child_process';

/** Sha del commit in build: Vercel lo espone, in locale lo chiediamo a git.
 * Versione VISIBILE (ciclo di consegna 2026-09-04): il medico e il founder
 * devono poter dire quale build ha prodotto un'analisi. Mai bloccare la build
 * se git non c'è (CI/container): resta vuoto → "sviluppo". */
function resolveBuildSha(): string {
  if (process.env.VERCEL_GIT_COMMIT_SHA) return process.env.VERCEL_GIT_COMMIT_SHA;
  try {
    return execSync('git rev-parse HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    return '';
  }
}

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_BUILD_SHA: resolveBuildSha(),
    NEXT_PUBLIC_BUILD_TIME: new Date().toISOString(),
  },
  // Externalize heavy server-only packages to keep route bundles small.
  // Puppeteer + Chromium are used only by /api/cases/[id]/export/pdf and
  // must not be bundled into every Lambda.
  serverExternalPackages: ['puppeteer-core', '@sparticuz/chromium'],
  webpack: (config) => {
    // Hide webpack's own cache-serialization hints ("<w> Serializing big
    // strings...") from build logs; real errors still surface.
    config.infrastructureLogging = { ...config.infrastructureLogging, level: 'error' };
    return config;
  },
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
            // Nessuna feature browser sensibile è usata dall'app: camera,
            // microfono e geolocalizzazione sono negati a livello di pagina.
            // (microphone era (self) per la dettatura vocale, rimossa il 2026-06-10.)
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=()',
          },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=31536000; includeSubDomains',
          },
          // CSP is set in middleware (see src/lib/supabase/middleware.ts).
          // NB: usa 'unsafe-inline' per script/style (App Router + Tailwind/shadcn
          // iniettano inline senza supporto nonce), non un nonce per-request.
        ],
      },
    ];
  },
};

export default withSentryConfig(nextConfig, {
  // For all available options, see:
  // https://www.npmjs.com/package/@sentry/webpack-plugin#options

  org: "edo-montagna",

  project: "javascript-nextjs",

  // Suppress the per-file source map upload report in build logs (errors still surface)
  silent: true,

  // No usage telemetry sent to Sentry from the build plugin
  telemetry: false,

  // For all available options, see:
  // https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/

  // Upload a larger set of source maps for prettier stack traces (increases build time)
  widenClientFileUpload: true,

  // Uncomment to route browser requests to Sentry through a Next.js rewrite to circumvent ad-blockers.
  // This can increase your server load as well as your hosting bill.
  // Note: Check that the configured route will not match with your Next.js middleware, otherwise reporting of client-
  // side errors will fail.
  // tunnelRoute: "/monitoring",

  webpack: {
    // Enables automatic instrumentation of Vercel Cron Monitors. (Does not yet work with App Router route handlers.)
    // See the following for more information:
    // https://docs.sentry.io/product/crons/
    // https://vercel.com/docs/cron-jobs
    automaticVercelMonitors: true,

    // Tree-shaking options for reducing bundle size
    treeshake: {
      // Automatically tree-shake Sentry logger statements to reduce bundle size
      removeDebugLogging: true,
    },
  },
});
