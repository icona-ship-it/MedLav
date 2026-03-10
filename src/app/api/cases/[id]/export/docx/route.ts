import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { checkRateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import { loadCaseDataForExport } from '@/services/export/load-case-data';
import { generateDocxReport, generateProfessionalDocxReport } from '@/services/export/docx-export';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ success: false, error: 'Non autenticato' }, { status: 401 });
  }

  const rateCheck = checkRateLimit({ key: `export:${user.id}`, ...RATE_LIMITS.API });
  if (!rateCheck.success) {
    return NextResponse.json({ success: false, error: 'Troppe richieste. Riprova tra poco.' }, { status: 429 });
  }

  const { id: caseId } = await params;
  const data = await loadCaseDataForExport(caseId);

  if (!data) {
    return NextResponse.json({ success: false, error: 'Non autorizzato o caso non trovato' }, { status: 401 });
  }

  const pm = data.periziaMetadata as Record<string, unknown> | null;
  const useProfessional = pm && (pm.tribunale || pm.ctuName);

  const buffer = useProfessional
    ? await generateProfessionalDocxReport({
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
    })
    : await generateDocxReport({
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
    });

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'Content-Disposition': `attachment; filename="report-${data.caseData.code}.docx"`,
    },
  });
}
