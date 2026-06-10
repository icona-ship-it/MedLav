import { createAdminClient } from '@/lib/supabase/admin';
import { getResendClient } from '@/lib/email/client';
import {
  buildReportReadyEmail,
  buildPipelineFailureEmail,
  buildRetentionNoticeEmail,
  type RetentionNoticeCaseItem,
} from '@/lib/email/templates';
import { logger } from '@/lib/logger';

const FROM_EMAIL = process.env.RESEND_FROM_EMAIL ?? 'LegMed <noreply@legmed.it>';

/**
 * Send a "report ready" email notification to the user.
 * Non-blocking: errors are logged but never thrown.
 */
export async function sendReportReadyEmail(
  userId: string,
  caseCode: string,
  caseId: string,
): Promise<void> {
  try {
    const supabase = createAdminClient();

    // Fetch user profile to get email and notification preference
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('email, email_notifications')
      .eq('id', userId)
      .single();

    if (profileError || !profile) {
      logger.warn('email', `Could not fetch profile for user ${userId}: ${profileError?.message ?? 'not found'}`);
      return;
    }

    // Respect user preference
    if (profile.email_notifications === false) {
      logger.info('email', `Email notifications disabled for user ${userId}, skipping`);
      return;
    }

    if (!process.env.RESEND_API_KEY) {
      logger.info('email', 'RESEND_API_KEY not configured, skipping email notification');
      return;
    }

    const { subject, html } = buildReportReadyEmail({ caseCode, caseId });

    const resend = getResendClient();
    const { error: sendError } = await resend.emails.send({
      from: FROM_EMAIL,
      to: profile.email as string,
      subject,
      html,
    });

    if (sendError) {
      logger.error('email', `Failed to send report-ready email for case ${caseId}: ${sendError.message}`);
      return;
    }

    logger.info('email', `Report-ready email sent for case ${caseId} to user ${userId}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('email', `Unexpected error sending report-ready email for case ${caseId}: ${message}`);
  }
}

/**
 * Send a "pipeline failed" email notification to the user.
 * Non-blocking: errors are logged but never thrown.
 */
export async function sendPipelineFailureEmail(
  userId: string,
  caseCode: string,
  caseId: string,
  stage: string,
): Promise<void> {
  try {
    const supabase = createAdminClient();

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('email, email_notifications')
      .eq('id', userId)
      .single();

    if (profileError || !profile) {
      logger.warn('email', `Could not fetch profile for user ${userId}: ${profileError?.message ?? 'not found'}`);
      return;
    }

    if (profile.email_notifications === false) {
      logger.info('email', `Email notifications disabled for user ${userId}, skipping failure email`);
      return;
    }

    if (!process.env.RESEND_API_KEY) {
      logger.info('email', 'RESEND_API_KEY not configured, skipping failure email');
      return;
    }

    const { subject, html } = buildPipelineFailureEmail({ caseCode, caseId, stage });

    const resend = getResendClient();
    const { error: sendError } = await resend.emails.send({
      from: FROM_EMAIL,
      to: profile.email as string,
      subject,
      html,
    });

    if (sendError) {
      logger.error('email', `Failed to send pipeline-failure email for case ${caseId}: ${sendError.message}`);
      return;
    }

    logger.info('email', `Pipeline-failure email sent for case ${caseId} to user ${userId}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('email', `Unexpected error sending pipeline-failure email for case ${caseId}: ${message}`);
  }
}

/**
 * Send the 30-day advance notice before automatic deletion of archived
 * cases (data retention policy).
 *
 * NOTE: this is a SERVICE/LEGAL notice, not a courtesy notification — it is
 * sent even when the user disabled email_notifications (no surprise
 * deletions, GDPR Art. 5(1)(e) + trasparenza).
 *
 * Returns true ONLY when the email was actually accepted by the provider:
 * the caller must NOT mark cases as notified (and later delete them) when
 * this returns false.
 */
export async function sendRetentionNoticeEmail(
  userId: string,
  cases: RetentionNoticeCaseItem[],
  retentionDays: number,
): Promise<boolean> {
  try {
    if (cases.length === 0) return false;

    const supabase = createAdminClient();
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('email')
      .eq('id', userId)
      .single();

    if (profileError || !profile?.email) {
      logger.warn('email', `Could not fetch profile for retention notice, user ${userId}: ${profileError?.message ?? 'not found'}`);
      return false;
    }

    if (!process.env.RESEND_API_KEY) {
      // Fail-safe: without email capability we cannot give notice, so the
      // caller will not delete anything. Logged loudly for visibility.
      logger.error('email', 'RESEND_API_KEY not configured — retention notices cannot be sent, automatic deletions are on hold');
      return false;
    }

    const { subject, html } = buildRetentionNoticeEmail({ cases, retentionDays });

    const resend = getResendClient();
    const { error: sendError } = await resend.emails.send({
      from: FROM_EMAIL,
      to: profile.email as string,
      subject,
      html,
    });

    if (sendError) {
      logger.error('email', `Failed to send retention notice to user ${userId}: ${sendError.message}`);
      return false;
    }

    logger.info('email', `Retention notice sent to user ${userId} for ${cases.length} case(s)`);
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('email', `Unexpected error sending retention notice to user ${userId}: ${message}`);
    return false;
  }
}
