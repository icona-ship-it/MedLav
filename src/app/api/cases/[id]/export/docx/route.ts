import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { checkRateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import { loadCaseDataForExport } from '@/services/export/load-case-data';
import { generateDocxReport, generateProfessionalDocxReport } from '@/services/export/docx-export';
import { anonymizeText } from '@/services/anonymization/anonymizer';
import { logAccess } from '@/lib/audit';
import { checkFeatureAccess } from '@/lib/subscription';
import type { PeriziaMetadata } from '@/types';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ success: false, error: 'Non autenticato' }, { status: 401 });
  }

  // Feature gate: DOCX export requires Pro
  const gate = await checkFeatureAccess(user.id, 'export');
  if (!gate.allowed) {
    return NextResponse.json(
      { success: false, error: gate.reason ?? 'Funzionalità non disponibile nel piano attuale. Passa a Pro.' },
      { status: 403 },
    );
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
    metadata: { format: 'docx' },
  });

  const pm = data.periziaMetadata as Record<string, unknown> | null;
  const useProfessional = pm && (pm.tribunale || pm.ctuName);
  const shouldAnonymize = _request.nextUrl.searchParams.get('anonymize') === 'true';

  // If anonymizing, anonymize the synthesis text before generating DOCX
  let synthesis = data.report?.synthesis as string | null ?? null;
  if (shouldAnonymize && synthesis) {
    const periziaMetadata = (data.periziaMetadata ?? undefined) as PeriziaMetadata | undefined;
    const result = anonymizeText({ text: synthesis, periziaMetadata });
    synthesis = result.anonymizedText;
  }

  const reportStatus = (data.report?.report_status as string | undefined) ?? undefined;

  const buffer = useProfessional
    ? await generateProfessionalDocxReport({
      caseCode: data.caseData.code as string,
      caseType: data.caseData.case_type as string,
      caseRole: data.caseData.case_role as string,
      patientInitials: shouldAnonymize ? '[PAZIENTE]' : (data.caseData.patient_initials as string | null),
      synthesis,
      events: data.events,
      anomalies: data.anomalies,
      missingDocs: data.missingDocs,
      calculations: data.calculations,
      periziaMetadata: pm,
      documentsWithPages: data.documentsWithPages,
      reportStatus,
    })
    : await generateDocxReport({
      caseCode: data.caseData.code as string,
      caseType: data.caseData.case_type as string,
      caseRole: data.caseData.case_role as string,
      patientInitials: shouldAnonymize ? '[PAZIENTE]' : (data.caseData.patient_initials as string | null),
      synthesis,
      events: data.events,
      anomalies: data.anomalies,
      missingDocs: data.missingDocs,
      calculations: data.calculations,
      periziaMetadata: data.periziaMetadata,
      reportStatus,
    });

  const suffix = shouldAnonymize ? '-anonimizzato' : '';
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'Content-Disposition': `attachment; filename="report-${data.caseData.code}${suffix}.docx"`,
    },
  });
}
