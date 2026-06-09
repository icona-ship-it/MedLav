import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { checkRateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import { loadCaseDataForExport } from '@/services/export/load-case-data';
import { generateHtmlReport, generateProfessionalHtmlReport } from '@/services/export/html-export';
import { generateTimelineHtml } from '@/services/export/timeline-html-export';
import { anonymizeText } from '@/services/anonymization/anonymizer';
import { resolveOcrImages, replaceWithDataUris } from '@/services/export/image-resolver';
import { expandDeterministicBlocks, toDeterministicEvents, toDeterministicDocs } from '@/services/calculations/deterministic-tables';
import { NON_CLINICAL_EVENT_TYPES } from '@/lib/constants';
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

    // --- Expense table export for expenses_only pipeline ---
    const pipelineMode = (data.caseData.pipeline_mode as string | null) ?? 'full';
    if (pipelineMode === 'expenses_only') {
      const expenseExtraction = (data.periziaMetadata as Record<string, unknown> | null)?.expenseExtraction as {
        items?: Array<Record<string, unknown>>;
        totalAmount?: number | null;
      } | undefined;

      const expenseItems = expenseExtraction?.items ?? [];
      const isInlineExpense = request.nextUrl.searchParams.get('inline') === 'true';

      logAccess({
        userId: user.id,
        action: 'report.exported',
        entityType: 'case',
        entityId: caseId,
        metadata: { format: 'html-expenses' },
      });

      const expenseHtml = generateExpenseTableHtml({
        caseCode: data.caseData.code as string,
        patientInitials: (data.caseData.patient_initials as string | null),
        items: expenseItems,
        totalAmount: expenseExtraction?.totalAmount ?? null,
      });

      const expenseHeaders: Record<string, string> = {
        'Content-Type': 'text/html; charset=utf-8',
      };
      if (!isInlineExpense) {
        expenseHeaders['Content-Disposition'] = `attachment; filename="spese-${data.caseData.code}.html"`;
      }

      return new NextResponse(expenseHtml, { headers: expenseHeaders });
    }

    // --- Timeline-only export for extraction_only pipeline ---
    if (pipelineMode === 'extraction_only') {
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

      const timelineEvents = data.events
        .filter((e: Record<string, unknown>) => !NON_CLINICAL_EVENT_TYPES.has((e.event_type as string) ?? ''))
        .map((e: Record<string, unknown>) => ({
          order_number: (e.order_number as number) ?? 0,
          event_date: (e.event_date as string) ?? '',
          event_type: (e.event_type as string) ?? 'altro',
          title: (e.title as string) ?? '',
          description: (e.description as string) ?? '',
          source_type: (e.source_type as string) ?? 'altro',
          doctor: (e.doctor as string | null) ?? null,
          facility: (e.facility as string | null) ?? null,
          confidence: typeof e.confidence === 'number' ? e.confidence : undefined,
          requires_verification: e.requires_verification === true,
          diagnosis: (e.diagnosis as string | null) ?? null,
          is_relevant_for_chronology: e.is_relevant_for_chronology !== false,
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
      // Expand deterministic factual blocks (ITT/ITP, spese, cronologia) from
      // the current events FIRST — before image/anonymization — so the table
      // content is also anonymized and kept in sync. No-op on legacy reports.
      synthesis = expandDeterministicBlocks(
        synthesis,
        toDeterministicEvents(data.events ?? []),
        toDeterministicDocs(data.documentsWithPages ?? []),
      );
      const images = await resolveOcrImages(synthesis, caseId);
      // Sempre, anche con 0 immagini risolte (es. Storage down): replaceWithDataUris
      // sostituisce i riferimenti `ocr-image:` non risolti con "[Immagine non
      // disponibile]" invece di lasciare un <img> rotto nel documento. #11 (audit 2026-06-09).
      synthesis = replaceWithDataUris(synthesis, images);
    }

    // Anonymize synthesis BEFORE assembly (consistent with DOCX path)
    if (shouldAnonymize && synthesis) {
      const periziaMetadata = (data.periziaMetadata ?? undefined) as PeriziaMetadata | undefined;
      const result = anonymizeText({ text: synthesis, periziaMetadata });
      synthesis = result.anonymizedText;
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

// ── Expense table HTML generator ──────────────────────────────────────

const EXPENSE_CAT_LABELS: Record<string, string> = {
  farmaci: 'Farmaci',
  visite_specialistiche: 'Visite specialistiche',
  esami_diagnostici: 'Esami diagnostici',
  interventi: 'Interventi chirurgici',
  riabilitazione: 'Riabilitazione',
  ausili_protesi: 'Ausili e protesi',
  trasporti: 'Trasporti sanitari',
  altro: 'Altro',
};

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function formatDateForHtml(dateStr: string): string {
  if (!dateStr) return '—';
  const parts = dateStr.split('-');
  if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
  return dateStr;
}

function generateExpenseTableHtml(params: {
  caseCode: string;
  patientInitials: string | null;
  items: Array<Record<string, unknown>>;
  totalAmount: number | null;
}): string {
  const { caseCode, patientInitials, items, totalAmount } = params;

  let totalCalc = 0;
  let hasAny = false;

  const rowsHtml = items.map((item, idx) => {
    const amount = typeof item.amount === 'number' ? item.amount : null;
    if (amount !== null) { totalCalc += amount; hasAny = true; }

    return `<tr>
      <td>${idx + 1}</td>
      <td>${formatDateForHtml(String(item.date ?? ''))}</td>
      <td>${escapeHtml(String(item.description ?? ''))}</td>
      <td class="amount">${amount !== null ? `€ ${amount.toFixed(2).replace('.', ',')}` : '—'}</td>
      <td>${escapeHtml(String(item.receiptNumber ?? '—'))}</td>
      <td>${escapeHtml(String(item.drugType ?? '—'))}</td>
      <td><span class="badge">${EXPENSE_CAT_LABELS[String(item.category ?? 'altro')] ?? String(item.category ?? '')}</span></td>
      <td>${escapeHtml(String(item.linkedDiagnosis ?? '—'))}</td>
      <td>${escapeHtml(String(item.notes ?? '—'))}</td>
    </tr>`;
  }).join('\n');

  const totalRow = hasAny
    ? `<tr class="total-row"><td colspan="3"><strong>TOTALE</strong></td><td class="amount"><strong>€ ${totalCalc.toFixed(2).replace('.', ',')}</strong></td><td colspan="5"></td></tr>`
    : '';

  return `<!DOCTYPE html>
<html lang="it">
<head>
  <meta charset="UTF-8">
  <title>Spese Mediche — ${escapeHtml(caseCode)}</title>
  <style>
    body { font-family: 'Segoe UI', Arial, sans-serif; margin: 2rem; color: #1a1a1a; }
    h1 { font-size: 1.4rem; margin-bottom: 0.3rem; }
    .subtitle { color: #666; margin-bottom: 1.5rem; font-size: 0.9rem; }
    table { width: 100%; border-collapse: collapse; font-size: 0.85rem; }
    th { background: #f5f5f5; border: 1px solid #ddd; padding: 8px 10px; text-align: left; font-weight: 600; }
    td { border: 1px solid #ddd; padding: 6px 10px; vertical-align: top; }
    tr:nth-child(even) { background: #fafafa; }
    .amount { text-align: right; font-family: monospace; white-space: nowrap; }
    .badge { background: #eee; padding: 2px 8px; border-radius: 10px; font-size: 0.75rem; }
    .total-row { background: #f0f0f0; border-top: 2px solid #333; }
    .disclaimer { margin-top: 1.5rem; padding: 12px; background: #fff8e1; border: 1px solid #ffe082; border-radius: 6px; font-size: 0.8rem; color: #795548; }
    @media print { body { margin: 1cm; } }
  </style>
</head>
<body>
  <h1>Analisi Spese Mediche</h1>
  <p class="subtitle">Caso: ${escapeHtml(caseCode)}${patientInitials ? ` — Paziente: ${escapeHtml(patientInitials)}` : ''}</p>
  <p class="subtitle">${items.length} ${items.length === 1 ? 'voce' : 'voci'} estratte${totalAmount !== null ? ` — Totale: € ${totalAmount.toFixed(2).replace('.', ',')}` : ''}</p>

  <table>
    <thead>
      <tr>
        <th>N.</th><th>Data</th><th>Descrizione</th><th class="amount">Importo</th>
        <th>N. Ricevuta</th><th>Tipo Farmaco</th><th>Categoria</th>
        <th>Diagnosi</th><th>Note</th>
      </tr>
    </thead>
    <tbody>
      ${rowsHtml}
      ${totalRow}
    </tbody>
  </table>

  <div class="disclaimer">
    <strong>Nota:</strong> La valutazione di congruità delle spese è riservata al medico legale.
    I dati estratti sono indicativi e vanno verificati con i documenti originali.
  </div>

  <p style="margin-top: 2rem; font-size: 0.7rem; color: #999;">Generato da LegMed — ${new Date().toLocaleDateString('it-IT')}</p>
</body>
</html>`;
}
