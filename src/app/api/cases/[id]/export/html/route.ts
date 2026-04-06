import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { checkRateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import { loadCaseDataForExport } from '@/services/export/load-case-data';
import { generateHtmlReport, generateProfessionalHtmlReport } from '@/services/export/html-export';
import { generateTimelineHtml } from '@/services/export/timeline-html-export';
import { anonymizeText } from '@/services/anonymization/anonymizer';
import { resolveOcrImages, replaceWithDataUris } from '@/services/export/image-resolver';
import { getModule } from '@/types/modules';
import type { ModuleId } from '@/types/modules';
import { logAccess } from '@/lib/audit';
import { logger } from '@/lib/logger';
import type { PeriziaMetadata } from '@/types';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ success: false, error: 'Non autenticato' }, { status: 401 });
  }

  const rateCheck = await checkRateLimit({ key: `export:${user.id}`, ...RATE_LIMITS.API });
  if (!rateCheck.success) {
    return NextResponse.json({ success: false, error: 'Troppe richieste. Riprova tra poco.' }, { status: 429 });
  }

  const { id: caseId } = await params;

  try {
    const data = await loadCaseDataForExport(caseId);

    if (!data) {
      return NextResponse.json({ success: false, error: 'Non autorizzato o caso non trovato' }, { status: 401 });
    }

    // --- Timeline-only export for extraction_only / expenses_only pipelines ---
    const pipelineMode = (data.caseData.pipeline_mode as string | null) ?? 'full';
    if (pipelineMode === 'extraction_only' || pipelineMode === 'expenses_only') {
      if (!data.events || data.events.length === 0) {
        return NextResponse.json(
          { success: false, error: 'Nessun evento trovato per questo caso. Impossibile generare la cronistoria.' },
          { status: 404 },
        );
      }

      const moduleId = data.caseData.module_id as ModuleId | null;
      const moduleName = moduleId ? getModule(moduleId).label : undefined;
      const shouldAnonymizeTimeline = request.nextUrl.searchParams.get('anonymize') === 'true';
      const isInlineTimeline = request.nextUrl.searchParams.get('inline') === 'true';

      logAccess({
        userId: user.id,
        action: 'report.exported',
        entityType: 'case',
        entityId: caseId,
        metadata: { format: 'html-timeline', anonymized: shouldAnonymizeTimeline },
      });

      const timelineEvents = data.events.map((e: Record<string, unknown>) => ({
        order_number: (e.order_number as number) ?? 0,
        event_date: (e.event_date as string) ?? '',
        event_type: (e.event_type as string) ?? 'altro',
        title: (e.title as string) ?? '',
        description: (e.description as string) ?? '',
        source_type: (e.source_type as string) ?? 'altro',
        doctor: (e.doctor as string | null) ?? null,
        facility: (e.facility as string | null) ?? null,
      }));

      const timelineHtml = generateTimelineHtml({
        caseCode: data.caseData.code as string,
        patientInitials: shouldAnonymizeTimeline ? '[PAZIENTE]' : (data.caseData.patient_initials as string | null),
        events: timelineEvents,
        moduleName,
      });

      const timelineHeaders: Record<string, string> = {
        'Content-Type': 'text/html; charset=utf-8',
      };
      if (!isInlineTimeline) {
        timelineHeaders['Content-Disposition'] = `attachment; filename="cronistoria-${data.caseData.code}.html"`;
      }

      return new NextResponse(timelineHtml, { headers: timelineHeaders });
    }

    const shouldAnonymize = request.nextUrl.searchParams.get('anonymize') === 'true';
    const isInline = request.nextUrl.searchParams.get('inline') === 'true';

    logAccess({
      userId: user.id,
      action: 'report.exported',
      entityType: 'case',
      entityId: caseId,
      metadata: {
        format: 'html',
        anonymized: shouldAnonymize,
        inline: isInline,
        reportVersion: data.report?.version ?? null,
        reportStatus: data.report?.report_status ?? null,
      },
    });

    const pm = data.periziaMetadata as Record<string, unknown> | null;
    const useProfessional = pm && (pm.tribunale || pm.ctuName);

    const reportStatus = (data.report?.report_status as string | undefined) ?? undefined;

    // Resolve ocr-image: placeholders to base64 data URIs for self-contained HTML
    let synthesis = data.report?.synthesis as string | null ?? null;
    if (synthesis) {
      const images = await resolveOcrImages(synthesis);
      if (images.size > 0) {
        synthesis = replaceWithDataUris(synthesis, images);
      }
    }

    // Resolve signature image to base64
    let signatureImageBase64: string | undefined;
    if (data.signatureImagePath) {
      try {
        const admin = createAdminClient();
        const { data: fileData } = await admin.storage
          .from('signatures')
          .download(data.signatureImagePath);
        if (fileData) {
          const buffer = Buffer.from(await fileData.arrayBuffer());
          const ext = data.signatureImagePath.split('.').pop() ?? 'png';
          const mime = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : ext === 'webp' ? 'image/webp' : 'image/png';
          signatureImageBase64 = `data:${mime};base64,${buffer.toString('base64')}`;
        }
      } catch { /* signature missing — skip */ }
    }

    const html = useProfessional
      ? generateProfessionalHtmlReport({
        caseCode: data.caseData.code as string,
        caseType: data.caseData.case_type as string,
        caseRole: data.caseData.case_role as string,
        patientInitials: data.caseData.patient_initials as string | null,
        synthesis,
        events: data.events,
        anomalies: data.anomalies,
        missingDocs: data.missingDocs,
        calculations: data.calculations,
        periziaMetadata: pm,
        documentsWithPages: data.documentsWithPages,
        reportStatus,
        signatureImageBase64,
      })
      : generateHtmlReport({
        caseCode: data.caseData.code as string,
        caseType: data.caseData.case_type as string,
        caseRole: data.caseData.case_role as string,
        patientInitials: data.caseData.patient_initials as string | null,
        synthesis,
        events: data.events,
        anomalies: data.anomalies,
        missingDocs: data.missingDocs,
        calculations: data.calculations,
        periziaMetadata: data.periziaMetadata,
        reportStatus,
      });

    let finalHtml = html;
    if (shouldAnonymize) {
      const periziaMetadata = (data.periziaMetadata ?? undefined) as PeriziaMetadata | undefined;
      const result = anonymizeText({ text: html, periziaMetadata });
      finalHtml = result.anonymizedText;
    }

    const headers: Record<string, string> = {
      'Content-Type': 'text/html; charset=utf-8',
      'X-Report-Status': reportStatus ?? 'bozza',
    };
    const suffix = shouldAnonymize ? '-anonimizzato' : '';
    if (!isInline) {
      headers['Content-Disposition'] = `attachment; filename="report-${data.caseData.code}${suffix}.html"`;
    }

    return new NextResponse(finalHtml, { headers });
  } catch (error) {
    logger.error('export', 'HTML export failed', {
      caseId,
      error: error instanceof Error ? error.message : 'unknown',
    });
    return NextResponse.json(
      { success: false, error: 'Errore durante l\'esportazione. Riprova.' },
      { status: 500 },
    );
  }
}
