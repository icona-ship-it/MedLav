import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { checkRateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import { loadCaseDataForExport } from '@/services/export/load-case-data';
import { generateCsvExport } from '@/services/export/csv-export';
import { anonymizeText } from '@/services/anonymization/anonymizer';
import { logAccess } from '@/lib/audit';
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

  // Feature gate: CSV export requires Pro
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

    const shouldAnonymize = request.nextUrl.searchParams.get('anonymize') === 'true';
    const exportType = request.nextUrl.searchParams.get('type') ?? 'events';

    logAccess({
      userId: user.id,
      action: 'report.exported',
      entityType: 'case',
      entityId: caseId,
      metadata: {
        format: 'csv',
        exportType,
        anonymized: shouldAnonymize,
        reportVersion: data.report?.version ?? null,
        reportStatus: data.report?.report_status ?? null,
      },
    });

    let csv: string;
    let filenamePrefix: string;

    if (exportType === 'expenses') {
      // Export expense extraction data as CSV
      const expenseExtraction = (data.periziaMetadata as Record<string, unknown> | null)?.expenseExtraction as {
        items?: Array<Record<string, unknown>>;
        totalAmount?: number | null;
      } | undefined;

      csv = generateExpenseCsv(expenseExtraction?.items ?? []);
      filenamePrefix = 'spese';
    } else {
      csv = generateCsvExport(data.events);
      filenamePrefix = 'eventi';
    }

    if (shouldAnonymize) {
      const periziaMetadata = (data.periziaMetadata ?? undefined) as PeriziaMetadata | undefined;
      const result = anonymizeText({ text: csv, periziaMetadata });
      csv = result.anonymizedText;
    }

    const suffix = shouldAnonymize ? '-anonimizzato' : '';
    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filenamePrefix}-${data.caseData.code}${suffix}.csv"`,
      },
    });
  } catch (error) {
    logger.error('export', 'CSV export failed', {
      caseId,
      error: error instanceof Error ? error.message : 'unknown',
    });
    return NextResponse.json(
      { success: false, error: 'Errore durante l\'esportazione. Riprova.' },
      { status: 500 },
    );
  }
}

// ── Expense CSV generator ──────────────────────────────────────────────

const EXPENSE_CSV_HEADERS = [
  'N.',
  'Data',
  'Descrizione',
  'Importo (€)',
  'N. Ricevuta/Fattura',
  'Tipo Farmaco',
  'Categoria',
  'Struttura',
  'Diagnosi Correlata',
  'Note',
  'Interpretazione',
];

const EXPENSE_CATEGORY_LABELS: Record<string, string> = {
  farmaci: 'Farmaci',
  visite_specialistiche: 'Visite specialistiche',
  esami_diagnostici: 'Esami diagnostici',
  interventi: 'Interventi chirurgici',
  riabilitazione: 'Riabilitazione',
  ausili_protesi: 'Ausili e protesi',
  trasporti: 'Trasporti sanitari',
  altro: 'Altro',
};

function escapeCsvField(value: string): string {
  if (value.includes(';') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function formatDateIT(dateStr: string): string {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return dateStr;
}

/**
 * Generate CSV for expense items.
 * Uses semicolon separator and UTF-8 BOM for Excel IT compatibility.
 */
function generateExpenseCsv(items: Array<Record<string, unknown>>): string {
  const BOM = '\uFEFF'; // UTF-8 BOM for Excel
  const SEP = ';';

  const headerLine = EXPENSE_CSV_HEADERS.join(SEP);
  const rows: string[] = [headerLine];

  let totalAmount = 0;
  let hasAnyAmount = false;

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const amount = typeof item.amount === 'number' ? item.amount : null;

    if (amount !== null) {
      totalAmount += amount;
      hasAnyAmount = true;
    }

    const row = [
      String(i + 1),
      formatDateIT(String(item.date ?? '')),
      escapeCsvField(String(item.description ?? '')),
      amount !== null ? amount.toFixed(2).replace('.', ',') : '',
      escapeCsvField(String(item.receiptNumber ?? '')),
      escapeCsvField(String(item.drugType ?? '')),
      EXPENSE_CATEGORY_LABELS[String(item.category ?? 'altro')] ?? String(item.category ?? ''),
      escapeCsvField(String(item.facility ?? '')),
      escapeCsvField(String(item.linkedDiagnosis ?? '')),
      escapeCsvField(String(item.notes ?? '')),
      escapeCsvField(String(item.interpretation ?? '')),
    ];
    rows.push(row.join(SEP));
  }

  // Add total row
  if (hasAnyAmount) {
    rows.push('');
    const totalRow = [
      '',
      '',
      'TOTALE',
      totalAmount.toFixed(2).replace('.', ','),
      '', '', '', '', '', '', '',
    ];
    rows.push(totalRow.join(SEP));
  }

  return BOM + rows.join('\n');
}
