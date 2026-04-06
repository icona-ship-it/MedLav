import { formatDate } from '@/lib/format';
import { sourceLabelsExport as sourceLabels } from '@/lib/constants';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TimelineHtmlEvent {
  order_number: number;
  event_date: string;
  event_type: string;
  title: string;
  description: string;
  source_type: string;
  doctor: string | null;
  facility: string | null;
}

interface TimelineHtmlParams {
  caseCode: string;
  patientInitials: string | null;
  events: TimelineHtmlEvent[];
  moduleName?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const EVENT_TYPE_LABELS: Record<string, string> = {
  visita: 'Visita',
  esame: 'Esame',
  intervento: 'Intervento',
  diagnosi: 'Diagnosi',
  terapia: 'Terapia',
  ricovero: 'Ricovero',
  dimissione: 'Dimissione',
  prognosi: 'Prognosi',
  certificato: 'Certificato',
  altro: 'Altro',
};

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function eventTypeLabel(raw: string): string {
  return EVENT_TYPE_LABELS[raw] ?? raw;
}

function sourceLabel(raw: string): string {
  return sourceLabels[raw] ?? raw;
}

// ---------------------------------------------------------------------------
// Main export function
// ---------------------------------------------------------------------------

/**
 * Generate a self-contained "Cronistoria Documentale" HTML page
 * for extraction_only / expenses_only pipeline cases.
 */
export function generateTimelineHtml(params: TimelineHtmlParams): string {
  const { caseCode, patientInitials, events, moduleName } = params;

  const now = new Date().toLocaleDateString('it-IT', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const metaLines: string[] = [
    `<strong>Caso:</strong> ${escapeHtml(caseCode)}`,
  ];
  if (patientInitials) {
    metaLines.push(`<strong>Paziente:</strong> ${escapeHtml(patientInitials)}`);
  }
  if (moduleName) {
    metaLines.push(`<strong>Modulo:</strong> ${escapeHtml(moduleName)}`);
  }
  metaLines.push(`<strong>Data generazione:</strong> ${now}`);
  metaLines.push(`<strong>Numero eventi:</strong> ${events.length}`);

  const eventsHtml = events.length === 0
    ? '<tr><td colspan="6" style="text-align:center;padding:20px;font-style:italic;color:#64748b">Nessun evento estratto.</td></tr>'
    : events.map((ev, idx) => {
      const bgColor = idx % 2 === 0 ? '#f8fafc' : '#ffffff';
      const meta: string[] = [];
      if (ev.doctor) meta.push(`Dr. ${escapeHtml(ev.doctor)}`);
      if (ev.facility) meta.push(escapeHtml(ev.facility));
      const metaStr = meta.length > 0
        ? `<div style="font-size:12px;color:#64748b;margin-top:4px;font-style:italic">${meta.join(' &mdash; ')}</div>`
        : '';
      return `<tr style="background:${bgColor}">
      <td style="text-align:center;font-family:monospace;color:#64748b">${ev.order_number}</td>
      <td style="text-align:center;font-weight:600;white-space:nowrap">${escapeHtml(formatDate(ev.event_date))}</td>
      <td style="text-align:center"><span class="event-type-badge">${escapeHtml(eventTypeLabel(ev.event_type))}</span></td>
      <td>
        <div style="font-weight:600;margin-bottom:2px">${escapeHtml(ev.title)}</div>
        ${ev.description ? `<div style="font-size:13px;color:#374151;white-space:pre-wrap">${escapeHtml(ev.description)}</div>` : ''}
        ${metaStr}
      </td>
      <td><span class="source-badge">${escapeHtml(sourceLabel(ev.source_type))}</span></td>
    </tr>`;
    }).join('\n');

  return `<!DOCTYPE html>
<html lang="it">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Cronistoria Documentale - ${escapeHtml(caseCode)}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
    line-height: 1.6;
    color: #333;
    max-width: 960px;
    margin: 0 auto;
    padding: 20px;
  }
  h1 {
    font-size: 24px;
    color: #1e40af;
    border-bottom: 3px solid #2563eb;
    padding-bottom: 8px;
    margin-bottom: 20px;
    text-align: center;
  }
  .header-info {
    background: #f8fafc;
    padding: 15px;
    border-radius: 8px;
    margin-bottom: 20px;
    text-align: center;
  }
  .header-info p {
    margin: 3px 0;
    font-size: 14px;
  }
  .watermark-wrapper { position: relative; }
  .watermark-wrapper::after {
    content: 'RISERVATO';
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
  .timeline-table {
    width: 100%;
    border-collapse: collapse;
    margin-top: 10px;
    font-size: 14px;
  }
  .timeline-table th {
    background: #1e40af;
    color: #ffffff;
    font-weight: 600;
    font-size: 13px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    padding: 10px 12px;
    text-align: left;
    border: 1px solid #1e40af;
  }
  .timeline-table td {
    padding: 10px 12px;
    border: 1px solid #e2e8f0;
    vertical-align: top;
  }
  .timeline-table tr:hover td {
    background: #eff6ff !important;
  }
  .event-type-badge {
    display: inline-block;
    background: #e2e8f0;
    padding: 2px 8px;
    border-radius: 4px;
    font-size: 12px;
    font-weight: 500;
  }
  .source-badge {
    display: inline-block;
    background: #dbeafe;
    color: #1e40af;
    padding: 2px 8px;
    border-radius: 4px;
    font-size: 12px;
  }
  .footer {
    margin-top: 30px;
    padding-top: 15px;
    border-top: 1px solid #e2e8f0;
    text-align: center;
    font-size: 12px;
    color: #94a3b8;
  }
  @media print {
    @page { margin: 1.5cm; }
    body { padding: 0; font-size: 10pt; max-width: 100%; color: #000; }
    h1 { font-size: 16pt; page-break-after: avoid; }
    .header-info { page-break-inside: avoid; background: none !important; border: 1px solid #ccc; }
    .watermark-wrapper::after {
      position: fixed;
      color: rgba(180, 180, 180, 0.20);
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .timeline-table th {
      background: #1e40af !important;
      color: #fff !important;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .timeline-table tr { page-break-inside: avoid; }
    .timeline-table tr:hover td { background: inherit !important; }
    .event-type-badge, .source-badge {
      background: none !important;
      border: 1px solid #999;
      color: #000 !important;
    }
  }
</style>
</head>
<body>
<div class="watermark-wrapper">
<h1>Cronistoria Documentale</h1>

<div class="header-info">
  ${metaLines.map((l) => `<p>${l}</p>`).join('\n  ')}
</div>

<table class="timeline-table">
  <thead>
    <tr>
      <th style="width:50px;text-align:center">N.</th>
      <th style="width:110px;text-align:center">Data</th>
      <th style="width:100px;text-align:center">Tipo</th>
      <th>Titolo / Descrizione</th>
      <th style="width:160px">Fonte</th>
    </tr>
  </thead>
  <tbody>
    ${eventsHtml}
  </tbody>
</table>

<div class="footer">
  Generato con LegMed &mdash; ${escapeHtml(caseCode)} &mdash; ${now}
</div>
</div>
</body>
</html>`;
}
