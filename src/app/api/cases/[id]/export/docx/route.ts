import { NextRequest, NextResponse } from 'next/server';
import { loadCaseDataForExport } from '@/services/export/load-case-data';
import { generateDocxReport } from '@/services/export/docx-export';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: caseId } = await params;
  const data = await loadCaseDataForExport(caseId);

  if (!data) {
    return NextResponse.json({ success: false, error: 'Non autorizzato o caso non trovato' }, { status: 401 });
  }

  const buffer = await generateDocxReport({
    caseCode: data.caseData.code as string,
    caseType: data.caseData.case_type as string,
    caseRole: data.caseData.case_role as string,
    patientInitials: data.caseData.patient_initials as string | null,
    synthesis: data.report?.synthesis as string | null ?? null,
    events: data.events,
    anomalies: data.anomalies,
    missingDocs: data.missingDocs,
  });

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'Content-Disposition': `attachment; filename="report-${data.caseData.code}.docx"`,
    },
  });
}
