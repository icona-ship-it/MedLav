import { formatEventDateByPrecision } from '@/lib/format';
import { groupEventsByDocument, RETROSPECTIVE_SUBLIST_LABEL, SCHEDULED_SUBLIST_LABEL } from './event-grouping';
import { NON_CLINICAL_EVENT_TYPES } from '@/lib/constants';
import { sortEventsChrono } from '@/lib/event-order';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TimelineHtmlEvent {
  order_number: number;
  /** Per il raggruppamento "un documento = un blocco" (feedback beta 2026-07-20). */
  document_id?: string | null;
  event_date: string;
  /** Precisione della data (giorno|mese|anno|sconosciuta): una menzione
   * anno-only si stampa "2019", mai "01.01.2019" (giorno fabbricato). */
  date_precision?: string | null;
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
  /** Ambito temporale (migration 0034): corrente | retrospettivo | programmato. */
  temporal_scope?: string | null;
}

interface TimelineHtmlParams {
  caseCode: string;
  /** Non più renderizzato (benchmark gold passaniti 2026-06-10 + GDPR): il
   * meta-block di testa con la riga Paziente è stato eliminato. Mantenuto
   * nell'interfaccia per compatibilità con i call-site. */
  patientInitials: string | null;
  events: TimelineHtmlEvent[];
  /** Non più renderizzato (dicitura interna dell'app). */
  moduleName?: string;
  /** Tipi documento classificati per le intestazioni-blocco (mai nomi file). */
  documents?: Array<{ id: string; documentType?: string | null }>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ---------------------------------------------------------------------------
// Main export function
// ---------------------------------------------------------------------------

/**
 * Generate a self-contained "Cronistoria Documentale" HTML page
 * for extraction_only / expenses_only pipeline cases.
 */
export function generateTimelineHtml(params: TimelineHtmlParams): string {
  const { caseCode, events: allEvents } = params;

  // Fix audit 2026-05-11: spese senza data pagamento (eventDate='1900-01-01')
  // sopravvivono ora al consolidator, ma nella timeline cronologica non hanno
  // posto. Sono visibili nella tabella spese mediche dove l'importo e' il
  // dato vincolante.
  const SENTINEL_DATE = '1900-01-01';
  // Filter undated rows + eventi esclusi dal perito (is_relevant_for_chronology
  // === false; default incluso), poi ordina cronologicamente (difensivo).
  // Difesa in profondità (oltre al filtro nelle route): mai eventi non clinici
  // (spese/amministrativi) nella cronistoria — il perito li cancella sempre.
  // I senza-data restano SOLO nei sotto-elenchi (riferito/programmato): lì non
  // serve una posizione cronologica e un follow-up "visita ginecologica" senza
  // data è comunque un fatto del referto (collaudo foto vere 2026-09-04).
  const isSublistScope = (ev: TimelineHtmlEvent): boolean =>
    ev.temporal_scope === 'retrospettivo' || ev.temporal_scope === 'programmato';
  const events = sortEventsChrono(
    allEvents.filter((ev) =>
      (ev.event_date !== SENTINEL_DATE || isSublistScope(ev)) &&
      ev.is_relevant_for_chronology !== false &&
      !NON_CLINICAL_EVENT_TYPES.has(ev.event_type)),
  );

  const now = new Date().toLocaleDateString('it-IT', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  // Benchmark gold passaniti (2026-06-10): il perito elimina titolo grande e
  // meta-block (Caso/Paziente/Modulo/Data/Numero eventi — la riga Paziente era
  // anche un'esposizione GDPR inutile), il tipo evento e le etichette FONTE.
  // Il documento parte direttamente dagli eventi sotto il watermark RISERVATO;
  // la testata di ogni evento è "data — titolo", l'attribuzione resta
  // "Dr. — Struttura".
  // Un documento = UN blocco (feedback beta 2026-07-20): intestazione per
  // documento (tipo + struttura + data/intervallo) e gli eventi come sotto-voci.
  // Fuori da un blocco-documento (eventi manuali senza document_id) non c'è
  // sotto-elenco: l'ambito va detto inline, o un esame previsto passerebbe
  // per eseguito.
  const scopeInline = (ev: TimelineHtmlEvent): string =>
    !ev.document_id && ev.temporal_scope === 'retrospettivo' ? ' <span class="event-scope">(riferito in anamnesi)</span>'
      : !ev.document_id && ev.temporal_scope === 'programmato' ? ' <span class="event-scope">(programmato)</span>'
        : '';
  const renderEvent = (ev: TimelineHtmlEvent): string => {
      const meta: string[] = [];
      if (ev.doctor) meta.push(ev.doctor.startsWith('Dr') ? escapeHtml(ev.doctor) : `Dr. ${escapeHtml(ev.doctor)}`);
      if (ev.facility) meta.push(escapeHtml(ev.facility));
      const metaStr = meta.length > 0
        ? `<p class="event-meta">${meta.join(' &mdash; ')}</p>`
        : '';
      const diag = ev.diagnosis
        ? `<p class="event-diag"><strong>Diagnosi:</strong> ${escapeHtml(ev.diagnosis)}</p>`
        : '';
      const dateLabel = formatEventDateByPrecision(ev.event_date, ev.date_precision ?? undefined);
      const head = ev.title
        ? `${escapeHtml(dateLabel)} &mdash; ${escapeHtml(ev.title)}${scopeInline(ev)}`
        : `${escapeHtml(dateLabel)}${scopeInline(ev)}`;
      // Documento professionale: nessun flag interno di lavoro (DA VERIFICARE).
      return `<div class="event-block">
      <p class="event-head">${head}</p>
      ${ev.description ? `<p class="event-desc">${escapeHtml(ev.description)}</p>` : ''}
      ${diag}
      ${metaStr}
    </div>`;
  };

  // Sotto-elenco (feedback medici 2026-08-19 Mail 2): ciò che il documento
  // RIFERISCE del passato o PREVEDE non è un accadimento del documento — resta
  // nel blocco (mai perso), ma sotto un'intestazione propria e in forma
  // compatta, dopo le voci correnti.
  const renderSublist = (label: string, items: TimelineHtmlEvent[]): string => {
    if (items.length === 0) return '';
    return `<div class="sublist">
      <h3 class="sublist-head">${escapeHtml(label)}</h3>
      ${items.map(renderEvent).join('\n')}
    </div>`;
  };

  const eventsHtml = events.length === 0
    ? '<p style="text-align:center;padding:20px;font-style:italic;color:#64748b">Nessun evento estratto.</p>'
    : groupEventsByDocument(events, params.documents).map((group) => {
      if (!group.heading) return group.events.map(renderEvent).join('\n'); // eventi senza documento: lista piatta
      const body = [
        group.current.map(renderEvent).join('\n'),
        renderSublist(RETROSPECTIVE_SUBLIST_LABEL, group.retrospective),
        renderSublist(SCHEDULED_SUBLIST_LABEL, group.scheduled),
      ].filter(Boolean).join('\n');
      return `<section class="doc-group">
      <h2 class="doc-group-head">${escapeHtml(group.heading)}</h2>
      ${body}
    </section>`;
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
  .doc-group { margin: 18px 0; }
  .doc-group-head {
    font-size: 15px;
    border-bottom: 1px solid #cbd5e1;
    padding-bottom: 4px;
    margin-bottom: 8px;
  }
  .doc-group .event-block { margin-left: 14px; }
  .sublist { margin: 10px 0 0 14px; padding-left: 10px; border-left: 2px solid #e2e8f0; }
  .sublist-head { font-size: 12px; text-transform: uppercase; letter-spacing: 0.04em; color: #64748b; margin-bottom: 6px; }
  .sublist .event-block { margin-left: 0; margin-bottom: 10px; padding-bottom: 8px; }
  .sublist .event-head { font-size: 13px; color: #334155; }
  .sublist .event-desc { font-size: 13px; }
  .event-scope { font-weight: 400; color: #92400e; font-size: 12px; }
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
