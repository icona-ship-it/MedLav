import { createAdminClient } from '@/lib/supabase/admin';
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
    admin.from('cases').select('id, code, case_type, case_role, patient_initials, status, perizia_metadata').eq('id', caseId).single(),
    admin.from('events').select('*').eq('case_id', caseId).eq('is_deleted', false).order('order_number', { ascending: true }),
    admin.from('anomalies').select('*').eq('case_id', caseId),
    admin.from('missing_documents').select('*').eq('case_id', caseId),
    admin.from('reports').select('id, version, report_status, synthesis').eq('case_id', caseId).order('version', { ascending: false }).limit(1).single(),
  ]);

  if (!caseResult.data) {
    return <ExpiredView />;
  }

  return (
    <SharedCaseView
      caseData={caseResult.data}
      events={eventsResult.data ?? []}
      anomalies={anomaliesResult.data ?? []}
      missingDocs={missingDocsResult.data ?? []}
      report={reportResult.data}
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
