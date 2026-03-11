import { createAdminClient } from '@/lib/supabase/admin';
import type { CaseType, CaseRole, PeriziaMetadata } from '@/types';
import type { CaseMetadata, DocumentInfo } from './types';
import { logger } from '@/lib/logger';

interface FetchMetadataResult {
  metadata: CaseMetadata;
  documents: DocumentInfo[];
}

/**
 * Step 1: Fetch case metadata and documents list from DB.
 * Verifies ownership and marks documents as in_coda.
 */
export async function fetchCaseMetadata(
  caseId: string,
  userId: string,
): Promise<FetchMetadataResult> {
  const supabase = createAdminClient();

  logger.info('pipeline', ` Step 1: Fetching case metadata for case ${caseId}`);

  const { data: caseRow, error: caseError } = await supabase
    .from('cases')
    .select('id, case_type, case_types, case_role, patient_initials, user_id, perizia_metadata')
    .eq('id', caseId)
    .single();

  if (caseError || !caseRow) {
    throw new Error(`Case not found: ${caseId} - error: ${caseError?.message ?? 'no data'}`);
  }

  // Verify ownership
  if (caseRow.user_id !== userId) {
    throw new Error('Unauthorized access to case');
  }

  const { data: docs, error: docsError } = await supabase
    .from('documents')
    .select('id, file_name, file_type, storage_path, document_type, processing_status')
    .eq('case_id', caseId)
    .in('processing_status', ['caricato', 'in_coda']);

  if (docsError) {
    throw new Error(`Failed to fetch documents: ${docsError.message}`);
  }

  logger.info('pipeline', ` Step 1: Found ${(docs ?? []).length} documents to process`);

  // Mark all documents as in_coda
  const docIds = (docs ?? []).map((d) => d.id);
  if (docIds.length > 0) {
    const { error: updateError } = await supabase
      .from('documents')
      .update({ processing_status: 'in_coda', updated_at: new Date().toISOString() })
      .in('id', docIds);

    if (updateError) {
      logger.error('pipeline', ` Step 1: Failed to update doc status: ${updateError.message}`);
    }
  }

  // Build caseTypes: use case_types if available, fallback to [case_type]
  const rawCaseTypes = caseRow.case_types as string[] | null;
  const caseTypes: CaseType[] = rawCaseTypes && rawCaseTypes.length > 0
    ? rawCaseTypes as CaseType[]
    : [caseRow.case_type as CaseType];

  return {
    metadata: {
      caseId: caseRow.id as string,
      caseType: caseRow.case_type as CaseType,
      caseTypes,
      caseRole: caseRow.case_role as CaseRole,
      patientInitials: caseRow.patient_initials as string | null,
      userId: caseRow.user_id as string,
      periziaMetadata: (caseRow.perizia_metadata ?? undefined) as PeriziaMetadata | undefined,
    } satisfies CaseMetadata,
    documents: (docs ?? []).map((d) => ({
      id: d.id as string,
      fileName: d.file_name as string,
      fileType: d.file_type as string,
      storagePath: d.storage_path as string,
      documentType: (d.document_type ?? 'altro') as string,
    })) satisfies DocumentInfo[],
  };
}
