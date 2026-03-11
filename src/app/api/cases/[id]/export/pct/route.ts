import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { checkRateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import { loadCaseDataForExport } from '@/services/export/load-case-data';
import { generatePctXml } from '@/services/export/pct-export';
import { checkFeatureAccess } from '@/lib/subscription';
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

  // Feature gate: PCT export requires Pro
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

  const periziaMetadata = (data.periziaMetadata ?? {}) as PeriziaMetadata;
  const synthesis = (data.report?.synthesis as string | null) ?? '';

  if (!synthesis) {
    return NextResponse.json(
      { success: false, error: 'Nessun report generato. Avvia prima l\'elaborazione.' },
      { status: 400 },
    );
  }

  const documents = data.documentsWithPages.map((doc) => ({
    fileName: doc.fileName,
    fileType: doc.documentType,
  }));

  const caseCode = data.caseData.code as string;

  logger.info('pct-export', `Generating PCT XML for case ${caseId}`);

  const xml = generatePctXml({
    periziaMetadata,
    synthesis,
    documents,
    caseCode,
  });

  return new NextResponse(xml, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Content-Disposition': `attachment; filename="pct-${caseCode}.xml"`,
    },
  });
}
