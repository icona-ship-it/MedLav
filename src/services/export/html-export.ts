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
  reportStatus?: string;
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
 * Determine the watermark text based on report status.
 */
function getWatermarkText(reportStatus?: string): string {
  if (reportStatus === 'bozza') return 'RISERVATO — BOZZA';
  return 'CONFIDENZIALE';
}

/**
 * Generate CSS for a diagonal watermark overlay.
 */
function buildWatermarkCss(reportStatus?: string): string {
  const text = getWatermarkText(reportStatus);
  return `
  .watermark-wrapper { position: relative; }
  .watermark-wrapper::after {
    content: '${text}';
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%) rotate(-45deg);
    font-size: 80px;
    font-weight: bold;
    color: rgba(180, 180, 180, 0.25);
    white-space: nowrap;
    pointer-events: none;
    z-index: 9999;
    letter-spacing: 8px;
    text-transform: uppercase;
  }
  @media print {
    .watermark-wrapper::after {
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%) rotate(-45deg);
      font-size: 80px;
      color: rgba(180, 180, 180, 0.20);
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
  }`;
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
  const { caseCode, caseType, caseRole, patientInitials, synthesis, events, anomalies, missingDocs, calculations, periziaMetadata, reportStatus } = params;

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
  ${buildWatermarkCss(reportStatus)}
</style>
</head>
<body>
<div class="watermark-wrapper">
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
</div>
</body>
</html>`;
}

// ── Professional HTML Export (Court-Quality PDF) ──

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
  reportStatus?: string;
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
 * Build CSS for BOZZA diagonal watermark (only when report status is 'bozza').
 * For non-bozza reports, no watermark is rendered.
 */
function buildDraftWatermarkCss(reportStatus?: string): string {
  if (reportStatus !== 'bozza') return '';
  return `
  .watermark-overlay::after {
    content: 'BOZZA';
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%) rotate(-45deg);
    font-size: 100pt;
    font-weight: bold;
    color: rgba(200, 0, 0, 0.08);
    white-space: nowrap;
    pointer-events: none;
    z-index: 9999;
    letter-spacing: 20px;
    text-transform: uppercase;
    font-family: 'Times New Roman', Georgia, serif;
  }
  @media print {
    .watermark-overlay::after {
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%) rotate(-45deg);
      font-size: 100pt;
      color: rgba(200, 0, 0, 0.06);
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
  }`;
}

/**
 * Generate a court-quality professional HTML report optimized for Cmd+P -> Save as PDF.
 * Produces A4 pages with proper legal formatting, cover page, TOC, running headers/footers,
 * and professional typography suitable for court submission.
 */
export function generateProfessionalHtmlReport(params: ProfessionalHtmlExportParams): string {
  const { caseCode, caseRole, patientInitials, periziaMetadata, documentsWithPages, synthesis, anomalies, missingDocs, calculations, reportStatus } = params;

  const pm = periziaMetadata as AssemblerPeriziaMetadata;
  const assembled = assembleFullReport({
    periziaMetadata: pm,
    caseRole,
    documentsWithPages,
    synthesis,
    anomalies,
    missingDocs,
    calculations,
    events: (params.events ?? []).map((e) => ({
      event_date: e.event_date,
      event_type: e.event_type,
      title: e.title,
      description: e.description,
      source_type: e.source_type,
      source_text: (e as unknown as Record<string, unknown>).source_text as string | null ?? null,
      diagnosis: e.diagnosis,
      doctor: e.doctor,
      facility: e.facility,
    })),
  });

  const now = new Date().toLocaleDateString('it-IT', { year: 'numeric', month: 'long', day: 'numeric' });
  const roleTitle = caseRole === 'ctu' ? 'CONSULENZA TECNICA D\'UFFICIO'
    : caseRole === 'ctp' ? 'CONSULENZA TECNICA DI PARTE'
    : 'PERIZIA STRAGIUDIZIALE';

  const nrgInfo = pm.rgNumber ? `R.G. ${pm.rgNumber}` : caseCode;
  const patientInfo = patientInitials ?? '';
  const hasCollaboratore = Boolean(pm.collaboratoreName);
  const isDraft = reportStatus === 'bozza';

  // Build TOC entries with dotted leaders
  const tocHtml = assembled.tableOfContents.map((item) =>
    `<div class="toc-entry">
      <a href="#section-${item.id}">
        <span class="toc-number">${item.number}.</span>
        <span class="toc-title">${escapeHtmlPro(item.title)}</span>
        <span class="toc-dots"></span>
      </a>
    </div>`,
  ).join('\n    ');

  // Build sections with proper legal formatting
  const sectionsHtml = assembled.sections.map((section) => {
    const content = renderSectionContent(section.content, section.isMarkdown);
    return `<section class="report-section" id="section-${section.id}">
  <h2><span class="section-num">${section.number}.</span> ${escapeHtmlPro(section.title)}</h2>
  <div class="section-content">${content}</div>
