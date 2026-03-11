const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://medlav.it';

interface ReportReadyEmailParams {
  caseCode: string;
  caseId: string;
}

interface EmailContent {
  subject: string;
  html: string;
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
              <h1 style="margin: 0; font-size: 20px; font-weight: 700; color: #18181b;">MedLav</h1>
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
                Questa email è stata inviata automaticamente da MedLav.<br>
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
