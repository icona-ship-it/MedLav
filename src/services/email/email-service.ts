import { createAdminClient } from '@/lib/supabase/admin';
import { getResendClient } from '@/lib/email/client';
import { buildReportReadyEmail } from '@/lib/email/templates';
import { logger } from '@/lib/logger';

const FROM_EMAIL = process.env.RESEND_FROM_EMAIL ?? 'MedLav <noreply@medlav.it>';

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
