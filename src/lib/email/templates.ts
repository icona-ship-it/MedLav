const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://legmed.it';

export interface EmailContent {
  subject: string;
  html: string;
}

interface ReportReadyEmailParams {
  caseCode: string;
  caseId: string;
}

export function buildReportReadyEmail(params: ReportReadyEmailParams): EmailContent {
  const { caseCode, caseId } = params;
  const caseUrl = `${SITE_URL}/cases/${caseId}`;

  return {
    subject: `Report pronto per il caso ${caseCode}`,
    html: `
<!DOCTYPE html>
<html lang="it">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f4f4f5; color: #18181b;">
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr>
      <td style="padding: 40px 20px;">
        <table role="presentation" style="max-width: 560px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
          <!-- Header -->
          <tr>
            <td style="padding: 32px 32px 0; text-align: center;">
              <h1 style="margin: 0; font-size: 20px; font-weight: 700; color: #18181b;">LegMed</h1>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding: 24px 32px 32px;">
              <p style="margin: 0 0 16px; font-size: 15px; line-height: 1.6;">
                Il report medico-legale per il caso <strong>${caseCode}</strong> è stato generato con successo.
              </p>
              <p style="margin: 0 0 24px; font-size: 15px; line-height: 1.6;">
                Puoi visualizzarlo, modificarlo ed esportarlo accedendo alla pagina del caso.
              </p>
              <table role="presentation" style="margin: 0 auto;">
                <tr>
                  <td style="border-radius: 6px; background-color: #18181b;">
                    <a href="${caseUrl}" style="display: inline-block; padding: 12px 24px; font-size: 14px; font-weight: 600; color: #ffffff; text-decoration: none;">
                      Visualizza report
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding: 16px 32px; border-top: 1px solid #e4e4e7; text-align: center;">
              <p style="margin: 0; font-size: 12px; color: #71717a; line-height: 1.5;">
                Questa email è stata inviata automaticamente da LegMed.<br>
                Se non desideri ricevere queste notifiche, puoi disattivarle nelle impostazioni del tuo profilo.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`.trim(),
  };
}

interface PipelineFailureEmailParams {
  caseCode: string;
  caseId: string;
  stage: string;
}

export function buildPipelineFailureEmail(params: PipelineFailureEmailParams): EmailContent {
  const { caseCode, caseId, stage } = params;
  const caseUrl = `${SITE_URL}/cases/${caseId}`;

  return {
    subject: `Errore elaborazione caso ${caseCode}`,
    html: `
<!DOCTYPE html>
<html lang="it">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f4f4f5; color: #18181b;">
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr>
      <td style="padding: 40px 20px;">
        <table role="presentation" style="max-width: 560px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
          <tr>
            <td style="padding: 32px 32px 0; text-align: center;">
              <h1 style="margin: 0; font-size: 20px; font-weight: 700; color: #18181b;">LegMed</h1>
            </td>
          </tr>
          <tr>
            <td style="padding: 24px 32px 32px;">
              <p style="margin: 0 0 16px; font-size: 15px; line-height: 1.6;">
                L'elaborazione del caso <strong>${caseCode}</strong> si è interrotta durante la fase <em>${stage || 'elaborazione'}</em>.
              </p>
              <p style="margin: 0 0 24px; font-size: 15px; line-height: 1.6;">
                Puoi riprovare l'elaborazione dalla pagina del caso. Se il problema persiste, contatta il supporto tecnico.
              </p>
              <table role="presentation" style="margin: 0 auto;">
                <tr>
                  <td style="border-radius: 6px; background-color: #18181b;">
                    <a href="${caseUrl}" style="display: inline-block; padding: 12px 24px; font-size: 14px; font-weight: 600; color: #ffffff; text-decoration: none;">
                      Visualizza caso
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding: 16px 32px; border-top: 1px solid #e4e4e7; text-align: center;">
              <p style="margin: 0; font-size: 12px; color: #71717a; line-height: 1.5;">
                Questa email è stata inviata automaticamente da LegMed.<br>
                Se non desideri ricevere queste notifiche, puoi disattivarle nelle impostazioni del tuo profilo.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`.trim(),
  };
}

