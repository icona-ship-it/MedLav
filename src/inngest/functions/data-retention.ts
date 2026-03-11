import { inngest } from '@/lib/inngest/client';
import { createAdminClient } from '@/lib/supabase/admin';
import { logger } from '@/lib/logger';

/**
 * Scheduled Inngest function: daily cleanup of archived cases
 * that exceed the user's configured data retention period.
 *
 * Runs at 3 AM UTC every day. Only deletes cases with status 'archiviato'.
 * Removes all related data: documents (storage + DB), events, anomalies,
 * missing_documents, reports, pages, event_images.
 */
export const dataRetentionCleanup = inngest.createFunction(
  {
    id: 'data-retention/cleanup',
    retries: 2,
  },
  { cron: '0 3 * * *' },
  async ({ step }) => {
    const supabase = createAdminClient();

    // Step 1: Find all users with a retention policy set
    const profiles = await step.run('fetch-profiles-with-retention', async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, data_retention_days')
        .not('data_retention_days', 'is', null);

      if (error) {
        throw new Error(`Failed to fetch profiles: ${error.message}`);
      }

      return (data ?? []) as Array<{ id: string; data_retention_days: number }>;
    });

    let totalDeleted = 0;

    // Step 2: For each user, find and delete expired archived cases
    for (const profile of profiles) {
      const deletedCount = await step.run(
        `cleanup-user-${profile.id}`,
        async () => {
          const cutoffDate = new Date();
          cutoffDate.setDate(cutoffDate.getDate() - profile.data_retention_days);
          const cutoffISO = cutoffDate.toISOString();

          // Find archived cases older than retention period
          const { data: expiredCases, error: fetchError } = await supabase
            .from('cases')
            .select('id, code')
            .eq('user_id', profile.id)
            .eq('status', 'archiviato')
            .lt('updated_at', cutoffISO);

          if (fetchError) {
            logger.error('data-retention', `Failed to fetch cases for user ${profile.id}: ${fetchError.message}`);
            return 0;
          }

          if (!expiredCases || expiredCases.length === 0) {
            return 0;
          }

          const caseIds = expiredCases.map((c) => c.id as string);

          for (const caseId of caseIds) {
            await deleteCaseAndRelatedData(supabase, caseId);

            // Audit log each deletion (no sensitive data)
            await supabase.from('audit_log').insert({
              user_id: profile.id,
              action: 'case.auto_deleted',
              entity_type: 'case',
              entity_id: caseId,
              metadata: {
                reason: 'data_retention_policy',
                retentionDays: profile.data_retention_days,
              },
            });
          }

          logger.info(
            'data-retention',
            `Deleted ${caseIds.length} expired case(s) for user ${profile.id}`,
          );

          return caseIds.length;
        },
      );

      totalDeleted += deletedCount;
    }

    logger.info('data-retention', `Cleanup complete: ${totalDeleted} case(s) deleted across ${profiles.length} user(s)`);

    return {
      success: true,
      usersProcessed: profiles.length,
      casesDeleted: totalDeleted,
    };
  },
);

/**
 * Delete a case and all related data in dependency order.
 * Also removes files from Supabase Storage.
 */
async function deleteCaseAndRelatedData(
  supabase: ReturnType<typeof createAdminClient>,
  caseId: string,
): Promise<void> {
  // 1. Get event IDs for event_images cleanup
  const { data: eventRows } = await supabase
    .from('events')
    .select('id')
    .eq('case_id', caseId);

  if (eventRows && eventRows.length > 0) {
    const eventIds = eventRows.map((e) => e.id as string);
    await supabase.from('event_images').delete().in('event_id', eventIds);
  }

  // 2. Get document IDs for pages cleanup and storage deletion
  const { data: docRows } = await supabase
    .from('documents')
    .select('id, storage_path')
    .eq('case_id', caseId);

  if (docRows && docRows.length > 0) {
    const docIds = docRows.map((d) => d.id as string);
    await supabase.from('pages').delete().in('document_id', docIds);

    // Remove files from Supabase Storage
    const storagePaths = docRows
      .map((d) => d.storage_path as string)
      .filter(Boolean);

    if (storagePaths.length > 0) {
      await supabase.storage.from('documents').remove(storagePaths);
    }
  }

  // 3. Delete remaining related tables
  await supabase.from('events').delete().eq('case_id', caseId);
  await supabase.from('anomalies').delete().eq('case_id', caseId);
  await supabase.from('missing_documents').delete().eq('case_id', caseId);
  await supabase.from('reports').delete().eq('case_id', caseId);
  await supabase.from('documents').delete().eq('case_id', caseId);

  // 4. Delete the case itself
  await supabase.from('cases').delete().eq('id', caseId);
}
