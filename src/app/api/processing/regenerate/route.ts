import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { z } from 'zod';
import { detectAnomalies } from '@/services/validation/anomaly-detector';
import { detectMissingDocuments } from '@/services/validation/missing-doc-detector';
import { generateSynthesis } from '@/services/synthesis/synthesis-service';
import type { ConsolidatedEvent } from '@/services/consolidation/event-consolidator';
import type { CaseType } from '@/types';

const requestSchema = z.object({
  caseId: z.string().uuid(),
});

/**
 * POST /api/processing/regenerate
 * Regenerate anomalies, missing docs, and synthesis from current events.
 * Used after the expert edits/adds/deletes events.
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const admin = createAdminClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ success: false, error: 'Non autenticato' }, { status: 401 });
    }

    const body = await request.json() as unknown;
    const parsed = requestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: 'ID caso non valido' }, { status: 400 });
    }

    const { caseId } = parsed.data;

    // Verify case ownership
    const { data: caseRow } = await supabase
      .from('cases')
      .select('id, case_type, case_role, patient_initials')
      .eq('id', caseId)
      .eq('user_id', user.id)
      .single();

    if (!caseRow) {
      return NextResponse.json({ success: false, error: 'Caso non trovato' }, { status: 404 });
    }

    // Fetch current active events
    const { data: eventsRaw } = await admin
      .from('events')
      .select('*')
      .eq('case_id', caseId)
      .eq('is_deleted', false)
      .order('order_number', { ascending: true });

    const events: ConsolidatedEvent[] = (eventsRaw ?? []).map((e) => ({
      orderNumber: e.order_number as number,
      documentId: (e.document_id ?? '') as string,
      eventDate: e.event_date as string,
      datePrecision: e.date_precision as ConsolidatedEvent['datePrecision'],
      eventType: e.event_type as ConsolidatedEvent['eventType'],
      title: e.title as string,
      description: e.description as string,
      sourceType: e.source_type as ConsolidatedEvent['sourceType'],
      diagnosis: (e.diagnosis ?? null) as string | null,
      doctor: (e.doctor ?? null) as string | null,
      facility: (e.facility ?? null) as string | null,
      confidence: e.confidence as number,
      requiresVerification: e.requires_verification as boolean,
      reliabilityNotes: (e.reliability_notes ?? null) as string | null,
      discrepancyNote: null,
    }));

    // Delete old anomalies and missing docs
    await admin.from('anomalies').delete().eq('case_id', caseId);
    await admin.from('missing_documents').delete().eq('case_id', caseId);

    // Re-detect anomalies
    const anomalies = detectAnomalies(events);
    if (anomalies.length > 0) {
      await admin.from('anomalies').insert(
        anomalies.map((a) => ({
          case_id: caseId,
          anomaly_type: a.anomalyType,
          severity: a.severity,
          description: a.description,
          involved_events: JSON.stringify(a.involvedEvents),
          suggestion: a.suggestion,
        })),
      );
    }

    // Re-detect missing docs
    const { data: docsRaw } = await admin
      .from('documents')
      .select('document_type')
      .eq('case_id', caseId);
    const uploadedDocTypes = (docsRaw ?? []).map((d) => (d.document_type ?? 'altro') as string);

    const missingDocs = detectMissingDocuments({
      events,
      caseType: caseRow.case_type as CaseType,
      uploadedDocTypes,
    });
    if (missingDocs.length > 0) {
      await admin.from('missing_documents').insert(
        missingDocs.map((m) => ({
          case_id: caseId,
          document_name: m.documentName,
          reason: m.reason,
          related_event: m.relatedEvent,
        })),
      );
    }

    // Regenerate synthesis
    const result = await generateSynthesis({
      caseType: caseRow.case_type as CaseType,
      caseRole: caseRow.case_role as string,
      patientInitials: caseRow.patient_initials as string | null,
      events,
      anomalies,
      missingDocuments: missingDocs,
    });

    // Get current max version
    const { data: latestReport } = await admin
      .from('reports')
      .select('version')
      .eq('case_id', caseId)
      .order('version', { ascending: false })
      .limit(1)
      .maybeSingle();

    const newVersion = (latestReport?.version ?? 0) + 1;

    await admin.from('reports').insert({
      case_id: caseId,
      version: newVersion,
      report_status: 'bozza',
      synthesis: result.synthesis,
    });

    // Audit log
    await admin.from('audit_log').insert({
      user_id: user.id,
      action: 'report.regenerated',
      entity_type: 'report',
      entity_id: caseId,
      metadata: {
        version: newVersion,
        eventsCount: events.length,
        anomaliesCount: anomalies.length,
        missingDocsCount: missingDocs.length,
        wordCount: result.wordCount,
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        version: newVersion,
        eventsCount: events.length,
        anomaliesCount: anomalies.length,
        missingDocsCount: missingDocs.length,
      },
    });
  } catch (error) {
    console.error('[processing/regenerate] Error:', error instanceof Error ? error.message : 'unknown');
    return NextResponse.json({ success: false, error: 'Errore rigenerazione report.' }, { status: 500 });
  }
}
