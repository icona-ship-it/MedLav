import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { checkRateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import { loadCaseDataForExport } from '@/services/export/load-case-data';
import { generateHtmlReport, generateProfessionalHtmlReport } from '@/services/export/html-export';
import { anonymizeText } from '@/services/anonymization/anonymizer';
import { logAccess } from '@/lib/audit';
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
  const data = await loadCaseDataForExport(caseId);

  if (!data) {
    return NextResponse.json({ success: false, error: 'Non autorizzato o caso non trovato' }, { status: 401 });
  }

  logAccess({
    userId: user.id,
    action: 'report.exported',
    entityType: 'case',
    entityId: caseId,
    metadata: { format: 'html' },
  });

  const pm = data.periziaMetadata as Record<string, unknown> | null;
  const useProfessional = pm && (pm.tribunale || pm.ctuName);

  const reportStatus = (data.report?.report_status as string | undefined) ?? undefined;

  const html = useProfessional
    ? generateProfessionalHtmlReport({
      caseCode: data.caseData.code as string,
      caseType: data.caseData.case_type as string,
      caseRole: data.caseData.case_role as string,
      patientInitials: data.caseData.patient_initials as string | null,
      synthesis: data.report?.synthesis as string | null ?? null,
      events: data.events,
      anomalies: data.anomalies,
      missingDocs: data.missingDocs,
      calculations: data.calculations,
      periziaMetadata: pm,
      documentsWithPages: data.documentsWithPages,
      reportStatus,
    })
    : generateHtmlReport({
      caseCode: data.caseData.code as string,
      caseType: data.caseData.case_type as string,
      caseRole: data.caseData.case_role as string,
      patientInitials: data.caseData.patient_initials as string | null,
      synthesis: data.report?.synthesis as string | null ?? null,
      events: data.events,
      anomalies: data.anomalies,
      missingDocs: data.missingDocs,
      calculations: data.calculations,
      periziaMetadata: data.periziaMetadata,
      reportStatus,
    });

  const isInline = request.nextUrl.searchParams.get('inline') === 'true';
  const shouldAnonymize = request.nextUrl.searchParams.get('anonymize') === 'true';

  let finalHtml = html;
  if (shouldAnonymize) {
    const periziaMetadata = (data.periziaMetadata ?? undefined) as PeriziaMetadata | undefined;
    const result = anonymizeText({ text: html, periziaMetadata });
    finalHtml = result.anonymizedText;
  }

  const headers: Record<string, string> = {
    'Content-Type': 'text/html; charset=utf-8',
  };
  const suffix = shouldAnonymize ? '-anonimizzato' : '';
  if (!isInline) {
    headers['Content-Disposition'] = `attachment; filename="report-${data.caseData.code}${suffix}.html"`;
  }

  return new NextResponse(finalHtml, { headers });
}
