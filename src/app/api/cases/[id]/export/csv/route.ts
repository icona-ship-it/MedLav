import { NextRequest, NextResponse } from 'next/server';
import { loadCaseDataForExport } from '@/services/export/load-case-data';
import { generateCsvExport } from '@/services/export/csv-export';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: caseId } = await params;
  const data = await loadCaseDataForExport(caseId);

  if (!data) {
    return NextResponse.json({ success: false, error: 'Non autorizzato o caso non trovato' }, { status: 401 });
  }

  const csv = generateCsvExport(data.events);

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="eventi-${data.caseData.code}.csv"`,
    },
  });
}
