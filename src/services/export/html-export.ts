import { sourceLabelsExport as sourceLabels, anomalyTypeLabels as anomalyLabels } from '@/lib/constants';
import { formatDate } from '@/lib/format';
import type { MedicoLegalCalculation } from '@/services/calculations/medico-legal-calc';

interface ExportEvent {
  order_number: number;
  event_date: string;
  date_precision: string;
  event_type: string;
  title: string;
  description: string;
  source_type: string;
  diagnosis: string | null;
  doctor: string | null;
  facility: string | null;
  confidence: number;
  requires_verification: boolean;
  reliability_notes: string | null;
  expert_notes: string | null;
}

interface ExportAnomaly {
  anomaly_type: string;
  severity: string;
  description: string;
  suggestion: string | null;
}

interface ExportMissingDoc {
  document_name: string;
  reason: string;
  related_event: string | null;
}

interface HtmlExportParams {
  caseCode: string;
  caseType: string;
  caseRole: string;
  patientInitials: string | null;
  synthesis: string | null;
  events: ExportEvent[];
  anomalies: ExportAnomaly[];
  missingDocs: ExportMissingDoc[];
  calculations?: MedicoLegalCalculation[];
}

const ROLE_DESCRIPTIONS: Record<string, string> = {
  ctu: 'CTU - Consulente Tecnico d\'Ufficio (prospettiva neutrale)',
  ctp: 'CTP - Consulente Tecnico di Parte (prospettiva del paziente)',
  stragiudiziale: 'Perito Stragiudiziale (valutazione di merito)',
};

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function confidenceClass(confidence: number): string {
  if (confidence >= 80) return 'confidence-high';
  if (confidence >= 50) return 'confidence-medium';
  return 'confidence-low';
}

/**
 * Generate a complete HTML report document.
 */
