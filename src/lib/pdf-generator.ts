/**
 * Server-side PDF generation via Puppeteer + Chromium.
 *
 * Production (Vercel Lambda): uses @sparticuz/chromium bundled binary.
 * Local dev: falls back to a system Chrome/Chromium discovered at common
 * macOS / Linux paths. If neither is found, throws with a clear message.
 *
 * NB: caller owns the browser lifecycle indirectly via this helper —
 * `htmlToPdfBuffer` opens, renders, and closes a fresh browser per call
 * to keep memory predictable on Vercel (no warm-page reuse).
 */

import chromium from '@sparticuz/chromium';
import puppeteer, { type Browser, type PaperFormat } from 'puppeteer-core';
import { logger } from '@/lib/logger';

const TAG = 'pdf-generator';

const LOCAL_CHROME_CANDIDATES = [
  // macOS
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  // Linux
  '/usr/bin/google-chrome',
  '/usr/bin/chromium-browser',
  '/usr/bin/chromium',
];

function isLambdaEnvironment(): boolean {
  // Vercel sets AWS_LAMBDA_FUNCTION_NAME for serverless functions
  return Boolean(process.env.AWS_LAMBDA_FUNCTION_NAME) || Boolean(process.env.VERCEL);
}

async function resolveExecutablePath(): Promise<string> {
  if (isLambdaEnvironment()) {
    return chromium.executablePath();
  }
  // Local dev: pick the first existing candidate
  const fs = await import('node:fs/promises');
  for (const candidate of LOCAL_CHROME_CANDIDATES) {
    try {
      await fs.access(candidate);
      return candidate;
    } catch {
      // try next
    }
  }
  throw new Error(
    'No local Chrome/Chromium found for PDF generation. ' +
    'Install Google Chrome or set PUPPETEER_EXECUTABLE_PATH.',
  );
}

async function launchBrowser(): Promise<Browser> {
  const executablePath = process.env.PUPPETEER_EXECUTABLE_PATH ?? (await resolveExecutablePath());

  if (isLambdaEnvironment()) {
    return puppeteer.launch({
      args: chromium.args,
      defaultViewport: { width: 1280, height: 720 },
      executablePath,
      headless: true,
    });
  }
  // Local dev: minimal args, system Chrome
  return puppeteer.launch({
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    executablePath,
    headless: true,
  });
}

export interface HtmlToPdfOptions {
  /** Paper size — defaults to A4 for medical-legal reports. */
  format?: PaperFormat;
  /** CSS margin per side, e.g. '1in' or '2cm'. */
  margin?: { top?: string; right?: string; bottom?: string; left?: string };
  /** Whether to render CSS @page backgrounds (default true). */
  printBackground?: boolean;
  /** Page navigation timeout in ms. Default 30s. */
  timeoutMs?: number;
}

/**
 * Render an HTML string to a PDF Buffer.
 *
 * @param html — full HTML document (must include `<!doctype html>` for proper rendering)
 * @param opts — paper format, margins, etc.
 */
export async function htmlToPdfBuffer(html: string, opts: HtmlToPdfOptions = {}): Promise<Buffer> {
  const {
    format = 'A4',
    margin = { top: '1in', right: '1in', bottom: '1in', left: '1in' },
    printBackground = true,
    timeoutMs = 30_000,
  } = opts;

  const startMs = Date.now();
  let browser: Browser | null = null;

  try {
    browser = await launchBrowser();
    const page = await browser.newPage();
    // Emulate print media so @media print rules in the HTML apply
    await page.emulateMediaType('print');
    await page.setContent(html, { waitUntil: 'load', timeout: timeoutMs });

    const pdf = await page.pdf({
      format,
      printBackground,
      margin,
      preferCSSPageSize: false,
    });

    logger.info(TAG, 'PDF generated', {
      bytes: pdf.length,
      htmlBytes: html.length,
      elapsedMs: Date.now() - startMs,
    });

    return Buffer.from(pdf);
  } finally {
    if (browser) {
      try {
        await browser.close();
      } catch (closeErr) {
        logger.warn(TAG, 'Browser close failed', {
          error: closeErr instanceof Error ? closeErr.message : 'unknown',
        });
      }
    }
  }
}
