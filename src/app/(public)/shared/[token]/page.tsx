import { createAdminClient } from '@/lib/supabase/admin';
import { logAccess } from '@/lib/audit';
import { expandDeterministicBlocks, toDeterministicEvents } from '@/services/calculations/deterministic-tables';
import { redactMaterializedDocSanitariaForPublic, redactEventsForPublic, redactAnomaliesForPublic } from '@/services/synthesis/shared-redaction';
import { SharedCaseView } from './shared-case-view';

export default async function SharedCasePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const admin = createAdminClient();

  // Look up share by token
  const { data: share } = await admin
    .from('case_shares')
    .select('id, case_id, expires_at, view_count')
    .eq('token', token)
    .single();

  if (!share) {
    return <ExpiredView />;
  }

  // Check expiration
  const expiresAt = new Date(share.expires_at as string);
  if (expiresAt < new Date()) {
    return <ExpiredView />;
  }

  // Increment view count
  await admin
    .from('case_shares')
    .update({ view_count: ((share.view_count as number) ?? 0) + 1 })
    .eq('id', share.id);

  const caseId = share.case_id as string;

  // Load case data using admin client (no auth required)
  const [caseResult, eventsResult, anomaliesResult, missingDocsResult, reportResult] = await Promise.all([
    // GDPR Art.9: whitelist delle colonne sul link pubblico (default-deny). NON
    // caricare perizia_metadata (contiene nome/CF/indirizzo/telefono del paziente +
    // anamnesi clinica verbatim) né `*` su missing_documents (related_event = titolo
    // evento clinico): tutto ciò che si carica finisce nel payload serializzato del
    // componente 'use client', leggibile via view-source su link non autenticato.
    admin.from('cases').select('id, code, case_type, case_role, patient_initials, status').eq('id', caseId).single(),
    admin.from('events').select('*').eq('case_id', caseId).eq('is_deleted', false).order('order_number', { ascending: true }),
    admin.from('anomalies').select('*').eq('case_id', caseId),
    admin.from('missing_documents').select('id, document_name, reason').eq('case_id', caseId),
    admin.from('reports').select('id, version, report_status, synthesis').eq('case_id', caseId).order('version', { ascending: false }).limit(1).single(),
  ]);

  if (!caseResult.data) {
    return <ExpiredView />;
  }

  // GDPR Art. 9: a public, unauthenticated share link must NOT expose the raw
  // verbatim clinical OCR (full patient/doctor names, diagnoses). So we DON'T pass
  // the OCR docs here → the DOC_SANITARIA sentinel stays an invisible comment on
  // the shared view (the section appears empty externally). The verbatim
  // documentazione is available only in the owner's authenticated export.

  // Expand deterministic factual blocks (ITT/ITP, spese, cronologia) from the
  // current events at read time — same as the main viewer/export. Without this
  // the public shared link would show the raw <!--MEDLAV:*--> markers as
  // invisible HTML comments and the spese/ITT tables would be missing.
  // GDPR Art. 9: redact events to a NON-CLINICAL whitelist (date/type/order) BEFORE
  // they reach the public link — both the Events tab and the deterministic
  // cronologia/spese tables. Drops every clinical column (title/description/diagnosis/
  // doctor/facility + source_text/notes) so nothing leaks via the serialized
  // 'use client' payload, not just what is rendered on screen.
  const publicEvents = redactEventsForPublic(eventsResult.data ?? []);

  const sharedReport = reportResult.data
    ? {
        ...reportResult.data,
        synthesis: reportResult.data.synthesis
          ? expandDeterministicBlocks(
              // GDPR: strip a MATERIALIZED (AI-variant) documentazione sanitaria
              // BEFORE expanding — once materialized it has no sentinel left, so
              // its verbatim clinical content would otherwise reach the public
              // link. The deterministic placeholder (sentinel) is left for expand
              // to neutralize via the no-docs path below.
              redactMaterializedDocSanitariaForPublic(reportResult.data.synthesis as string),
              toDeterministicEvents(publicEvents),
              // No docs on the public link → DOC_SANITARIA stays an invisible
              // comment (no raw clinical OCR exposed externally). See above.
            )
          : reportResult.data.synthesis,
      }
    : null;

  // Audit log: no authenticated user for shared views — userId is null
  logAccess({
    userId: null,
    action: 'case.shared_view',
    entityType: 'case',
    entityId: caseId,
    metadata: { shareId: share.id as string },
  });

  return (
    <SharedCaseView
      caseData={caseResult.data}
      events={publicEvents}
      anomalies={redactAnomaliesForPublic(anomaliesResult.data ?? [])}
      missingDocs={missingDocsResult.data ?? []}
      report={sharedReport}
    />
  );
}

function ExpiredView() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="text-center space-y-4 p-8">
        <h1 className="text-2xl font-bold">Link scaduto o non valido</h1>
        <p className="text-muted-foreground">
          Il link di condivisione potrebbe essere scaduto o revocato.
          Contatta chi te lo ha inviato per un nuovo link.
        </p>
      </div>
    </div>
  );
}