export function generateHtmlReport(params: HtmlExportParams): string {
  const { caseCode, caseType, caseRole, patientInitials, synthesis, events, anomalies, missingDocs, calculations } = params;

  const now = new Date().toLocaleDateString('it-IT', { year: 'numeric', month: 'long', day: 'numeric' });

  return `<!DOCTYPE html>
<html lang="it">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Report Medico-Legale - ${escapeHtml(caseCode)}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #333; max-width: 900px; margin: 0 auto; padding: 20px; }
  h1 { font-size: 24px; border-bottom: 3px solid #2563eb; padding-bottom: 8px; margin-bottom: 20px; }
  h2 { font-size: 20px; color: #1e40af; margin: 30px 0 15px; border-bottom: 1px solid #ddd; padding-bottom: 5px; }
  h3 { font-size: 16px; margin: 15px 0 8px; }
  .header-info { background: #f8fafc; padding: 15px; border-radius: 8px; margin-bottom: 20px; }
  .header-info p { margin: 3px 0; font-size: 14px; }
  .stats { display: flex; gap: 15px; margin-bottom: 25px; flex-wrap: wrap; }
  .stat { background: #f1f5f9; padding: 12px 20px; border-radius: 8px; text-align: center; min-width: 120px; }
  .stat .number { font-size: 28px; font-weight: bold; color: #1e40af; }
  .stat .label { font-size: 12px; color: #64748b; }
  #toc { background: #f8fafc; padding: 15px 20px; border-radius: 8px; margin-bottom: 25px; }
  #toc a { color: #2563eb; text-decoration: none; display: block; padding: 3px 0; font-size: 14px; }
  #toc a:hover { text-decoration: underline; }
  .event { border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px; margin-bottom: 8px; page-break-inside: avoid; }
  .event-header { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 6px; }
  .event-number { font-family: monospace; color: #64748b; font-size: 12px; }
  .event-date { font-weight: 600; }
  .event-type { background: #e2e8f0; padding: 2px 8px; border-radius: 4px; font-size: 12px; }
  .event-source { background: #dbeafe; padding: 2px 8px; border-radius: 4px; font-size: 12px; color: #1e40af; }
  .event-title { font-weight: 600; margin-bottom: 4px; }
  .event-description { font-size: 14px; white-space: pre-wrap; }
  .event-meta { font-size: 13px; color: #64748b; margin-top: 4px; }
  .confidence-high { color: #16a34a; }
  .confidence-medium { color: #ca8a04; }
  .confidence-low { color: #dc2626; }
  .verification { background: #fef3c7; color: #92400e; padding: 2px 6px; border-radius: 4px; font-size: 11px; }
  .anomaly { border-left: 4px solid #f59e0b; background: #fffbeb; padding: 12px; margin-bottom: 8px; border-radius: 0 8px 8px 0; }
  .anomaly.critica, .anomaly.alta { border-left-color: #dc2626; background: #fef2f2; }
  .anomaly-header { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
  .severity { padding: 2px 8px; border-radius: 4px; font-size: 12px; font-weight: 600; color: white; }
  .severity.critica, .severity.alta { background: #dc2626; }
  .severity.media { background: #f59e0b; }
  .severity.bassa { background: #6b7280; }
  .missing-doc { border: 1px solid #fecaca; background: #fef2f2; padding: 12px; margin-bottom: 8px; border-radius: 8px; }
  .synthesis { background: #f8fafc; padding: 20px; border-radius: 8px; white-space: pre-wrap; line-height: 1.8; }
  .expert-note { background: #eff6ff; border-left: 3px solid #2563eb; padding: 8px 12px; margin-top: 6px; font-size: 13px; }
  @media print {
    body { padding: 0; font-size: 11pt; }
    .no-print { display: none; }
    .event, .anomaly, .missing-doc { page-break-inside: avoid; }
    h2 { page-break-after: avoid; }
  }
</style>
</head>
<body>
<h1>Report Medico-Legale</h1>
<div class="header-info">
  <p><strong>Caso:</strong> ${escapeHtml(caseCode)}</p>
  <p><strong>Paziente:</strong> ${escapeHtml(patientInitials ?? 'N/D')}</p>
  <p><strong>Tipo:</strong> ${escapeHtml(caseType)} | <strong>Ruolo:</strong> ${escapeHtml(ROLE_DESCRIPTIONS[caseRole] ?? caseRole.toUpperCase())}</p>
  <p><strong>Data report:</strong> ${now}</p>
</div>

<div class="stats">
  <div class="stat"><div class="number">${events.length}</div><div class="label">Eventi</div></div>
  <div class="stat"><div class="number">${anomalies.length}</div><div class="label">Anomalie</div></div>
  <div class="stat"><div class="number">${missingDocs.length}</div><div class="label">Doc. Mancanti</div></div>
</div>

<div id="toc">
  <h3>Indice</h3>
  <a href="#synthesis">1. Sintesi Medico-Legale</a>
  <a href="#timeline">2. Cronologia Eventi Clinici</a>
  ${calculations && calculations.length > 0 ? '<a href="#calculations">3. Periodi Medico-Legali Calcolati</a>' : ''}
  <a href="#anomalies">${calculations && calculations.length > 0 ? '4' : '3'}. Anomalie Rilevate</a>
  <a href="#missing">${calculations && calculations.length > 0 ? '5' : '4'}. Documentazione Mancante</a>
</div>

<h2 id="synthesis">1. Sintesi Medico-Legale</h2>
${synthesis ? `<div class="synthesis">${escapeHtml(synthesis)}</div>` : '<p>Sintesi non ancora generata.</p>'}

<h2 id="timeline">2. Cronologia Eventi Clinici</h2>
${events.map((e) => `<div class="event">
  <div class="event-header">
    <span class="event-number">#${e.order_number}</span>
    <span class="event-date">${formatDate(e.event_date)}${e.date_precision !== 'giorno' ? ` [${e.date_precision}]` : ''}</span>
    <span class="event-type">${escapeHtml(e.event_type)}</span>
    <span class="event-source">${escapeHtml(sourceLabels[e.source_type] ?? e.source_type)}</span>
    <span class="${confidenceClass(e.confidence)}">${e.confidence}%</span>
    ${e.requires_verification ? '<span class="verification">Da verificare</span>' : ''}
  </div>
  <div class="event-title">${escapeHtml(e.title)}</div>
  <div class="event-description">${escapeHtml(e.description)}</div>
  ${e.diagnosis ? `<div class="event-meta"><strong>Diagnosi:</strong> ${escapeHtml(e.diagnosis)}</div>` : ''}
  ${e.doctor ? `<div class="event-meta"><strong>Medico:</strong> ${escapeHtml(e.doctor)}</div>` : ''}
  ${e.facility ? `<div class="event-meta"><strong>Struttura:</strong> ${escapeHtml(e.facility)}</div>` : ''}
  ${e.expert_notes ? `<div class="expert-note"><strong>Note perito:</strong> ${escapeHtml(e.expert_notes)}</div>` : ''}
</div>`).join('\n')}

${calculations && calculations.length > 0 ? `<h2 id="calculations">${calculations.length > 0 ? '3' : ''}. Periodi Medico-Legali Calcolati</h2>
<div style="display:grid;gap:8px">
${calculations.map((c) => `<div style="border:1px solid #e2e8f0;border-radius:8px;padding:12px">
  <div style="font-weight:600">${escapeHtml(c.label)}</div>
  <div style="font-size:24px;font-weight:bold;color:#1e40af">${escapeHtml(c.value)}</div>
  ${c.startDate && c.endDate ? `<div style="font-size:13px;color:#64748b">${formatDate(c.startDate)} — ${formatDate(c.endDate)}</div>` : ''}
  <div style="font-size:13px;color:#64748b;margin-top:4px">${escapeHtml(c.notes)}</div>
</div>`).join('\n')}
</div>` : ''}

<h2 id="anomalies">${calculations && calculations.length > 0 ? '4' : '3'}. Anomalie Rilevate</h2>
${anomalies.length === 0 ? '<p>Nessuna anomalia rilevata.</p>' : anomalies.map((a) => `<div class="anomaly ${a.severity}">
  <div class="anomaly-header">
    <span class="severity ${a.severity}">${a.severity.toUpperCase()}</span>
    <strong>${escapeHtml(anomalyLabels[a.anomaly_type] ?? a.anomaly_type)}</strong>
  </div>
  <p>${escapeHtml(a.description)}</p>
  ${a.suggestion ? `<p style="margin-top:6px;color:#64748b;font-style:italic">${escapeHtml(a.suggestion)}</p>` : ''}
</div>`).join('\n')}

<h2 id="missing">${calculations && calculations.length > 0 ? '5' : '4'}. Documentazione Mancante</h2>
${missingDocs.length === 0 ? '<p>Nessuna documentazione mancante rilevata.</p>' : missingDocs.map((d) => `<div class="missing-doc">
  <p><strong>${escapeHtml(d.document_name)}</strong></p>
  <p style="font-size:14px">${escapeHtml(d.reason)}</p>
  ${d.related_event ? `<p style="font-size:12px;color:#64748b">Evento correlato: ${escapeHtml(d.related_event)}</p>` : ''}
</div>`).join('\n')}

<footer style="margin-top:40px;padding-top:15px;border-top:1px solid #ddd;font-size:12px;color:#94a3b8;text-align:center">
  Report generato da MedLav il ${now}
</footer>
</body>
</html>`;
}