</section>`;
  }).join('\n\n');

  // Cover page: build party line for "Ricorrente vs Resistente"
  const partiesLine = (pm.parteRicorrente && pm.parteResistente)
    ? `<div class="cover-parties">
        <span class="party-name">${escapeHtmlPro(pm.parteRicorrente)}</span>
        <span class="party-vs">contro</span>
        <span class="party-name">${escapeHtmlPro(pm.parteResistente)}</span>
      </div>`
    : [
      pm.parteRicorrente ? `<div class="cover-party-single"><strong>Parte ricorrente:</strong> ${escapeHtmlPro(pm.parteRicorrente)}</div>` : '',
      pm.parteResistente ? `<div class="cover-party-single"><strong>Parte resistente:</strong> ${escapeHtmlPro(pm.parteResistente)}</div>` : '',
    ].filter(Boolean).join('\n');

  return `<!DOCTYPE html>
<html lang="it">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtmlPro(roleTitle)} - ${escapeHtmlPro(nrgInfo)}</title>
<style>
  /* ══════════════════════════════════════════════════════
     A4 PAGE SETUP — Court-Quality Legal Document
     ══════════════════════════════════════════════════════ */
  @page {
    size: A4;
    margin: 2.5cm 2cm 2.5cm 2.5cm;
  }

  @page :first {
    margin-top: 2cm;
  }

  * { margin: 0; padding: 0; box-sizing: border-box; }

  body {
    font-family: 'Times New Roman', Georgia, 'DejaVu Serif', 'Liberation Serif', serif;
    font-size: 12pt;
    line-height: 1.6;
    color: #000;
    max-width: 780px;
    margin: 0 auto;
    padding: 30px 20px;
    text-align: justify;
    -webkit-hyphens: auto;
    hyphens: auto;
  }

  /* ── Print Button (screen only) ── */
  .print-toolbar {
    position: fixed;
    top: 16px;
    right: 16px;
    z-index: 10000;
    display: flex;
    gap: 8px;
    align-items: center;
  }
  .btn-print {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 10px 20px;
    background: #1e40af;
    color: #fff;
    border: none;
    border-radius: 6px;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    box-shadow: 0 2px 8px rgba(30, 64, 175, 0.3);
    transition: background 0.2s, box-shadow 0.2s;
  }
  .btn-print:hover {
    background: #1534a0;
    box-shadow: 0 4px 12px rgba(30, 64, 175, 0.4);
  }
  .btn-print svg {
    width: 16px;
    height: 16px;
    fill: currentColor;
  }
  ${isDraft ? `.draft-badge {
    display: inline-block;
    padding: 6px 14px;
    background: #dc2626;
    color: #fff;
    border-radius: 6px;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 1px;
    text-transform: uppercase;
  }` : ''}

  /* ── Running Header (screen) ── */
  .running-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding-bottom: 8px;
    border-bottom: 1px solid #444;
    margin-bottom: 24px;
    font-size: 9pt;
    color: #444;
  }
  .running-header .rh-left { text-align: left; }
  .running-header .rh-right {
    text-align: right;
    font-weight: bold;
    font-variant: small-caps;
    letter-spacing: 2px;
  }

  /* ── Running Footer (screen) ── */
  .running-footer {
    border-top: 1px solid #444;
    padding-top: 8px;
    margin-top: 30px;
    display: flex;
    justify-content: space-between;
    font-size: 8.5pt;
    color: #555;
  }

  /* ══════════════════════════════════════════════════════
     COVER PAGE
     ══════════════════════════════════════════════════════ */
  .cover {
    text-align: center;
    padding: 60px 0 40px;
    page-break-after: always;
    min-height: 85vh;
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
  }
  .cover-rule {
    width: 60%;
    height: 2px;
    background: #000;
    margin: 0 auto;
  }
  .cover-rule-thin {
    width: 40%;
    height: 1px;
    background: #666;
    margin: 8px auto;
  }
  .cover .tribunale {
    font-size: 16pt;
    font-weight: bold;
    text-transform: uppercase;
    letter-spacing: 3px;
    margin: 24px 0 4px;
  }
  .cover .sezione {
    font-size: 12pt;
    font-style: italic;
    margin-bottom: 4px;
  }
  .cover .rg {
    font-size: 13pt;
    font-weight: bold;
    margin: 8px 0 24px;
  }
  .cover .role-title {
    font-size: 16pt;
    font-weight: bold;
    letter-spacing: 4px;
    text-transform: uppercase;
    margin: 30px 0 16px;
    padding: 12px 0;
    border-top: 1px solid #000;
    border-bottom: 1px solid #000;
  }
  .cover .patient {
    font-size: 13pt;
    margin: 16px 0 8px;
    font-style: italic;
  }
  .cover-parties {
    margin: 20px 0;
    font-size: 13pt;
  }
  .cover-parties .party-name {
    font-weight: bold;
    display: block;
    margin: 4px 0;
  }
  .cover-parties .party-vs {
    font-style: italic;
    font-size: 11pt;
    color: #444;
    display: block;
    margin: 6px 0;
  }
  .cover-party-single {
    font-size: 12pt;
    margin: 4px 0;
  }
  .cover .judge-line {
    font-size: 12pt;
    margin: 16px 0 6px;
    font-style: italic;
  }
  .cover-details {
    text-align: left;
    font-size: 11pt;
    margin: 30px auto 0;
    max-width: 480px;
    line-height: 1.8;
  }
  .cover-details table {
    border-collapse: collapse;
    width: 100%;
  }
  .cover-details td {
    padding: 3px 8px;
    vertical-align: top;
    font-size: 11pt;
  }
  .cover-details td:first-child {
    font-weight: bold;
    white-space: nowrap;
    width: 1%;
    padding-right: 16px;
  }
  .cover-ctp-block {
    margin-top: 20px;
    padding-top: 12px;
    border-top: 1px dotted #999;
  }
  .cover-ctp-block p {
    margin: 3px 0;
    font-size: 11pt;
  }
  .cover-dates {
    margin-top: 20px;
    text-align: center;
    font-size: 10pt;
    color: #444;
  }
  .cover-dates p {
    margin: 2px 0;
  }
  .cover-casecode {
    margin-top: 40px;
    font-size: 9pt;
    color: #888;
    font-family: 'Courier New', monospace;
    letter-spacing: 1px;
  }

  /* ══════════════════════════════════════════════════════
     TABLE OF CONTENTS
     ══════════════════════════════════════════════════════ */
  .toc {
    page-break-after: always;
    padding: 40px 0 20px;
  }
  .toc-heading {
    text-align: center;
    font-size: 14pt;
    font-weight: bold;
    text-transform: uppercase;
    letter-spacing: 3px;
    margin-bottom: 8px;
  }
  .toc-rule {
    width: 30%;
    height: 1px;
    background: #000;
    margin: 0 auto 30px;
  }
  .toc-entry {
    margin-bottom: 2px;
  }
  .toc-entry a {
    color: #000;
    text-decoration: none;
    display: flex;
    align-items: baseline;
    font-size: 12pt;
    line-height: 2;
  }
  .toc-entry a:hover {
    color: #1e40af;
  }
  .toc-number {
    font-weight: bold;
    min-width: 30px;
    flex-shrink: 0;
  }
  .toc-title {
    flex-shrink: 0;
    margin-right: 4px;
  }
  .toc-dots {
    flex-grow: 1;
    border-bottom: 1px dotted #999;
    margin: 0 4px;
    min-width: 20px;
    position: relative;
    top: -4px;
  }

  /* ══════════════════════════════════════════════════════
     REPORT SECTIONS
     ══════════════════════════════════════════════════════ */
  .report-section {
    margin-bottom: 28px;
  }
  .report-section h2 {
    font-size: 13pt;
    font-weight: bold;
    text-transform: uppercase;
    margin: 32px 0 14px;
    padding-bottom: 6px;
    border-bottom: 1.5px solid #000;
    page-break-after: avoid;
    letter-spacing: 1px;
  }
  .report-section h2 .section-num {
    font-weight: bold;
  }
  .report-section h3 {
    font-size: 12pt;
    font-weight: bold;
    margin: 18px 0 8px;
    page-break-after: avoid;
  }
  .report-section h4 {
    font-size: 11pt;
    font-weight: bold;
    font-style: italic;
    margin: 14px 0 6px;
    page-break-after: avoid;
  }

  .section-content {
    margin-top: 10px;
  }
  .section-content p {
    margin-bottom: 10px;
    text-indent: 1cm;
    text-align: justify;
  }
  .section-content p:first-child {
    text-indent: 0;
  }
  .section-content ul {
    margin: 10px 0 10px 1.5cm;
    list-style-type: disc;
  }
  .section-content ol {
    margin: 10px 0 10px 1.5cm;
    list-style-type: none;
    counter-reset: legal-list;
  }
  .section-content ol > li {
    counter-increment: legal-list;
    position: relative;
    padding-left: 0;
  }
  .section-content ol > li::before {
    content: counter(legal-list) ")";
    font-weight: bold;
    position: absolute;
    left: -1.5cm;
    width: 1.2cm;
    text-align: right;
  }
  .section-content li {
    margin-bottom: 6px;
    text-align: justify;
  }

  /* ── Tables in sections ── */
  .ocr-table {
    width: 100%;
    border-collapse: collapse;
    margin: 14px 0;
    font-size: 10pt;
    page-break-inside: avoid;
  }
  .ocr-table th,
  .ocr-table td {
    border: 1px solid #333;
    padding: 5px 10px;
    text-align: left;
    vertical-align: top;
  }
  .ocr-table th {
    background: #e8e8e8;
    font-weight: bold;
    text-transform: uppercase;
    font-size: 9pt;
    letter-spacing: 0.5px;
  }
  .ocr-table tr:nth-child(even) td {
    background: #fafafa;
  }

  /* ── Horizontal rule ── */
  hr {
    border: none;
    border-top: 1px dashed #999;
    margin: 18px 0;
  }

  /* ── Screen footer ── */
  .screen-footer {
    margin-top: 50px;
    padding-top: 15px;
    border-top: 1px solid #ccc;
    font-size: 9pt;
    color: #999;
    text-align: center;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  }

  /* ══════════════════════════════════════════════════════
     PRINT STYLES — Cmd+P / Save as PDF
     ══════════════════════════════════════════════════════ */
  .print-header-fixed,
  .print-footer-fixed {
    display: none;
  }

  @media print {
    body {
      padding: 0;
      max-width: 100%;
      font-size: 12pt;
      padding-top: 50px;
      padding-bottom: 40px;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }

    /* Hide screen-only elements */
    .print-toolbar { display: none !important; }
    .screen-footer { display: none !important; }
    .running-header { display: none !important; }
    .running-footer { display: none !important; }

    /* Fixed header on every printed page */
    .print-header-fixed {
      display: flex;
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      justify-content: space-between;
      align-items: center;
      padding: 0 0 4px 0;
      border-bottom: 1px solid #666;
      font-size: 8.5pt;
      color: #555;
      background: #fff;
      z-index: 100;
    }
    .print-header-fixed .ph-left {
      font-style: italic;
    }
    .print-header-fixed .ph-right {
      font-weight: bold;
      font-variant: small-caps;
      letter-spacing: 2px;
      font-size: 8pt;
    }

    /* Fixed footer on every printed page */
    .print-footer-fixed {
      display: block;
      position: fixed;
      bottom: 0;
      left: 0;
      right: 0;
      text-align: center;
      padding: 4px 0 0 0;
      border-top: 1px solid #666;
      font-size: 8pt;
      color: #555;
      background: #fff;
      z-index: 100;
    }

    /* Page break control */
    h2, h3 {
      page-break-after: avoid;
    }
    .report-section {
      page-break-before: auto;
    }
    .page-break {
      page-break-before: always;
    }
    .ocr-table {
      page-break-inside: avoid;
    }

    /* Tables print with visible borders */
    .ocr-table th {
      background: #e8e8e8 !important;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .ocr-table tr:nth-child(even) td {
      background: #fafafa !important;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }

    /* Links: no color change */
    a { color: #000; text-decoration: none; }

    /* Cover page fills the page */
    .cover {
      min-height: auto;
      padding: 80px 0 40px;
    }
  }

  /* ── BOZZA Watermark (draft only) ── */
  ${buildDraftWatermarkCss(reportStatus)}
</style>
</head>
<body>
<div class="watermark-overlay">
<!-- ═══ Print Toolbar (screen only) ═══ -->
<div class="print-toolbar no-print">
  <button class="btn-print" onclick="window.print()" title="Stampa o salva come PDF">
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M19 8H5c-1.66 0-3 1.34-3 3v6h4v4h12v-4h4v-6c0-1.66-1.34-3-3-3zm-3 11H8v-5h8v5zm3-7c-.55 0-1-.45-1-1s.45-1 1-1 1 .45 1 1-.45 1-1 1zm-1-9H6v4h12V3z"/></svg>
    Stampa PDF
  </button>
  ${isDraft ? '<span class="draft-badge">BOZZA</span>' : ''}
</div>

<!-- ═══ Print-only fixed header ═══ -->
<div class="print-header-fixed">
  <span class="ph-left">${escapeHtmlPro(nrgInfo)}</span>
  <span class="ph-right">Riservato</span>
</div>

<!-- ═══ Print-only fixed footer ═══ -->
<div class="print-footer-fixed">
  ${escapeHtmlPro(roleTitle)} &mdash; ${escapeHtmlPro(nrgInfo)}
</div>

<!-- ═══ Screen header ═══ -->
<div class="running-header no-print-hide">
  <div class="rh-left">${escapeHtmlPro(nrgInfo)}${patientInfo ? ` &mdash; ${escapeHtmlPro(patientInfo)}` : ''}</div>
  <div class="rh-right">Riservato</div>
</div>

<!-- ═══════════════════════════════════════════════
     COVER PAGE (Frontespizio)
     ═══════════════════════════════════════════════ -->
<div class="cover">
  <div class="cover-rule"></div>
  <div class="cover-rule-thin"></div>

  ${pm.tribunale ? `<div class="tribunale">${escapeHtmlPro(pm.tribunale)}</div>` : ''}
  ${pm.sezione ? `<div class="sezione">${escapeHtmlPro(pm.sezione)}</div>` : ''}
  ${pm.rgNumber ? `<div class="rg">n. R.G. ${escapeHtmlPro(pm.rgNumber)}</div>` : ''}

  ${pm.judgeName ? `<div class="judge-line">Giudice: ${escapeHtmlPro(pm.judgeName)}</div>` : ''}

  ${partiesLine}

  <div class="role-title">${escapeHtmlPro(roleTitle)}</div>

  ${patientInitials ? `<div class="patient">relativa alla vicenda clinica del/della sig. ${escapeHtmlPro(patientInitials)}</div>` : ''}

  <div class="cover-details">
    <table>
      ${pm.ctuName ? `<tr><td>${caseRole === 'ctu' ? 'CTU:' : caseRole === 'ctp' ? 'CTP:' : 'Perito:'}</td><td>${escapeHtmlPro(pm.ctuName)}${pm.ctuTitle ? `<br><em>${escapeHtmlPro(pm.ctuTitle)}</em>` : ''}</td></tr>` : ''}
      ${hasCollaboratore ? `<tr><td>Collaboratore:</td><td>${escapeHtmlPro(pm.collaboratoreName!)}${pm.collaboratoreTitle ? `<br><em>${escapeHtmlPro(pm.collaboratoreTitle)}</em>` : ''}</td></tr>` : ''}
    </table>
  </div>

  ${(pm.ctpRicorrente || pm.ctpResistente) ? `<div class="cover-ctp-block">
    ${pm.ctpRicorrente ? `<p><strong>CTP parte ricorrente:</strong> ${escapeHtmlPro(pm.ctpRicorrente)}</p>` : ''}
    ${pm.ctpResistente ? `<p><strong>CTP parte resistente:</strong> ${escapeHtmlPro(pm.ctpResistente)}</p>` : ''}
  </div>` : ''}

  <div class="cover-dates">
    ${pm.dataIncarico ? `<p>Data incarico: ${escapeHtmlPro(pm.dataIncarico)}</p>` : ''}
    ${pm.dataOperazioni ? `<p>Inizio operazioni: ${escapeHtmlPro(pm.dataOperazioni)}</p>` : ''}
    ${pm.dataDeposito ? `<p>Termine deposito: ${escapeHtmlPro(pm.dataDeposito)}</p>` : ''}
    ${pm.fondoSpese ? `<p>Fondo spese: ${escapeHtmlPro(pm.fondoSpese)}</p>` : ''}
  </div>

  <div class="cover-casecode">${escapeHtmlPro(caseCode)}</div>
</div>

<!-- ═══════════════════════════════════════════════
     TABLE OF CONTENTS (Indice)
     ═══════════════════════════════════════════════ -->
<div class="toc">
  <div class="toc-heading">Indice</div>
  <div class="toc-rule"></div>
  <div class="toc-entries">
    ${tocHtml}
  </div>
</div>

<!-- ═══════════════════════════════════════════════
     REPORT SECTIONS
     ═══════════════════════════════════════════════ -->
${sectionsHtml}

<!-- ═══ Screen footer ═══ -->
<footer class="screen-footer">
  Report generato da MedLav il ${now}
</footer>

<!-- ═══ Running footer (screen) ═══ -->
<div class="running-footer">
  <span>${escapeHtmlPro(nrgInfo)}</span>
  <span>${now}</span>
</div>
</div>
</body>
</html>`;
}
