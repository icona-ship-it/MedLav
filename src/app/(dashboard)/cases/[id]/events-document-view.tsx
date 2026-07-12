'use client';

import { formatDate } from '@/lib/format';
import { sortEventsChrono } from '@/lib/event-order';
import type { EventRow } from './types';

/**
 * A4 document view that exactly matches the perito's real perizia format.
 * Clean, professional, no UI chrome — just the document content.
 *
 * Gold standard (from Dott. Lavini):
 *   RX polso destro per trauma da caduta 22/10/2025
 *   L'indagine odierna, condotta per trauma da caduta, fa rilevare...
 *
 *   Visita specialistica ortopedica 22/10/2025
 *   Paziente di 80 anni in buona salute riferisce caduta accidentale...
 */
export function EventsDocumentView({
  events,
}: {
  events: EventRow[];
  patientInitials?: string | null;
  caseCode?: string;
}) {
  const clinicalEvents = sortEventsChrono(
    events.filter((e) => e.event_type !== 'documento_amministrativo' && e.event_type !== 'spesa_medica'),
  );

  return (
    <div className="mx-auto max-w-[794px] bg-white dark:bg-zinc-950 shadow-lg rounded border print:shadow-none print:border-none">
      <div className="px-[72px] py-[56px]" style={{ fontFamily: "'Times New Roman', Georgia, serif" }}>

        <h2 className="text-center text-[15px] font-bold tracking-widest uppercase mb-10">
          Documentazione Medica
        </h2>

        <div className="space-y-6 text-[13px] leading-[1.75]">
          {clinicalEvents.map((event) => {
            const date = formatDate(event.event_date);
            const facility = event.facility ?? '';
            const doctor = event.doctor ?? '';

            // Build header exactly like the perito:
            // "RX polso destro per trauma da caduta 22/10/2025"
            // "Cartella Pronto soccorso del 23/10/2025 n. 2025068117 AZIENDA OSPEDALIERA"
            let header = event.title;
            if (facility) header += ` ${facility}`;
            header += ` ${date}`;

            return (
              <div key={event.id}>
                <p className="font-bold text-[13px]">{header}</p>
                <p className="whitespace-pre-wrap">{event.description}</p>
                {event.diagnosis && (
                  <p className="mt-0.5"><span className="font-semibold">Diagnosi:</span> {event.diagnosis}</p>
                )}
                {doctor && <p className="text-[12px] text-gray-500 dark:text-gray-400">{/^(dr|dott|prof)/i.test(doctor.trim()) ? doctor : `Dr. ${doctor}`}</p>}
              </div>
            );
          })}

          {clinicalEvents.length === 0 && (
            <p className="text-center text-gray-400 py-12">Nessun evento clinico estratto.</p>
          )}
        </div>
      </div>
    </div>
  );
}
