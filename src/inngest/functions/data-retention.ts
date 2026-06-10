import { inngest } from '@/lib/inngest/client';
import { createAdminClient } from '@/lib/supabase/admin';
import { logger } from '@/lib/logger';
import { sendRetentionNoticeEmail } from '@/services/email/email-service';
import { deleteCaseAndRelatedData } from '@/services/retention/delete-case-data';
import {
  resolveEffectiveRetentionDays,
  planRetentionActions,
  type RetentionCaseInput,
} from '@/services/retention/retention-policy';
import type { PeriziaMetadata } from '@/types';

/**
 * Scheduled Inngest function: daily retention cleanup of ARCHIVED cases.
 * Runs at 3 AM UTC every day.
 *
 * Policy (see src/services/retention/retention-policy.ts for the full
 * rationale and DPIA.md §7):
 * - Default 365 days for users who never configured anything (GDPR
 *   Art. 5(1)(e) — the DPIA declares this default).
 * - data_retention_days = 0 → "Mai": never auto-delete (explicit choice).
 * - ONLY cases with status 'archiviato' are deleted. Active cases are
 *   ongoing professional work — never touched.
 * - NO surprise deletions: a notice email is sent ≥ 30 days before deletion
 *   (tracked per-case in perizia_metadata.retentionNoticeSentAt); deletion
 *   happens only after the notice has matured. If the notice email cannot
 *   be sent, nothing is deleted (fail-safe).
 */
export const dataRetentionCleanup = inngest.createFunction(
  {
    id: 'data-retention/cleanup',
    retries: 2,
  },
  { cron: '0 3 * * *' },
  async ({ step }) => {
    const supabase = createAdminClient();

    // Step 1: all profiles — retention now applies by default (365gg) to
    // users who never configured anything; 0 = explicit "Mai".
    const profiles = await step.run('fetch-profiles', async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, data_retention_days');

      if (error) {
        throw new Error(`Failed to fetch profiles: ${error.message}`);
      }

      return (data ?? []) as Array<{ id: string; data_retention_days: number | null }>;
    });

    let totalDeleted = 0;
    let totalNotified = 0;

    // Step 2: per user — plan (pure) and execute notices + deletions
    for (const profile of profiles) {
      const result = await step.run(`retention-user-${profile.id}`, async () =>
        processUserRetention(supabase, profile.id, profile.data_retention_days),
      );
      totalDeleted += result.deleted;
      totalNotified += result.notified;
    }

    logger.info(
      'data-retention',
      `Cleanup complete: ${totalDeleted} case(s) deleted, ${totalNotified} notice(s) sent across ${profiles.length} user(s)`,
    );

    return {
      success: true,
      usersProcessed: profiles.length,
      casesDeleted: totalDeleted,
      noticesSent: totalNotified,
    };
  },
);

interface ArchivedCaseRow {
  id: string;
  code: string;
  updated_at: string;
  perizia_metadata: PeriziaMetadata | null;
}

async function processUserRetention(
  supabase: ReturnType<typeof createAdminClient>,
  userId: string,
  dataRetentionDays: number | null,
): Promise<{ deleted: number; notified: number }> {
  const retentionDays = resolveEffectiveRetentionDays(dataRetentionDays);

  const { data: archivedCases, error: fetchError } = await supabase
    .from('cases')
    .select('id, code, updated_at, perizia_metadata')
    .eq('user_id', userId)
    .eq('status', 'archiviato');

  if (fetchError) {
    logger.error('data-retention', `Failed to fetch cases for user ${userId}: ${fetchError.message}`);
    return { deleted: 0, notified: 0 };
  }

  const rows = (archivedCases ?? []) as ArchivedCaseRow[];
  if (rows.length === 0) return { deleted: 0, notified: 0 };

  const inputs: RetentionCaseInput[] = rows.map((row) => ({
    id: row.id,
    code: row.code,
    updatedAt: row.updated_at,
    noticeSentAt: row.perizia_metadata?.retentionNoticeSentAt ?? null,
  }));

  const plan = planRetentionActions(inputs, retentionDays, new Date());
  const metadataById = new Map(rows.map((row) => [row.id, row.perizia_metadata]));

  // 1. Stale notices (case touched / retention extended): clear tracking so
  //    a future expiry re-triggers a fresh notice. NB: does NOT bump
  //    updated_at — the retention clock must stay on the user's last action.
  for (const item of plan.toClearNotice) {
    const metadata = metadataById.get(item.id) ?? {};
    const cleared: PeriziaMetadata = { ...metadata };
    delete cleared.retentionNoticeSentAt;
    delete cleared.retentionNoticeDeleteAfter;
    await supabase.from('cases').update({ perizia_metadata: cleared }).eq('id', item.id);
  }

  // 2. Notices: ONE email per user listing all expiring cases. Cases are
  //    marked as notified ONLY if the email was actually sent (fail-safe:
  //    no notice → no future deletion).
  let notified = 0;
  if (plan.toNotify.length > 0 && retentionDays !== null) {
    const emailSent = await sendRetentionNoticeEmail(
      userId,
      plan.toNotify.map((c) => ({ code: c.code, deleteAfterIso: c.deleteAfter.toISOString() })),
      retentionDays,
    );

    if (emailSent) {
      const sentAt = new Date().toISOString();
      for (const item of plan.toNotify) {
        const metadata = metadataById.get(item.id) ?? {};
        const updated: PeriziaMetadata = {
          ...metadata,
          retentionNoticeSentAt: sentAt,
          retentionNoticeDeleteAfter: item.deleteAfter.toISOString(),
        };
        await supabase.from('cases').update({ perizia_metadata: updated }).eq('id', item.id);

        // Audit: compliance evidence of the advance notice (no patient data)
        await supabase.from('audit_log').insert({
          user_id: userId,
          action: 'case.retention_notice_sent',
          entity_type: 'case',
          entity_id: item.id,
          metadata: { retentionDays, deleteAfter: item.deleteAfter.toISOString() },
        });
      }
      notified = plan.toNotify.length;
    } else {
      logger.warn('data-retention', `Notice email failed for user ${userId} — ${plan.toNotify.length} case(s) NOT marked, deletion deferred`);
    }
  }

  // 3. Deletions: expired + notice matured (≥ 30 days ago)
  for (const item of plan.toDelete) {
    await deleteCaseAndRelatedData(supabase, item.id);

    await supabase.from('audit_log').insert({
      user_id: userId,
      action: 'case.auto_deleted',
      entity_type: 'case',
      entity_id: item.id,
      metadata: {
        reason: 'data_retention_policy',
        retentionDays,
        noticeSentAt: item.noticeSentAt,
      },
    });
  }

  if (plan.toDelete.length > 0 || notified > 0) {
    logger.info(
      'data-retention',
      `User ${userId}: ${plan.toDelete.length} deleted, ${notified} notified, ${plan.toClearNotice.length} notices cleared`,
    );
  }

  return { deleted: plan.toDelete.length, notified };
}
