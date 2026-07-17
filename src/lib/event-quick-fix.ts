/**
 * Quick-fix inline per gli eventi "da verificare" (founder 2026-07-17):
 * quando la segnalazione riguarda UN singolo dato mancante (struttura, medico,
 * data), il riquadro "Perché è da verificare" mostra direttamente il campo da
 * compilare — niente giro dalla matita per un dato solo.
 *
 * Logica pura, separata dalla card per essere testabile.
 */

export interface EventQuickFixInput {
  facility: string | null;
  doctor: string | null;
  event_date: string | null;
  reliability_notes: string | null;
}

export interface QuickFix {
  field: 'facility' | 'doctor' | 'eventDate';
  label: string;
  placeholder: string;
  inputType: 'text' | 'date';
}

/** Pattern delle note che indicano un campo RIMOSSO/mancante risolvibile inline.
 * Specifici (struttura/medico), per non catturare le note sulla citazione
 * ("Testo sorgente non riscontrato"). */
const FACILITY_NOTE_RE = /struttura[^.;|]*(?:non riscontrat|rimoss)/i;
const DOCTOR_NOTE_RE = /medico[^.;|]*(?:non riscontrat|rimoss)/i;

export function detectQuickFixes(event: EventQuickFixInput): QuickFix[] {
  const notes = event.reliability_notes ?? '';
  const fixes: QuickFix[] = [];
  if (!event.event_date) {
    fixes.push({ field: 'eventDate', label: 'Data', placeholder: '', inputType: 'date' });
  }
  if (!event.facility && FACILITY_NOTE_RE.test(notes)) {
    fixes.push({ field: 'facility', label: 'Struttura', placeholder: 'come indicata nel documento', inputType: 'text' });
  }
  if (!event.doctor && DOCTOR_NOTE_RE.test(notes)) {
    fixes.push({ field: 'doctor', label: 'Medico', placeholder: 'come indicato nel documento', inputType: 'text' });
  }
  return fixes;
}

/** Rimuove dalle note i segmenti risolti dal quick-fix (il dato ora c'è: la
 * nota "rimosso per verifica" diventerebbe falsa). Le note sono concatenate
 * con '; ' o ' | ' a seconda della fonte. */
export function stripResolvedNoteSegments(
  notes: string | null,
  resolvedFields: Array<QuickFix['field']>,
): string | null {
  if (!notes) return null;
  const res: RegExp[] = [];
  if (resolvedFields.includes('facility')) res.push(FACILITY_NOTE_RE);
  if (resolvedFields.includes('doctor')) res.push(DOCTOR_NOTE_RE);
  if (res.length === 0) return notes;
  const kept = notes
    .split(/\s*\|\s*|;\s+/)
    .filter((seg) => seg.trim().length > 0 && !res.some((re) => re.test(seg)));
  const joined = kept.join('; ').trim();
  return joined.length > 0 ? joined : null;
}
