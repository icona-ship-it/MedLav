import { sourceLabelsExport as sourceLabels, anomalyTypeLabels as anomalyLabels } from '@/lib/constants';
import { formatDate } from '@/lib/format';
import type { MedicoLegalCalculation } from '@/services/calculations/medico-legal-calc';
import type { DocumentWithPages } from './load-case-data';
import { assembleFullReport, type PeriziaMetadataExport as AssemblerPeriziaMetadata } from './report-assembler';
import { markdownToHtml } from './markdown-to-html';

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

interface PeriziaMetadataExport {
  tribunale?: string;
  sezione?: string;
  rgNumber?: string;
  judgeName?: string;
  ctuName?: string;
  ctuTitle?: string;
  collaboratoreName?: string;
  collaboratoreTitle?: string;
  ctpRicorrente?: string;
  ctpResistente?: string;
  parteRicorrente?: string;
  parteResistente?: string;
  dataIncarico?: string;
  dataOperazioni?: string;
  dataDeposito?: string;
  quesiti?: string[];
  fondoSpese?: string;
  [key: string]: unknown;
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
  periziaMetadata?: PeriziaMetadataExport | null;
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
function buildFormalHeader(pm: PeriziaMetadataExport, caseRole: string, patientInitials: string | null): string {
  const roleTitle = caseRole === 'ctu' ? 'Consulenza Tecnica d\'Ufficio'
    : caseRole === 'ctp' ? 'Consulenza Tecnica di Parte'
    : 'Perizia Stragiudiziale';

  let html = '<div style="text-align:center;margin-bottom:30px;border-bottom:2px solid #1e40af;padding-bottom:20px">';

  if (pm.tribunale) {
    html += `<p style="font-size:18px;font-weight:bold;text-transform:uppercase;margin-bottom:4px">${escapeHtml(pm.tribunale)}</p>`;
  }
  if (pm.sezione) {
    html += `<p style="font-size:14px;margin-bottom:12px">${escapeHtml(pm.sezione)}</p>`;
  }
  if (pm.rgNumber) {
    html += `<p style="font-size:14px;margin-bottom:12px">n. R.G. ${escapeHtml(pm.rgNumber)}</p>`;
  }

  html += `<p style="font-size:16px;font-weight:bold;margin:16px 0">${escapeHtml(roleTitle)}</p>`;

  if (patientInitials) {
    html += `<p style="font-size:14px;margin-bottom:12px">relativa alla vicenda clinica del/della sig. ${escapeHtml(patientInitials)}</p>`;
  }

  html += '</div>';

  // Parties and roles
  const details: string[] = [];
  if (pm.ctuName) details.push(`<strong>CTU:</strong> ${escapeHtml(pm.ctuName)}${pm.ctuTitle ? ` — ${escapeHtml(pm.ctuTitle)}` : ''}`);
  if (pm.judgeName) details.push(`<strong>Giudice:</strong> ${escapeHtml(pm.judgeName)}`);
  if (pm.parteRicorrente) details.push(`<strong>Parte Ricorrente:</strong> ${escapeHtml(pm.parteRicorrente)}`);
  if (pm.parteResistente) details.push(`<strong>Parte Resistente:</strong> ${escapeHtml(pm.parteResistente)}`);
  if (pm.ctpRicorrente) details.push(`<strong>CTP Ricorrente:</strong> ${escapeHtml(pm.ctpRicorrente)}`);
  if (pm.ctpResistente) details.push(`<strong>CTP Resistente:</strong> ${escapeHtml(pm.ctpResistente)}`);
  if (pm.dataIncarico) details.push(`<strong>Data incarico:</strong> ${escapeHtml(pm.dataIncarico)}`);
  if (pm.dataOperazioni) details.push(`<strong>Data operazioni:</strong> ${escapeHtml(pm.dataOperazioni)}`);
  if (pm.dataDeposito) details.push(`<strong>Termine deposito:</strong> ${escapeHtml(pm.dataDeposito)}`);
  if (pm.fondoSpese) details.push(`<strong>Fondo spese:</strong> ${escapeHtml(pm.fondoSpese)}`);

  if (details.length > 0) {
    html += '<div style="background:#f8fafc;padding:15px;border-radius:8px;margin-bottom:20px">';
    html += details.map((d) => `<p style="margin:3px 0;font-size:14px">${d}</p>`).join('\n');
    html += '</div>';
  }

  return html;
}

export function generateHtmlReport(params: HtmlExportParams): string {
  const { caseCode, caseType, caseRole, patientInitials, synthesis, events, anomalies, missingDocs, calculations, periziaMetadata } = params;

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
    @page { margin: 2cm; }
    body { padding: 0; font-size: 11pt; max-width: 100%; color: #000; }
    .no-print { display: none !important; }
    .event, .anomaly, .missing-doc { page-break-inside: avoid; }
    h1 { page-break-after: avoid; font-size: 18pt; }
    h2 { page-break-after: avoid; font-size: 14pt; }
    h3 { page-break-after: avoid; }
    .header-info, .stats, #toc { page-break-inside: avoid; }
    .stat { background: none !important; border: 1px solid #ccc; }
    .event-type, .event-source, .severity { background: none !important; border: 1px solid #999; color: #000 !important; }
    a { color: #000; text-decoration: none; }
    .synthesis { background: none !important; border: 1px solid #ddd; }
  }
</style>
</head>
<body>
${periziaMetadata ? buildFormalHeader(periziaMetadata, caseRole, patientInitials) : ''}
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

// ── Professional HTML Export ──

interface ProfessionalHtmlExportParams {
  caseCode: string;
  caseType: string;
  caseRole: string;
  patientInitials: string | null;
  synthesis: string | null;
  events: ExportEvent[];
  anomalies: ExportAnomaly[];
  missingDocs: ExportMissingDoc[];
  calculations?: MedicoLegalCalculation[];
  periziaMetadata: PeriziaMetadataExport;
  documentsWithPages: DocumentWithPages[];
}

function escapeHtmlPro(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Render section content: markdown sections go through markdownToHtml,
 * plain text sections get inline formatting + paragraph wrapping.
 */
function renderSectionContent(content: string, isMarkdown: boolean): string {
  if (isMarkdown) {
    return markdownToHtml(content);
  }
  // Simple rendering: convert markdown-like inline formatting
  return markdownToHtml(content);
}

/**
 * Generate a court-quality professional HTML report.
 * Uses assembled sections with full OCR documentation, print-optimized CSS.
 */
export function generateProfessionalHtmlReport(params: ProfessionalHtmlExportParams): string {
  const { caseCode, caseRole, patientInitials, periziaMetadata, documentsWithPages, synthesis, anomalies, missingDocs, calculations } = params;

  const pm = periziaMetadata as AssemblerPeriziaMetadata;
  const assembled = assembleFullReport({
    periziaMetadata: pm,
    caseRole,
    documentsWithPages,
    synthesis,
    anomalies,
    missingDocs,
    calculations,
  });

  const now = new Date().toLocaleDateString('it-IT', { year: 'numeric', month: 'long', day: 'numeric' });
  const roleTitle = caseRole === 'ctu' ? 'CONSULENZA TECNICA D\'UFFICIO'
    : caseRole === 'ctp' ? 'CONSULENZA TECNICA DI PARTE'
    : 'PERIZIA STRAGIUDIZIALE';

  const nrgInfo = pm.rgNumber ? `R.G. ${pm.rgNumber}` : caseCode;
  const patientInfo = patientInitials ?? '';
  const hasCollaboratore = Boolean(pm.collaboratoreName);

  // Build TOC
  const tocHtml = assembled.tableOfContents.map((item) =>
    `<a href="#section-${item.id}">${item.number}. ${escapeHtmlPro(item.title)}</a>`,
  ).join('\n    ');

  // Build sections
  const sectionsHtml = assembled.sections.map((section) => {
    const content = renderSectionContent(section.content, section.isMarkdown);
    return `<section class="report-section" id="section-${section.id}">
  <h2>${section.number}. ${escapeHtmlPro(section.title)}</h2>
  <div class="section-content">${content}</div>
</section>`;
  }).join('\n\n');

  return `<!DOCTYPE html>
<html lang="it">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtmlPro(roleTitle)} - ${escapeHtmlPro(nrgInfo)}</title>
<style>
  @page {
    margin: 2.5cm 2cm 2cm 2cm;
  }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: 'Times New Roman', Georgia, 'DejaVu Serif', serif;
    font-size: 11pt;
    line-height: 1.6;
    color: #000;
    max-width: 800px;
    margin: 0 auto;
    padding: 20px;
    text-align: justify;
  }

  /* ── Running Header (2-column, benchmark style) ── */
  .running-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    padding-bottom: 6px;
    border-bottom: 1.5px dotted #444;
    margin-bottom: 20px;
    font-size: 9.5pt;
    line-height: 1.3;
  }
  .running-header .rh-col {
    max-width: 48%;
  }
  .running-header .rh-col-left { text-align: left; }
  .running-header .rh-col-right { text-align: right; }
  .running-header .rh-name {
    font-weight: bold;
    font-style: italic;
    font-variant: small-caps;
    font-size: 10pt;
  }
  .running-header .rh-title {
    font-variant: small-caps;
    font-size: 8.5pt;
    color: #333;
  }

  /* ── Running Footer (benchmark style) ── */
  .running-footer {
    border-top: 1.5px dotted #444;
    padding-top: 6px;
    margin-top: 24px;
    display: flex;
    justify-content: space-between;
    font-size: 8.5pt;
    font-style: italic;
    color: #444;
  }

  /* Cover / Title */
  .cover {
    text-align: center;
    padding: 40px 0 30px;
    margin-bottom: 30px;
    page-break-after: always;
  }
  .cover .tribunale { font-size: 16pt; font-weight: bold; text-transform: uppercase; margin-bottom: 8px; }
  .cover .sezione { font-size: 12pt; font-style: italic; margin-bottom: 6px; }
  .cover .rg { font-size: 12pt; margin-bottom: 20px; }
  .cover .role-title { font-size: 14pt; font-weight: bold; font-style: italic; text-decoration: underline; margin: 20px 0 10px; }
  .cover .patient { font-size: 12pt; margin-bottom: 20px; font-variant: small-caps; }
  .cover .details { text-align: left; font-size: 11pt; margin: 20px auto; max-width: 500px; }
  .cover .details p { margin: 4px 0; }

  /* Table of Contents */
  .toc {
    page-break-after: always;
    margin-bottom: 30px;
  }
  .toc h2 { text-align: center; font-size: 14pt; text-decoration: underline; margin-bottom: 20px; }
  .toc a { color: #000; text-decoration: none; display: block; padding: 4px 0; font-size: 11pt; }
  .toc a:hover { text-decoration: underline; }

  /* Sections */
  .report-section { margin-bottom: 24px; }
  .report-section h2 {
    font-size: 13pt;
    text-decoration: underline;
    text-transform: uppercase;
    margin: 30px 0 12px;
    page-break-after: avoid;
  }
  .report-section h3 {
    font-size: 12pt;
    font-weight: bold;
    margin: 16px 0 8px;
    page-break-after: avoid;
  }
  .report-section h4 {
    font-size: 11pt;
    font-weight: bold;
    margin: 12px 0 6px;
    page-break-after: avoid;
  }
  .section-content { margin-top: 8px; }
  .section-content p { margin-bottom: 8px; text-indent: 0; }
  .section-content ul, .section-content ol { margin: 8px 0 8px 24px; }
  .section-content li { margin-bottom: 4px; }

  /* OCR Tables */
  .ocr-table {
    width: 100%;
    border-collapse: collapse;
    margin: 12px 0;
    font-size: 10pt;
    page-break-inside: avoid;
  }
  .ocr-table th, .ocr-table td {
    border: 1px solid #333;
    padding: 4px 8px;
    text-align: left;
    vertical-align: top;
  }
  .ocr-table th {
    background: #f0f0f0;
    font-weight: bold;
  }

  /* Horizontal rule (page separator in OCR) */
  hr { border: none; border-top: 1px dashed #999; margin: 16px 0; }

  /* Footer for screen */
  .screen-footer {
    margin-top: 40px;
    padding-top: 15px;
    border-top: 1px solid #ddd;
    font-size: 9pt;
    color: #999;
    text-align: center;
  }

  /* Print: fixed header/footer on every page */
  .print-header, .print-footer { display: none; }

  @media print {
    body { padding: 0; max-width: 100%; padding-top: 60px; padding-bottom: 40px; }
    .screen-footer { display: none; }
    .running-header { display: none; }
    .running-footer { display: none; }
    .print-header {
      display: flex;
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      justify-content: space-between;
      align-items: flex-start;
      padding: 0 0 6px 0;
      border-bottom: 1.5px dotted #444;
      font-size: 9.5pt;
      line-height: 1.3;
      background: #fff;
      z-index: 100;
    }
    .print-header .rh-col { max-width: 48%; }
    .print-header .rh-col-left { text-align: left; }
    .print-header .rh-col-right { text-align: right; }
    .print-header .rh-name { font-weight: bold; font-style: italic; font-variant: small-caps; font-size: 10pt; }
    .print-header .rh-title { font-variant: small-caps; font-size: 8.5pt; color: #333; }
    .print-footer {
      display: flex;
      position: fixed;
      bottom: 0;
      left: 0;
      right: 0;
      justify-content: space-between;
      padding: 6px 0 0 0;
      border-top: 1.5px dotted #444;
      font-size: 8.5pt;
      font-style: italic;
      color: #444;
      background: #fff;
      z-index: 100;
    }
    .report-section { page-break-before: auto; }
    .report-section h2 { page-break-after: avoid; }
    .ocr-table { page-break-inside: avoid; }
    a { color: #000; text-decoration: none; }
  }
</style>
</head>
<body>
<!-- Print-only fixed header (2 columns, benchmark style) -->
<div class="print-header">
  <div class="rh-col rh-col-left">
    ${pm.ctuName ? `<div class="rh-name">${escapeHtmlPro(pm.ctuName)}</div>` : ''}
    ${pm.ctuTitle ? `<div class="rh-title">${escapeHtmlPro(pm.ctuTitle)}</div>` : ''}
  </div>
  ${hasCollaboratore ? `<div class="rh-col rh-col-right">
    <div class="rh-name">${escapeHtmlPro(pm.collaboratoreName!)}</div>
    ${pm.collaboratoreTitle ? `<div class="rh-title">${escapeHtmlPro(pm.collaboratoreTitle)}</div>` : ''}
  </div>` : ''}
</div>
<!-- Print-only fixed footer -->
<div class="print-footer">
  <span>${escapeHtmlPro(pm.rgNumber ? `${pm.rgNumber} N.R.G.` : caseCode)} – ${escapeHtmlPro(patientInfo)}${pm.parteResistente ? ` // ${escapeHtmlPro(pm.parteResistente)}` : ''}</span>
</div>

<!-- Screen header (visible on screen, hidden in print) -->
<div class="running-header">
  <div class="rh-col rh-col-left">
    ${pm.ctuName ? `<div class="rh-name">${escapeHtmlPro(pm.ctuName)}</div>` : ''}
    ${pm.ctuTitle ? `<div class="rh-title">${escapeHtmlPro(pm.ctuTitle)}</div>` : ''}
  </div>
  ${hasCollaboratore ? `<div class="rh-col rh-col-right">
    <div class="rh-name">${escapeHtmlPro(pm.collaboratoreName!)}</div>
    ${pm.collaboratoreTitle ? `<div class="rh-title">${escapeHtmlPro(pm.collaboratoreTitle)}</div>` : ''}
  </div>` : ''}
</div>

<!-- COVER PAGE -->
<div class="cover">
  ${pm.tribunale ? `<div class="tribunale">${escapeHtmlPro(pm.tribunale)}</div>` : ''}
  ${pm.sezione ? `<div class="sezione">${escapeHtmlPro(pm.sezione)}</div>` : ''}
  ${pm.rgNumber ? `<div class="rg">n. R.G. ${escapeHtmlPro(pm.rgNumber)}</div>` : ''}
  <div class="role-title">${escapeHtmlPro(roleTitle)}</div>
  ${patientInitials ? `<div class="patient">relativa alla vicenda clinica del/della sig. ${escapeHtmlPro(patientInitials)}</div>` : ''}
  <div class="details">
    ${pm.ctuName ? `<p><strong>${caseRole === 'ctu' ? 'CTU' : 'CTP'}:</strong> ${escapeHtmlPro(pm.ctuName)}${pm.ctuTitle ? ` — ${escapeHtmlPro(pm.ctuTitle)}` : ''}</p>` : ''}
    ${hasCollaboratore ? `<p><strong>Collaboratore:</strong> ${escapeHtmlPro(pm.collaboratoreName!)}${pm.collaboratoreTitle ? ` — ${escapeHtmlPro(pm.collaboratoreTitle)}` : ''}</p>` : ''}
    ${pm.judgeName ? `<p><strong>Giudice:</strong> ${escapeHtmlPro(pm.judgeName)}</p>` : ''}
    ${pm.parteRicorrente ? `<p><strong>Parte Ricorrente:</strong> ${escapeHtmlPro(pm.parteRicorrente)}</p>` : ''}
    ${pm.parteResistente ? `<p><strong>Parte Resistente:</strong> ${escapeHtmlPro(pm.parteResistente)}</p>` : ''}
    ${pm.ctpRicorrente ? `<p><strong>CTP Ricorrente:</strong> ${escapeHtmlPro(pm.ctpRicorrente)}</p>` : ''}
    ${pm.ctpResistente ? `<p><strong>CTP Resistente:</strong> ${escapeHtmlPro(pm.ctpResistente)}</p>` : ''}
    ${pm.dataIncarico ? `<p><strong>Data incarico:</strong> ${escapeHtmlPro(pm.dataIncarico)}</p>` : ''}
    ${pm.dataDeposito ? `<p><strong>Termine deposito:</strong> ${escapeHtmlPro(pm.dataDeposito)}</p>` : ''}
    ${pm.fondoSpese ? `<p><strong>Fondo spese:</strong> ${escapeHtmlPro(pm.fondoSpese)}</p>` : ''}
  </div>
</div>

<!-- TABLE OF CONTENTS -->
<div class="toc">
  <h2>INDICE</h2>
  <div>
    ${tocHtml}
  </div>
</div>

<!-- REPORT SECTIONS -->
${sectionsHtml}

<footer class="screen-footer">
  Report generato da MedLav il ${now}
</footer>
</body>
</html>`;
}
