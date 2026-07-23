import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { checkRateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import { loadCaseDataForExport } from '@/services/export/load-case-data';
import { generateDocxReport, generateProfessionalDocxReport, validateDepositableExport, validateAnonymizedExport } from '@/services/export/docx-export';
import { anonymizeText } from '@/services/anonymization/anonymizer';
import { resolveOcrImages, replaceWithDataUris } from '@/services/export/image-resolver';
import { expandDeterministicBlocks, toDeterministicEvents, toDeterministicDocs } from '@/services/calculations/deterministic-tables';
import { logAccess } from '@/lib/audit';
import { checkFeatureAccess } from '@/lib/subscription';
import { logger } from '@/lib/logger';
import { checkDepositableAttestation } from '@/services/export/attestation';
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

  // Feature gate abbonamento: nega solo canceled/past_due — il TRIAL esporta
  // (il gating economico è a crediti, non a piano; vedi subscription.ts).
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

  try {
    const data = await loadCaseDataForExport(caseId);

    if (!data) {
      return NextResponse.json({ success: false, error: 'Non autorizzato o caso non trovato' }, { status: 401 });
    }

    // rc-mvp: le pipeline extraction_only/expenses_only (cronistoria e analisi
    // spese standalone) sono parcheggiate in legacy/ — qui resta solo la
    // perizia RC (pipeline 'full').
    const shouldAnonymize = _request.nextUrl.searchParams.get('anonymize') === 'true';
    // QA 2026-06-11: default DEPOSITABILE (solo perizia, come i gold);
    // ?mode=lavoro per il fascicolo completo con le carte di lavoro.
    const exportMode = _request.nextUrl.searchParams.get('mode') === 'lavoro' ? 'lavoro' as const : 'depositabile' as const;

    const pm = data.periziaMetadata as Record<string, unknown> | null;

    // Blocca un export "depositabile" senza i dati del perito (uscirebbe incompleto via
    // il flusso basic). In modalità lavoro/bozza i parziali sono ammessi.
    // Solo se ESISTE un report (audit 2026-07-16): un caso senza report (export
    // cronistoria da estrazione-only) non può produrre una perizia depositabile —
    // chiedere il nome del perito per scaricare una cronologia era un vicolo cieco.
    const depositableError = data.report
      ? validateDepositableExport(
          pm as { ctuName?: string | null; tribunale?: string | null; rgNumber?: string | null } | null,
          data.caseData.case_role as string,
          exportMode,
        )
      : null;
    if (depositableError) {
      return NextResponse.json({ success: false, error: depositableError }, { status: 400 });
    }

    // Export anonimizzato senza nome paziente = anonimizzazione inaffidabile
    // (audit GDPR 2026-07-17): blocca con istruzione, la UI mostra la CTA.
    const anonymizeError = validateAnonymizedExport(
      pm as { patientFullName?: string | null } | null,
      shouldAnonymize,
    );
    if (anonymizeError) {
      return NextResponse.json({ success: false, error: anonymizeError }, { status: 400 });
    }

    // Gate attestazione ("verify before sign") PRIMA dell'audit: un export
    // bloccato non deve risultare 'report.exported' nel trail (review 2026-07-04).
    const attestationCheck = checkDepositableAttestation(data.report, exportMode);
    if (!attestationCheck.ok) {
      return NextResponse.json({ success: false, error: attestationCheck.message }, { status: 428 });
    }

    logAccess({
      userId: user.id,
      action: 'report.exported',
      entityType: 'case',
      entityId: caseId,
      metadata: {
        format: 'docx',
        anonymized: shouldAnonymize,
        reportVersion: data.report?.version ?? null,
        reportStatus: data.report?.report_status ?? null,
      },
    });

    // pm.tribunale non è più nel tipo ma esiste nei JSONB legacy: senza il
    // check, un caso legacy col solo tribunale perderebbe il layout
    // professional in mode=lavoro (review 2026-07-03).
    // Gli strumenti standalone (cronistoria/spese) non sono una perizia:
    // usano sempre il layout basic etichettato, mai il professional.
    const pipelineModeDocx = (data.caseData.pipeline_mode as string | null) ?? 'full';
    const useProfessional = pipelineModeDocx === 'full' && pm && (pm.tribunale || pm.ctuName);

    // Resolve ocr-image: placeholders to base64 data URIs
    let synthesis = data.report?.synthesis as string | null ?? null;
    if (synthesis) {
      // Expand deterministic factual blocks from current events first (no-op on legacy).
      synthesis = expandDeterministicBlocks(
        synthesis,
        toDeterministicEvents(data.events ?? []),
        toDeterministicDocs(data.documentsWithPages ?? []),
        { incidentDate: (pm?.dataSinistro as string | undefined) ?? null },
      );
      const images = await resolveOcrImages(synthesis, caseId);
      if (images.size > 0) {
        synthesis = replaceWithDataUris(synthesis, images);
      }
    }

    // If anonymizing, anonymize the synthesis text before generating DOCX
    if (shouldAnonymize && synthesis) {
      const periziaMetadata = (data.periziaMetadata ?? undefined) as PeriziaMetadata | undefined;
      const result = anonymizeText({ text: synthesis, periziaMetadata });
      synthesis = result.anonymizedText;
    }

    const reportStatus = (data.report?.report_status as string | undefined) ?? undefined;

    // Resolve signature image to base64
    let signatureImageBase64: string | undefined;
    if (data.signatureImagePath) {
      try {
        const admin = createAdminClient();
        const { data: fileData } = await admin.storage
          .from('signatures')
          .download(data.signatureImagePath);
        if (fileData) {
          const sigBytes = Buffer.from(await fileData.arrayBuffer());
          const ext = data.signatureImagePath.split('.').pop() ?? 'png';
          const mime = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : ext === 'webp' ? 'image/webp' : 'image/png';
          signatureImageBase64 = `data:${mime};base64,${sigBytes.toString('base64')}`;
        }
      } catch { /* signature missing — skip */ }
    }

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
        signatureImageBase64,
        exportMode,
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
        exportMode,
        pipelineMode: pipelineModeDocx,
        documents: (data.documentsWithPages ?? []).map((d) => ({ id: d.id, documentType: d.documentType })),
        anonymized: shouldAnonymize,
      });

    const suffix = shouldAnonymize ? '-anonimizzato' : '';
    const exportReportStatus = (data.report?.report_status as string | undefined) ?? 'bozza';
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': `attachment; filename="report-${data.caseData.code}${suffix}.docx"`,
        'X-Report-Status': exportReportStatus,
      },
    });
  } catch (error) {
    logger.error('export', 'DOCX export failed', {
      caseId,
      error: error instanceof Error ? error.message : 'unknown',
    });
    return NextResponse.json(
      { success: false, error: 'Errore durante l\'esportazione. Riprova.' },
      { status: 500 },
    );
  }
}
