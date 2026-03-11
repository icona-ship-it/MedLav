import { createAdminClient } from '@/lib/supabase/admin';
import { DEMO_CASE, DEMO_EVENTS, DEMO_ANOMALIES, DEMO_MISSING_DOCS, DEMO_SYNTHESIS } from './demo-case-data';

/**
 * Create a demo case for a user.
 * Idempotent: checks if user already has a DEMO- case.
 * Returns the caseId or null if already exists.
 */
export async function createDemoCase(userId: string): Promise<string | null> {
  const admin = createAdminClient();

  // Check idempotency — skip if user already has a demo case
  const { data: existing } = await admin
    .from('cases')
    .select('id')
    .eq('user_id', userId)
    .like('code', 'DEMO-%')
    .limit(1);

  if (existing && existing.length > 0) {
    return existing[0].id as string;
  }

  // Create case
  const { data: caseData, error: caseError } = await admin
    .from('cases')
    .insert({
      user_id: userId,
      code: DEMO_CASE.code,
      case_type: DEMO_CASE.caseType,
      case_role: DEMO_CASE.caseRole,
      patient_initials: DEMO_CASE.patientInitials,
      practice_reference: DEMO_CASE.practiceReference,
      notes: DEMO_CASE.notes,
      perizia_metadata: DEMO_CASE.periziaMetadata,
      status: 'bozza',
    })
    .select('id')
    .single();

  if (caseError || !caseData) {
    console.error('[demo] Failed to create demo case:', caseError?.code);
    return null;
  }

  const caseId = caseData.id as string;

  // Insert events
  const eventsToInsert = DEMO_EVENTS.map((e) => ({
    case_id: caseId,
    order_number: e.orderNumber,
    event_date: e.eventDate,
    date_precision: e.datePrecision,
    event_type: e.eventType,
    title: e.title,
    description: e.description,
    source_type: e.sourceType,
    diagnosis: e.diagnosis ?? null,
    doctor: e.doctor ?? null,
    facility: e.facility ?? null,
    confidence: e.confidence,
    requires_verification: e.requiresVerification,
    reliability_notes: ('reliabilityNotes' in e ? e.reliabilityNotes : null) as string | null,
    is_deleted: false,
  }));

  await admin.from('events').insert(eventsToInsert);

  // Insert anomalies
  const anomaliesToInsert = DEMO_ANOMALIES.map((a) => ({
    case_id: caseId,
    anomaly_type: a.anomalyType,
    severity: a.severity,
    description: a.description,
    involved_events: a.involvedEvents,
    suggestion: a.suggestion,
  }));

  await admin.from('anomalies').insert(anomaliesToInsert);

  // Insert missing docs
  const missingDocsToInsert = DEMO_MISSING_DOCS.map((d) => ({
    case_id: caseId,
    document_name: d.documentName,
    reason: d.reason,
    related_event: d.relatedEvent ?? null,
  }));

  await admin.from('missing_documents').insert(missingDocsToInsert);

  // Insert report
  await admin.from('reports').insert({
    case_id: caseId,
    version: 1,
    report_status: 'bozza',
    synthesis: DEMO_SYNTHESIS,
  });

  // Audit log
  await admin.from('audit_log').insert({
    user_id: userId,
    action: 'demo_case_created',
    entity_type: 'case',
    entity_id: caseId,
    details: { code: DEMO_CASE.code },
  });

  return caseId;
}
