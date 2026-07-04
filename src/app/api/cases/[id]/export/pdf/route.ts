/**
 * GET /api/cases/[id]/export/pdf
 *
 * Server-side PDF export. Renders the same HTML produced by /export/html
 * via headless Chromium and returns a downloadable PDF.
 *
 * Why this exists: closes feedback B1 from Lavini ("no direct PDF download —
 * 3 clicks via browser print dialog"). The user now clicks once and gets the
 * PDF file already formatted A4 with margins, ready for Tribunale deposit.
 *
 * GDPR: NO new data stored, no audio/image persistence. The PDF buffer lives
 * only in memory for the duration of the response. Audit log records the
 * export action with metadata-only (format, reportVersion, anonymized flag).
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { checkRateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import { htmlToPdfBuffer } from '@/lib/pdf-generator';
import { applyAiActPdfMetadata } from '@/services/export/ai-act-disclosure';
import { logAccess } from '@/lib/audit';
import { logger } from '@/lib/logger';

export const runtime = 'nodejs';
export const maxDuration = 60;

const TAG = 'export-pdf';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ success: false, error: 'Non autenticato' }, { status: 401 });
  }

  const rateCheck = await checkRateLimit({ key: `export-pdf:${user.id}`, ...RATE_LIMITS.API });
  if (!rateCheck.success) {
    return NextResponse.json(
      { success: false, error: 'Troppe richieste. Riprova tra poco.' },
      { status: 429 },
    );
  }

  const { id: caseId } = await params;
  const shouldAnonymize = request.nextUrl.searchParams.get('anonymize') === 'true';

  try {
    // ── Reuse the existing HTML export route to produce the same exact markup ──
    // We forward cookies so the inner request inherits the user's session
    // (ownership/RLS checks happen inside the html route).
    const origin = request.nextUrl.origin;
    const htmlUrl = new URL(`/api/cases/${caseId}/export/html`, origin);
    htmlUrl.searchParams.set('inline', 'true');
    if (shouldAnonymize) {
      htmlUrl.searchParams.set('anonymize', 'true');
    }

    const cookieHeader = request.headers.get('cookie') ?? '';
    const htmlResp = await fetch(htmlUrl.toString(), {
      headers: { cookie: cookieHeader },
      // Internal call — disable cache, always fresh
      cache: 'no-store',
    });

    if (!htmlResp.ok) {
      const body = await htmlResp.text().catch(() => '');
      // 428 = gate attestazione dall'export HTML interno: inoltra il messaggio
      // reale invece del generico "riprova" (l'utente deve riapprovare, non riprovare).
      if (htmlResp.status === 428) {
        let innerError = 'Attestazione richiesta: riapprova il report prima dell\'export depositabile.';
        try {
          const parsed = JSON.parse(body) as { error?: string };
          if (parsed.error) innerError = parsed.error;
        } catch { /* body non-JSON: tieni il messaggio di default */ }
        return NextResponse.json({ success: false, error: innerError }, { status: 428 });
      }
      logger.error(TAG, 'Inner HTML export failed', {
        caseId,
        status: htmlResp.status,
        bodyPreview: body.slice(0, 200),
      });
      return NextResponse.json(
        { success: false, error: 'Generazione PDF non disponibile. Riprova tra poco.' },
        { status: 502 },
      );
    }

    const html = await htmlResp.text();
    if (!html || html.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Report vuoto: impossibile generare il PDF.' },
        { status: 404 },
      );
    }

    const reportStatus = htmlResp.headers.get('x-report-status') ?? 'bozza';

    const renderedPdf = await htmlToPdfBuffer(html, {
      format: 'A4',
      margin: { top: '1in', right: '1in', bottom: '1in', left: '1in' },
      printBackground: true,
    });
    // Marcatura machine-readable art. 50(2) AI Act nei metadati del PDF
    // (Chromium non permette di impostarli in fase di render). Best-effort:
    // se pdf-lib fallisce (PDF enorme/edge-case di parsing) esce il PDF NON
    // marcato — la dicitura visibile è comunque nel contenuto renderizzato,
    // e negare il documento per la sola marcatura sarebbe peggio (review 2026-07-04).
    let pdfBuffer = renderedPdf;
    try {
      pdfBuffer = await applyAiActPdfMetadata(renderedPdf);
    } catch (markErr) {
      logger.warn(TAG, 'Marcatura AI Act sul PDF fallita — esce il PDF non marcato', {
        caseId,
        error: markErr instanceof Error ? markErr.message : 'unknown',
      });
    }

    logAccess({
      userId: user.id,
      action: 'report.exported',
      entityType: 'case',
      entityId: caseId,
      metadata: {
        format: 'pdf',
        anonymized: shouldAnonymize,
        reportStatus,
        bytes: pdfBuffer.length,
      },
    });

    // Build a safe filename from caseId (no PII). The frontend can read the
    // Content-Disposition header to display the suggested filename.
    const suffix = shouldAnonymize ? '-anonimizzato' : '';
    const filename = `report-${caseId.slice(0, 8)}${suffix}.pdf`;

    return new NextResponse(new Uint8Array(pdfBuffer) as BodyInit, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': pdfBuffer.length.toString(),
        'X-Report-Status': reportStatus,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    logger.error(TAG, 'PDF export failed', {
      caseId,
      error: error instanceof Error ? error.message.slice(0, 200) : 'unknown',
    });
    return NextResponse.json(
      { success: false, error: "Errore durante l'esportazione PDF. Riprova." },
      { status: 500 },
    );
  }
}