export interface RetentionNoticeCaseItem {
  /** Case code only — NEVER patient data (GDPR: email is an external channel). */
  code: string;
  /** Scheduled deletion date (ISO). */
  deleteAfterIso: string;
}

interface RetentionNoticeEmailParams {
  cases: RetentionNoticeCaseItem[];
  retentionDays: number;
}

/**
 * 30-day advance notice before automatic deletion of archived cases
 * (data retention policy, GDPR Art. 5(1)(e)). Sent by the daily cron.
 * Service/legal notice: sent regardless of the email_notifications preference.
 */
export function buildRetentionNoticeEmail(params: RetentionNoticeEmailParams): EmailContent {
  const { cases, retentionDays } = params;
  const settingsUrl = `${SITE_URL}/settings`;

  const rows = cases
    .map((c) => {
      const date = new Date(c.deleteAfterIso).toLocaleDateString('it-IT', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      });
      return `
                <tr>
                  <td style="padding: 8px 12px; border-bottom: 1px solid #e4e4e7; font-size: 14px;"><strong>${c.code}</strong></td>
                  <td style="padding: 8px 12px; border-bottom: 1px solid #e4e4e7; font-size: 14px;">${date}</td>
                </tr>`;
    })
    .join('');

  const plural = cases.length === 1 ? 'caso archiviato' : 'casi archiviati';

  return {
    subject: `Avviso: ${cases.length} ${plural} in eliminazione automatica tra 30 giorni`,
    html: `
<!DOCTYPE html>
<html lang="it">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f4f4f5; color: #18181b;">
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr>
      <td style="padding: 40px 20px;">
        <table role="presentation" style="max-width: 560px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
          <tr>
            <td style="padding: 32px 32px 0; text-align: center;">
              <h1 style="margin: 0; font-size: 20px; font-weight: 700; color: #18181b;">LegMed</h1>
            </td>
          </tr>
          <tr>
            <td style="padding: 24px 32px 32px;">
              <p style="margin: 0 0 16px; font-size: 15px; line-height: 1.6;">
                In base alla tua policy di conservazione dati (<strong>${retentionDays} giorni</strong> per i casi archiviati), i seguenti casi verranno <strong>eliminati automaticamente e in modo definitivo</strong> alle date indicate (non prima di 30 giorni da questo avviso):
              </p>
              <table role="presentation" style="width: 100%; border-collapse: collapse; margin: 0 0 24px;">
                <tr>
                  <td style="padding: 8px 12px; border-bottom: 2px solid #18181b; font-size: 13px; color: #71717a;">Caso</td>
                  <td style="padding: 8px 12px; border-bottom: 2px solid #18181b; font-size: 13px; color: #71717a;">Eliminazione dal</td>
                </tr>${rows}
              </table>
              <p style="margin: 0 0 16px; font-size: 15px; line-height: 1.6;">
                <strong>Per conservare questi casi</strong> puoi:
              </p>
              <ul style="margin: 0 0 24px; padding-left: 20px; font-size: 15px; line-height: 1.8;">
                <li>riaprire il caso dalla dashboard (qualsiasi modifica azzera il conteggio), oppure</li>
                <li>estendere il periodo di conservazione (o impostare &laquo;Mai&raquo;) in Impostazioni &rarr; Conservazione dati</li>
              </ul>
              <table role="presentation" style="margin: 0 auto;">
                <tr>
                  <td style="border-radius: 6px; background-color: #18181b;">
                    <a href="${settingsUrl}" style="display: inline-block; padding: 12px 24px; font-size: 14px; font-weight: 600; color: #ffffff; text-decoration: none;">
                      Gestisci conservazione dati
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding: 16px 32px; border-top: 1px solid #e4e4e7; text-align: center;">
              <p style="margin: 0; font-size: 12px; color: #71717a; line-height: 1.5;">
                Avviso di servizio previsto dalla policy di conservazione dati (GDPR).<br>
                Viene inviato anche se le notifiche email sono disattivate.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`.trim(),
  };
}
