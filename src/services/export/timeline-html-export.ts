import { formatDate } from '@/lib/format';
import { sourceLabelsExport as sourceLabels } from '@/lib/constants';
import { sortEventsChrono } from '@/lib/event-order';

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
  confidence?: number;
  requires_verification?: boolean;
  diagnosis?: string | null;
  /** Inclusione nella cronologia esportata. Assente o true = incluso. */
  is_relevant_for_chronology?: boolean;
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
  const { caseCode, patientInitials, events: allEvents, moduleName } = params;

  // Fix audit 2026-05-11: spese senza data pagamento (eventDate='1900-01-01')
  // sopravvivono ora al consolidator, ma nella timeline cronologica non hanno
  // posto. Sono visibili nella tabella spese mediche dove l'importo e' il
  // dato vincolante.
  const SENTINEL_DATE = '1900-01-01';
  // Filter undated rows + eventi esclusi dal perito (is_relevant_for_chronology
  // === false; default incluso), poi ordina cronologicamente (difensivo).
  const events = sortEventsChrono(
    allEvents.filter((ev) => ev.event_date !== SENTINEL_DATE && ev.is_relevant_for_chronology !== false),
  );

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
    ? '<p style="text-align:center;padding:20px;font-style:italic;color:#64748b">Nessun evento estratto.</p>'
    : events.map((ev) => {
      const meta: string[] = [];
      if (ev.doctor) meta.push(ev.doctor.startsWith('Dr') ? escapeHtml(ev.doctor) : `Dr. ${escapeHtml(ev.doctor)}`);
      if (ev.facility) meta.push(escapeHtml(ev.facility));
      if (ev.source_type) meta.push(escapeHtml(sourceLabel(ev.source_type)));
      const metaStr = meta.length > 0
        ? `<p class="event-meta">${meta.join(' &mdash; ')}</p>`
        : '';
      const diag = ev.diagnosis
        ? `<p class="event-diag"><strong>Diagnosi:</strong> ${escapeHtml(ev.diagnosis)}</p>`
        : '';
      // Documento professionale: nessun flag interno di lavoro (DA VERIFICARE).
      return `<div class="event-block">
      <p class="event-head">${escapeHtml(formatDate(ev.event_date))} &mdash; ${escapeHtml(eventTypeLabel(ev.event_type))}</p>
      ${ev.title ? `<p class="event-title">${escapeHtml(ev.title)}</p>` : ''}
      ${ev.description ? `<p class="event-desc">${escapeHtml(ev.description)}</p>` : ''}
      ${diag}
      ${metaStr}
    </div>`;
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
  .timeline { margin-top: 10px; }
  .event-block {
    margin-bottom: 18px;
    padding-bottom: 14px;
    border-bottom: 1px solid #eef2f7;
  }
  .event-block:last-child { border-bottom: none; }
  .event-head {
    font-weight: 700;
    color: #1b3a6b;
    font-size: 15px;
    margin-bottom: 2px;
  }
  .verify-flag { color: #dc2626; font-weight: 700; }
  .event-title { font-weight: 600; margin-bottom: 2px; }
  .event-desc { font-size: 14px; color: #374151; white-space: pre-wrap; margin-bottom: 2px; }
  .event-diag { font-size: 14px; margin-bottom: 2px; }
  .event-meta { font-size: 12px; color: #777; font-style: italic; margin-top: 2px; }
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
    body { padding: 0; font-size: 11pt; max-width: 100%; color: #000; }
    h1 { font-size: 16pt; page-break-after: avoid; }
    .header-info { page-break-inside: avoid; background: none !important; border: 1px solid #ccc; }
    .watermark-wrapper::after {
      position: fixed;
      color: rgba(180, 180, 180, 0.20);
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .event-block { page-break-inside: avoid; }
    .footer { page-break-before: avoid; }
  }
</style>
</head>
<body>
<div class="watermark-wrapper">
<h1>Cronistoria Documentale</h1>

<div class="header-info">
  ${metaLines.map((l) => `<p>${l}</p>`).join('\n  ')}
</div>

<div class="timeline">
  ${eventsHtml}
</div>

<div class="footer">
  Generato con LegMed &mdash; ${escapeHtml(caseCode)} &mdash; ${now}
</div>
</div>
</body>
</html>`;
}
