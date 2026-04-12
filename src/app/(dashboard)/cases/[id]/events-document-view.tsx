'use client';

import { formatDate } from '@/lib/format';
import { sourceLabels } from '@/lib/constants';
import type { EventRow } from './types';

const EVENT_TYPE_LABELS: Record<string, string> = {
  visita: 'Visita medica',
  esame: 'Esame diagnostico',
  diagnosi: 'Diagnosi',
  intervento: 'Intervento chirurgico',
  terapia: 'Terapia',
  ricovero: 'Ricovero ospedaliero',
  'follow-up': 'Controllo di follow-up',
  referto: 'Referto',
  prescrizione: 'Prescrizione',
  consenso: 'Consenso informato',
  complicanza: 'Complicanza',
  spesa_medica: 'Spesa medica',
  documento_amministrativo: 'Documento amministrativo',
  certificato: 'Certificato',
  altro: 'Documento',
};

/**
 * A4 document-style view of clinical events.
 * Renders events in the format used in real medical-legal reports:
 * Bold header (type + facility + date) followed by full description.
 */
export function EventsDocumentView({
  events,
  patientInitials,
  caseCode,
}: {
  events: EventRow[];
  patientInitials?: string | null;
  caseCode?: string;
}) {
  // Filter out deleted and non-clinical noise
  const clinicalEvents = events.filter(
    (e) => e.event_type !== 'documento_amministrativo' && e.event_type !== 'spesa_medica',
  );

  const now = new Date().toLocaleDateString('it-IT', { year: 'numeric', month: 'long', day: 'numeric' });

  return (
    <div className="mx-auto max-w-[210mm] bg-white dark:bg-zinc-950 shadow-lg rounded-lg border">
      {/* A4 page with print-friendly margins */}
      <div className="px-16 py-12 font-serif text-[15px] leading-relaxed text-foreground">
        {/* Header */}
        <div className="text-center mb-8 border-b-2 border-primary pb-4">
          <h1 className="text-xl font-bold tracking-wide">DOCUMENTAZIONE MEDICA</h1>
          {patientInitials && (
            <p className="text-sm text-muted-foreground mt-1">
              Paziente: {patientInitials}{caseCode ? ` — ${caseCode}` : ''}
            </p>
          )}
          <p className="text-xs text-muted-foreground mt-1">
            {clinicalEvents.length} documenti in ordine cronologico
          </p>
        </div>

        {/* Events in perizia format */}
        <div className="space-y-6">
          {clinicalEvents.map((event) => {
            const typeLabel = EVENT_TYPE_LABELS[event.event_type] ?? event.event_type;
            const source = sourceLabels[event.source_type] ?? '';
            const dateStr = formatDate(event.event_date);
            const facility = event.facility ?? '';
            const doctor = event.doctor ? `Dr. ${event.doctor}` : '';

            // Build header: "Type, Facility/Doctor, Date"
            const headerParts = [typeLabel];
            if (facility) headerParts.push(facility);
            if (doctor && !facility) headerParts.push(doctor);
            const header = `${headerParts.join(', ')} del ${dateStr}`;

            return (
              <div key={event.id} className="group">
                {/* Document header — bold, like in real perizia */}
                <p className="font-bold text-[15px] mb-1">
                  {header}
                  {source && (
                    <span className="font-normal text-muted-foreground text-xs ml-2">({source})</span>
                  )}
                </p>

                {/* Full description — verbatim reproduction */}
                <div className="pl-0 text-[14.5px] leading-relaxed whitespace-pre-wrap">
                  {event.description}
                </div>

                {/* Diagnosis if present */}
                {event.diagnosis && (
                  <p className="mt-1 text-[14px]">
                    <span className="font-semibold">Diagnosi:</span> {event.diagnosis}
                  </p>
                )}

                {/* Doctor if facility already shown */}
                {doctor && facility && (
                  <p className="mt-0.5 text-[13px] text-muted-foreground">{doctor}</p>
                )}

                {/* Expert notes */}
                {event.expert_notes && (
                  <div className="mt-2 rounded bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 px-3 py-2">
                    <p className="text-[13px] italic">
                      <span className="font-semibold not-italic">Nota del perito:</span> {event.expert_notes}
                    </p>
                  </div>
                )}

                {/* Verification warning */}
                {event.requires_verification && (
                  <p className="mt-1 text-[12px] text-yellow-700 dark:text-yellow-400 italic">
                    {(!event.event_date || event.date_precision === 'sconosciuta')
                      ? '⚠ Data da verificare sul documento originale'
                      : '⚠ Dati da verificare sul documento originale'}
                  </p>
                )}
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="mt-12 pt-4 border-t text-center">
          <p className="text-xs text-muted-foreground">
            Cronistoria generata da LegMed il {now} — {clinicalEvents.length} documenti analizzati
          </p>
        </div>
      </div>
    </div>
  );
}
