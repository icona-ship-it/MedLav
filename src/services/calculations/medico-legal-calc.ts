import { formatDate } from '@/lib/format';
import type { CaseType } from '@/types';
import { NON_CLINICAL_EVENT_TYPES } from '@/lib/constants';
import { normalizeItalianDateToIso } from '@/lib/validators/date-format';
import { estimateBiologicalDamage } from './damage-estimator';
import { numberToItalianWords } from '@/lib/number-to-words-it';

interface CalcEvent {
  event_date: string;
  event_type: string;
  title: string;
  description: string;
  /** Precisione della data (giorno|mese|anno|sconosciuta). Opzionale: assente = trattata
   * come 'giorno' (legacy). Usata per escludere dai FATTI deterministici le menzioni
   * anno-only (anamnesi remota → 01.01.YYYY fabbricato) che falserebbero ricovero/span. */
  date_precision?: string | null;
}

/** Sentinel date written by the extractor when no real date can be inferred. */
const SENTINEL_EVENT_DATE = '1900-01-01';

/** Well-formed ISO date YYYY-MM-DD. */
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Normalizza la DATA SINISTRO fornita dal perito (periziaMetadata.dataSinistro,
 * formato italiano o ISO) in ISO YYYY-MM-DD. null = assente o malformata: in
 * entrambi i casi il filtro preesistenze NON si applica (mai un crash o un
 * filtro sbagliato per un refuso di form).
 */
function normalizeIncidentIso(incidentDate?: string | null): string | null {
  if (!incidentDate || incidentDate.trim() === '') return null;
  return normalizeItalianDateToIso(incidentDate);
}

/** Data civile italiana di oggi (Europe/Rome). Un evento clinico datato nel
 * FUTURO è un appuntamento programmato (o una data mal letta), mai un
 * accadimento: non deve entrare nei computi (collaudo 2026-07-24: un
 * "controllo programmato" allungava il periodo di malattia fino
 * all'appuntamento mai avvenuto). */
function todayRomeIso(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome' }).format(new Date());
}

/**
 * Certificato MEDICO (prognosi, guarigione, postumi, inabilità): entra nei
 * computi — è come il perito chiude il periodo di malattia (decisione founder
 * 2026-07-24; nel confronto col caso beta: 74 giorni fino al certificato
 * definitivo, non 49 fino all'ultima terapia). I certificati AMMINISTRATIVI
 * (ticket, solleciti, attestazioni non cliniche) restano esclusi — la ratio
 * originale del filtro (regressione Passaniti: notifiche tardive che
 * distorcevano i periodi) vale ancora per loro.
 */
const CLINICAL_CERTIFICATE_RE = /prognosi|guarigion|postumi|inabilit|malattia|infortunio|lesion/i;

function isClinicalCertificate(e: CalcEvent): boolean {
  return e.event_type === 'certificato' && CLINICAL_CERTIFICATE_RE.test(`${e.title} ${e.description}`);
}

/**
 * Keep only clinical events with a real, well-formed date, in chronological
 * order. The whole module assumes chronological input (events[0] = first,
 * events[last] = last; the recovery endpoint is the last visita/follow-up after
 * the acute phase). The pipeline feeds
 * consolidated/sorted events, but the UI path (calculateITTITP) passes RAW DB
 * rows — without this, unsorted rows produced ITP periods running BACKWARD
 * (endDate < startDate) and totals anchored on the wrong events.
 *
 * `incidentIso` (data sinistro, ISO): quando presente, gli eventi ANTECEDENTI
 * sono esclusi dal computo — sono preesistenze (es. un'artroscopia citata in
 * anamnesi) che ancoravano il "periodo di malattia" mesi prima del sinistro
 * (CASO-2026-027: 116 giorni invece di 74). L'evento NEL giorno del sinistro
 * è incluso (>=).
 */
function clinicalSortedByDate(events: CalcEvent[], incidentIso?: string | null): CalcEvent[] {
  const today = todayRomeIso();
  return events
    .filter(
      (e) =>
        (!NON_CLINICAL_EVENT_TYPES.has(e.event_type) || isClinicalCertificate(e)) &&
        e.event_date !== SENTINEL_EVENT_DATE &&
        ISO_DATE_RE.test(e.event_date) &&
        // Solo date PRECISE (giorno): una menzione anamnestica anno-only, fabbricata
        // come YYYY-01-01, non deve ancorare ITT/ITP (produceva "ITP 75%: 2270 gg")
        // — audit 2026-08-11, F-P2. Stesso filtro del blocco FATTI (e7ec54d).
        (e.date_precision == null || e.date_precision === 'giorno') &&
        e.event_date <= today &&
        (!incidentIso || e.event_date >= incidentIso),
    )
    .slice()
    .sort((a, b) => a.event_date.localeCompare(b.event_date));
}

/** True for an event that marks the END of a hospital stay. Matches Italian
 * variants (dimissione/dimesso/fine ricovero) and English ("discharge"); the
 * old code matched only "dimission" → a discharge labeled "Relazione di fine
 * ricovero" was missed and the hospital stay vanished from ITT. */
function isDischargeEvent(e: CalcEvent): boolean {
  const text = `${e.title} ${e.description}`.toLowerCase();
  return (
    text.includes('dimiss') ||
    text.includes('dimess') ||
    text.includes('fine ricovero') ||
    text.includes('fine del ricovero') ||
    text.includes('discharge')
  );
}

/**
 * Pair each admission with at most ONE discharge (the earliest unused discharge
 * on or after it). Prevents the double-count bug: with 2 admissions and 1
 * discharge, the old `discharges.find()` returned the SAME discharge for both
 * admissions, summing overlapping periods and inflating ITT.
 *
 * Invariante (audit 2026-08-11, F-1): la dimissione SAME-DAY conta (`>=`, non
 * `>`). Un day-hospital/day-surgery (ricovero e dimissione lo stesso giorno) è un
 * ricovero di 1 giorno: non sparisce e — soprattutto — non fa "ponte" grabbing
 * la dimissione del ricovero SUCCESSIVO (era il bug "37 giorni" per un 1+10).
 * Con `>=` la dimissione same-day è agganciabile, quindi il ponte non si forma.
 * Ricoveri annidati o con dimissione mancante restano gestiti dalla fusione degli
 * intervalli a valle (mergedHospitalIntervals).
 */
function pairAdmissionsToDischarges(
  admissions: CalcEvent[],
  discharges: CalcEvent[],
): Array<{ admission: CalcEvent; discharge: CalcEvent }> {
  const sortedAdm = [...admissions].sort((a, b) => a.event_date.localeCompare(b.event_date));
  const sortedDis = discharges
    .map((d, i) => ({ d, i }))
    .sort((x, y) => x.d.event_date.localeCompare(y.d.event_date));
  const pairs: Array<{ admission: CalcEvent; discharge: CalcEvent }> = [];
  const used = new Set<number>();
  for (const admission of sortedAdm) {
    for (const { d, i } of sortedDis) {
      if (used.has(i)) continue;
      if (d.event_date < admission.event_date) continue; // dimissione prima del ricovero: non è sua
      used.add(i);
      pairs.push({ admission, discharge: d });
      break;
    }
  }
  return pairs;
}

/**
 * Intervalli di degenza FUSI. Accoppia ricoveri e dimissioni, poi fonde gli
 * intervalli identici o SOVRAPPOSTI (QA 2026-06-11 Tedesco: un PDF caricato due
 * volte contava lo stesso letto fino a 6 volte). Estratto in helper condiviso
 * (audit 2026-08-11, F-P2): prima solo `calculateHospitalDays` fondeva, mentre
 * `calculateGraduatedITTITP` sommava le coppie grezze → la stessa degenza da due
 * documenti raddoppiava l'ITT (20 gg invece di 10) senza flag.
 */
function mergedHospitalIntervals(
  admissions: CalcEvent[],
  discharges: CalcEvent[],
): Array<{ start: string; end: string }> {
  const rawIntervals = pairAdmissionsToDischarges(admissions, discharges)
    .map(({ admission, discharge }) => ({ start: admission.event_date, end: discharge.event_date }))
    .filter((iv) => iv.start <= iv.end)
    .sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0));

  const merged: Array<{ start: string; end: string }> = [];
  for (const iv of rawIntervals) {
    const last = merged[merged.length - 1];
    if (last && iv.start <= last.end) {
      if (iv.end > last.end) last.end = iv.end;
    } else {
      merged.push({ ...iv });
    }
  }
  return merged;
}

/** Add N days to an ISO date, UTC-safe (avoids local-timezone off-by-one from
 * mixing UTC parsing with local getDate/setDate). */
function addDaysIso(base: string, n: number): string {
  const ms = Date.parse(`${base}T00:00:00Z`);
  return new Date(ms + n * 86_400_000).toISOString().slice(0, 10);
}

export interface MedicoLegalCalculation {
  label: string;
  value: string;
  days: number | null;
  startDate: string | null;
  endDate: string | null;
  notes: string;
  tableReference?: string;
}

/**
 * A2 (Lavini): a single graduated temporary-disability segment.
 * ITT = 100%, ITP = 75% / 50% / 25%. These are PROPOSALS — the perito sets the
 * final values. `estimated` marks segments derived heuristically (recovery
 * period split into thirds when no explicit rehab phase is documented).
 */
export interface ITPSegment {
  label: string;
  percentage: 100 | 75 | 50 | 25;
  days: number;
  startDate: string | null;
  endDate: string | null;
  estimated: boolean;
}

/** Map an ITT/ITP calculation row to a typed segment, or null if it isn't one
 * (or is a "Non calcolabile" row with no days). */
function calculationRowToSegment(c: MedicoLegalCalculation): ITPSegment | null {
  if (c.days === null || c.days <= 0) return null;
  const label = c.label.toLowerCase();
  let percentage: ITPSegment['percentage'] | null = null;
  if (label.includes('itt') || label.includes('100')) percentage = 100;
  else if (label.includes('75')) percentage = 75;
  else if (label.includes('50')) percentage = 50;
  else if (label.includes('25')) percentage = 25;
  if (percentage === null) return null;

  const estimated = /\(stima\)/i.test(c.value) || /stima/i.test(c.notes);
  return {
    label: c.label,
    percentage,
    days: c.days,
    startDate: c.startDate,
    endDate: c.endDate,
    estimated,
  };
}

/** Extract the graduated ITT/ITP segments from a set of calculation rows. */
export function calculationsToITTITPSegments(
  calculations: MedicoLegalCalculation[],
): ITPSegment[] {
  return calculations
    .map(calculationRowToSegment)
    .filter((s): s is ITPSegment => s !== null);
}

/**
 * A2: compute the graduated ITT/ITP segments directly from timeline events.
 * Returns a typed, ordered array (ITT first, then ITP 75 → 50 → 25). Pure and
 * client-safe — also used by the UI summary table in events-tab.
 */
export function calculateITTITP(events: CalcEvent[], incidentDate?: string | null): ITPSegment[] {
  // Drop non-clinical/sentinel/malformed events AND sort chronologically. The UI
  // path (itt-itp-summary.tsx) passes RAW DB rows: undated events carry the
  // sentinel '1900-01-01' (→ multi-decade rows) and rows are not guaranteed
  // sorted (→ ITP periods running backward). clinicalSortedByDate fixes both.
  const clinical = clinicalSortedByDate(events, normalizeIncidentIso(incidentDate));
  if (clinical.length === 0) return [];
  return calculationsToITTITPSegments(calculateGraduatedITTITP(clinical));
}

/**
 * Render graduated ITT/ITP segments as a Markdown pipe table for the report.
 * The export pipeline (HTML/DOCX) renders Markdown tables natively. Returns ''
 * when there are no concrete segments.
 */
export function formatITTITPTable(segments: ITPSegment[]): string {
  if (segments.length === 0) return '';
  const rows = segments.map((s) => {
    // Escape pipes so a label can never break the Markdown table columns.
    const label = s.label.replace(/\|/g, '\\|');
    const dal = s.startDate ? formatDate(s.startDate) : '—';
    const al = s.endDate ? formatDate(s.endDate) : '—';
    const stima = s.estimated ? ' *(stima)*' : '';
    // Notazione formale cifra + lettere (benchmark: "giorni 90 (novanta)", "75% (settantacinque per cento)").
    const giorni = `${s.days} (${numberToItalianWords(s.days)})`;
    const invalidita = `${s.percentage}% (${numberToItalianWords(s.percentage)} per cento)`;
    return `| ${label} | ${dal} | ${al} | ${giorni} | ${invalidita}${stima} |`;
  });
  const totalDays = segments.reduce((sum, s) => sum + s.days, 0);
  return [
    '| Periodo | Dal | Al | Giorni | Invalidità |',
    '|---|---|---|---|---|',
    ...rows,
    `| **Totale giorni** | | | **${totalDays} (${numberToItalianWords(totalDays)})** | |`,
  ].join('\n');
}

/**
 * Calculate medico-legal periods from timeline events.
 * These are proposed values — the expert can modify them.
 */
export function calculateMedicoLegalPeriods(
  events: CalcEvent[],
  caseType?: CaseType,
  incidentDate?: string | null,
): MedicoLegalCalculation[] {
  if (events.length === 0) return [];

  // Filter out non-clinical events (ticket SSN, avvisi pagamento, certificati
  // amministrativi) AND sentinel/malformed dates, then sort chronologically.
  // Non-clinical events distort periods (Passaniti regression: SSN cost notices
  // dated weeks after the last clinical event); sentinel dates would anchor the
  // total-illness period in 1900; sorting guarantees first/last are correct.
  // `incidentDate` (data sinistro del form perizia): esclude le preesistenze.
  const incidentIso = normalizeIncidentIso(incidentDate);
  events = clinicalSortedByDate(events, incidentIso);
  if (events.length === 0) return [];

  const calculations: MedicoLegalCalculation[] = [];

  // 1. Hospital days (ricovero → dimissione)
  calculations.push(...calculateHospitalDays(events));

  // 2. Total illness period (first event → last event)
  calculations.push(calculateTotalIllnessPeriod(events));

  // 3. Time between surgeries
  calculations.push(...calculateInterSurgeryIntervals(events));

  // 4. Diagnosis → Treatment time
  calculations.push(...calculateDiagnosisToTreatment(events));

  // 5. ITT/ITP graduated estimate (75%, 50%, 25%)
  // QA 2026-06-11 (Tedesco): eventi duplicati produssero "ITT 2052 giorni" su
  // un intervallo osservato di ~400 — numeri assurdi consegnati in silenzio.
  // Sanity check: se la somma ITT+ITP supera l'intervallo osservato, ogni voce
  // viene marcata DA VERIFICARE (mai cap silenzioso: il perito deve vederlo).
  const graduated = calculateGraduatedITTITP(events);
  const observedDays = inclusiveDays(events[0].event_date, events[events.length - 1].event_date);
  const graduatedTotalDays = graduated.reduce((sum, c) => sum + (c.days ?? 0), 0);
  if (observedDays > 0 && graduatedTotalDays > observedDays * 1.1) {
    const flag = ` [DA VERIFICARE: la somma dei periodi stimati (${graduatedTotalDays} gg) supera l'intervallo documentato (${observedDays} gg) — possibili eventi duplicati o date errate nel fascicolo.]`;
    calculations.push(...graduated.map((c) => ({ ...c, notes: c.notes + flag })));
  } else {
    calculations.push(...graduated);
  }

  // 7. Biological damage estimate with table reference
  if (caseType) {
    // Data sinistro esplicita del perito quando c'è; altrimenti il primo evento
    // clinico come approssimazione (comportamento storico).
    const damageIncidentDate = incidentIso ?? extractEarliestEventDate(events);
    const damageEstimate = estimateBiologicalDamage(events, caseType, damageIncidentDate);
    if (damageEstimate.lookupResult && damageEstimate.estimatedRange) {
      const lr = damageEstimate.lookupResult;
      calculations.push({
        label: 'Stima danno biologico (indicativa)',
        value: lr.estimatedAmount
          ? `${damageEstimate.estimatedRange.min}-${damageEstimate.estimatedRange.max}% (€${lr.estimatedAmount.toLocaleString('it-IT')} al punto medio ${damageEstimate.midpointPercentage}%)`
          : `${damageEstimate.estimatedRange.min}-${damageEstimate.estimatedRange.max}%`,
        days: null,
        startDate: null,
        endDate: null,
        notes: `${damageEstimate.reasoning} Confidenza: ${lr.confidence}.`,
        tableReference: lr.tableUsed,
      });

      // 7a. Milano comparison for macropermanenti
      if (damageEstimate.milanoComparison && damageEstimate.milanoComparison.estimatedAmount > 0) {
        const mc = damageEstimate.milanoComparison;
        calculations.push({
          label: 'Confronto Tabelle Milano 2024 (indicativo)',
          value: `€${mc.estimatedAmount.toLocaleString('it-IT')} (${mc.percentage}%, eta ${mc.ageUsed}, demolt. ${mc.ageDemoltiplicator})`,
          days: null,
          startDate: null,
          endDate: null,
          notes: `${mc.notes} Valore per punto: €${mc.perPointValue.toLocaleString('it-IT')}.`,
          tableReference: mc.tableReference,
        });
      }

      // 7b. Balthazard note for concurrent injuries
      if (damageEstimate.balthazardNote) {
        calculations.push({
          label: 'Nota: formula di Balthazard',
          value: 'Valutare concorso di lesioni',
          days: null,
          startDate: null,
          endDate: null,
          notes: damageEstimate.balthazardNote,
          tableReference: 'Formula di Balthazard',
        });
      }

      // 7c. Table selection note
      if (damageEstimate.tableSelectionNote) {
        calculations.push({
          label: 'Nota: selezione tabella',
          value: damageIncidentDate
            ? `Data sinistro: ${damageIncidentDate}`
            : 'Data sinistro non disponibile',
          days: null,
          startDate: null,
          endDate: null,
          notes: damageEstimate.tableSelectionNote,
          tableReference: 'Criterio temporale DPR 12/2025',
        });
      }
    }
  }

  return calculations.filter((c) => c.days !== null || c.tableReference != null);
}

function calculateHospitalDays(events: CalcEvent[]): MedicoLegalCalculation[] {
  // Admissions exclude rows that are themselves discharges (a "Dimissione" row
  // sometimes carries eventType 'ricovero'). Each discharge is paired once.
  const admissions = events.filter((e) => e.event_type === 'ricovero' && !isDischargeEvent(e));
  const discharges = events.filter(isDischargeEvent);

  return mergedHospitalIntervals(admissions, discharges).map(({ start, end }) => {
    const days = inclusiveDays(start, end);
    return {
      label: 'Giorni di ricovero',
      value: `${days} giorni`,
      days,
      startDate: start,
      endDate: end,
      notes: `Dal ricovero del ${formatDate(start)} alla dimissione del ${formatDate(end)}`,
    };
  });
}

function calculateTotalIllnessPeriod(events: CalcEvent[]): MedicoLegalCalculation {
  const firstDate = events[0].event_date;
  const lastDate = events[events.length - 1].event_date;
  const days = inclusiveDays(firstDate, lastDate);

  return {
    label: 'Periodo totale malattia',
    value: `${days} giorni`,
    days,
    startDate: firstDate,
    endDate: lastDate,
    notes: `Dal primo evento (${formatDate(firstDate)}) all'ultimo evento documentato (${formatDate(lastDate)})`,
  };
}

/**
 * Blocco FATTI deterministici per l'Epicrisi RC stragiudiziale: giorni di RICOVERO e
 * DURATA COMPLESSIVA del periodo di malattia (primo → ultimo evento clinico documentato).
 * Sono FATTI aritmetici, non giudizi: l'app li ASSERISCE invece di lasciarli all'LLM, che
 * li rifiutava ("non desumibile") o li sbagliava ("448 gg ITT", lo span totale spacciato
 * per invalidità). Le fasce graduate 75/50/25 NON sono qui: restano scaffold del perito.
 *
 * Conteggio INCLUSIVO (come i benchmark depositati di Lavini: ricovero 14→22.11 = 9),
 * COERENTE con calculateHospitalDays/TotalIllnessPeriod (entrambe inclusive) e con la
 * sezione "PERIODI MEDICO-LEGALI CALCOLATI" + il contesto-prompt: un solo numero per lo
 * stesso fatto in tutto il documento.
 *
 * Usa SOLO eventi a data CERTA (precisione 'giorno', o assente=legacy): le menzioni
 * anno-only/mese-only (anamnesi remota tipo "colecistectomia nel 2002" → 01.01.2002) sono
 * escluse, così non gonfiano lo span né reintroducono il giorno fabbricato.
 * '' se nulla è calcolabile. Pure + client-safe (espanso a read-time dal marker ITT_RICOVERO_FACTS).
 */
export function formatRicoveroITTFactsBlock(events: CalcEvent[], incidentDate?: string | null): string {
  // Escludi le date imprecise (anno/mese/sconosciuta): un FATTO deterministico (giorni
  // esatti, date esatte) si fonda solo su date a precisione di giorno.
  const precise = events.filter((e) => e.date_precision == null || e.date_precision === 'giorno');
  // Data sinistro del perito: le preesistenze (eventi antecedenti) escono dal
  // computo — e la loro esclusione viene DICHIARATA in una riga di trasparenza.
  const incidentIso = normalizeIncidentIso(incidentDate);
  const clinical = clinicalSortedByDate(precise, incidentIso);
  const excludedCount = incidentIso ? clinicalSortedByDate(precise).length - clinical.length : 0;
  if (clinical.length === 0) return '';
  const lines: string[] = [];

  // (1) Giorni di ricovero (esclusivi, come l'intero modulo calc).
  for (const r of calculateHospitalDays(clinical)) {
    if (r.days === null || !r.startDate || !r.endDate) continue;
    lines.push(`- **Giorni di ricovero:** ${r.days} (${numberToItalianWords(r.days)}), dal ${formatDate(r.startDate)} al ${formatDate(r.endDate)}.`);
  }

  // (2) Durata complessiva del periodo di malattia (intervallo calendariale primo→ultimo
  // evento). Etichetta esplicita: NON è una valutazione di inabilità (riservata al perito).
  const span = calculateTotalIllnessPeriod(clinical);
  if (span.days !== null && span.days > 0 && span.startDate && span.endDate) {
    lines.push(`- **Durata complessiva del periodo di malattia:** ${span.days} (${numberToItalianWords(span.days)}) giorni, dal primo evento documentato (${formatDate(span.startDate)}) all'ultimo (${formatDate(span.endDate)}) — intervallo calendariale, non una valutazione di inabilità (riservata al perito).`);
  }

  // (3) Trasparenza: se la data sinistro ha escluso eventi, il perito deve saperlo
  // (le preesistenze restano in cronistoria/anamnesi, semplicemente non nei computi).
  if (excludedCount > 0 && incidentIso && lines.length > 0) {
    lines.push(`- Gli eventi antecedenti alla data del sinistro (${formatDate(incidentIso)}) sono esclusi dal computo in quanto preesistenze.`);
  }

  if (lines.length === 0) return '';
  return `**Dati medico-legali calcolati (deterministici):**\n${lines.join('\n')}`;
}

function calculateInterSurgeryIntervals(events: CalcEvent[]): MedicoLegalCalculation[] {
  const results: MedicoLegalCalculation[] = [];
  const surgeries = events.filter((e) => e.event_type === 'intervento');

  for (let i = 0; i < surgeries.length - 1; i++) {
    const days = daysDiff(surgeries[i].event_date, surgeries[i + 1].event_date);
    results.push({
      label: `Intervallo tra interventi (${i + 1}° → ${i + 2}°)`,
      value: `${days} giorni`,
      days,
      startDate: surgeries[i].event_date,
      endDate: surgeries[i + 1].event_date,
      notes: `Da "${surgeries[i].title}" a "${surgeries[i + 1].title}"`,
    });
  }

  return results;
}

function calculateDiagnosisToTreatment(events: CalcEvent[]): MedicoLegalCalculation[] {
  const results: MedicoLegalCalculation[] = [];
  const diagnoses = events.filter((e) => e.event_type === 'diagnosi');
  const treatments = events.filter((e) => ['intervento', 'terapia'].includes(e.event_type));

  for (const diagnosis of diagnoses) {
    const nextTreatment = treatments.find((t) => t.event_date >= diagnosis.event_date);

    if (nextTreatment) {
      const days = daysDiff(diagnosis.event_date, nextTreatment.event_date);
      if (days > 0) {
        results.push({
          label: 'Tempo diagnosi → trattamento',
          value: `${days} giorni`,
          days,
          startDate: diagnosis.event_date,
          endDate: nextTreatment.event_date,
          notes: `Da diagnosi "${diagnosis.title}" a "${nextTreatment.title}"`,
        });
      }
    }
  }

  return results;
}

/**
 * Calculate graduated ITT/ITP periods following Italian medico-legal convention:
 * - ITT (100%): hospitalization + immobilization periods
 * - ITP 75%: from end of immobilization to start of rehabilitation
 * - ITP 50%: rehabilitation period
 * - ITP 25%: from end of rehabilitation to clinical stabilization
 *
 * These are proposals — the expert determines final percentages.
 */
function calculateGraduatedITTITP(events: CalcEvent[]): MedicoLegalCalculation[] {
  const results: MedicoLegalCalculation[] = [];

  // Find key milestones. Events are pre-sorted chronologically by the caller.
  const admissions = events.filter((e) => e.event_type === 'ricovero' && !isDischargeEvent(e));
  const discharges = events.filter(isDischargeEvent);
  const rehabEvents = events.filter((e) => {
    const text = `${e.title} ${e.description}`.toLowerCase();
    return text.includes('riabilitaz') || text.includes('fisioterapi') || text.includes('fkt') ||
      text.includes('fisiokinesiterapi') || text.includes('rieducazione') ||
      // English / variant phrasings (mixed-language reports)
      text.includes('physiotherap') || text.includes('physical therapy') || text.includes('rehabilitat');
  });
  const immobilizationEvents = events.filter((e) => {
    const text = `${e.title} ${e.description}`.toLowerCase();
    return text.includes('tutore') || text.includes('gesso') || text.includes('immobilizzaz') ||
      text.includes('doccia gessata') || text.includes('stecca') || text.includes('palmarino') ||
      // English / variant phrasings
      text.includes('brace') || text.includes('plaster cast') || text.includes('splint');
  });

  // ITT (100%) — hospitalization + immobilization. Pair each discharge once to
  // avoid double-counting overlapping admissions.
  let ittDays = 0;
  let ittStart: string | null = null;
  let ittEnd: string | null = null;

  // Hospital days (INCLUSIVI: ogni degenza conta entrambi i giorni — convenzione
  // gold). Intervalli FUSI (F-P2): la stessa degenza da due documenti non raddoppia.
  for (const { start, end } of mergedHospitalIntervals(admissions, discharges)) {
    ittDays += inclusiveDays(start, end);
    if (!ittStart) ittStart = start;
    ittEnd = end;
  }

  // Add immobilization period if after hospital. NOTE: this is classified as
  // ITT 100% and bounded by the LAST immobilization mention — a late incidental
  // mention ("rimosso il tutore" at a follow-up) can extend the window. We make
  // that explicit in the note so the perito can verify/reclassify (it may be ITP).
  let immobNote = '';
  if (immobilizationEvents.length > 0) {
    const hadHospital = ittEnd !== null;
    const immobStart = ittEnd ?? immobilizationEvents[0].event_date;
    const immobEnd = immobilizationEvents[immobilizationEvents.length - 1].event_date;
    if (immobEnd > immobStart) {
      // Dopo un ricovero: i giorni di immobilizzazione sono quelli SUCCESSIVI alla
      // dimissione (scarto — il giorno di dimissione è già nei giorni di degenza). Senza
      // ricovero precedente: l'immobilizzazione è il periodo-ancora → conteggio inclusivo.
      const immobDays = hadHospital ? daysDiff(immobStart, immobEnd) : inclusiveDays(immobStart, immobEnd);
      ittDays += immobDays;
      if (!ittStart) ittStart = immobStart;
      ittEnd = immobEnd;
      immobNote = ` Include un periodo di immobilizzazione documentata dal ${formatDate(immobStart)} al ${formatDate(immobEnd)} (${immobDays} gg): verificare se classificabile come ITT o ITP e se la data di rimozione è corretta.`;
    }
  }

  // If no hospital/immobilization, use first event as trauma date
  if (!ittStart && events.length > 0) {
    ittStart = events[0].event_date;
  }

  results.push({
    label: 'Invalidità Temporanea Totale (ITT) al 100%',
    value: ittDays > 0 ? `${ittDays} giorni` : 'Non calcolabile',
    days: ittDays || null,
    startDate: ittStart,
    endDate: ittEnd,
    notes: `Stima basata su ricovero + immobilizzazione documentata. Il perito verifica e corregge.${immobNote}`,
  });

  // ITP graduated periods. The recovery endpoint must be a follow-up/visita that
  // occurs AFTER the ITT end — otherwise the recovery window would run backward
  // (a pre-ricovero visit must not close the recovery period).
  const ittEndDate = ittEnd ?? ittStart;
  const recoveryCandidates = ittEndDate
    ? events.filter(
        (e) => (e.event_type === 'follow-up' || e.event_type === 'visita') && e.event_date > ittEndDate,
      )
    : [];
  const recoveryEnd = recoveryCandidates.length > 0 ? recoveryCandidates[recoveryCandidates.length - 1] : null;
  if (!ittEndDate || !recoveryEnd) {
    results.push({
      label: 'Invalidità Temporanea Parziale (ITP) graduata',
      value: 'Non calcolabile',
      days: null,
      startDate: null,
      endDate: null,
      notes: 'Dati insufficienti per stimare i periodi ITP (nessuna visita di controllo successiva alla fase acuta). Il perito definisce manualmente.',
    });
    return results;
  }

  const totalRecoveryDays = daysDiff(ittEndDate, recoveryEnd.event_date);
  if (totalRecoveryDays <= 0) return results;

  // Detect rehabilitation start/end to split the recovery period
  const rehabStart = rehabEvents.length > 0 ? rehabEvents[0].event_date : null;
  const rehabEnd = rehabEvents.length > 0 ? rehabEvents[rehabEvents.length - 1].event_date : null;

  if (rehabStart && rehabEnd && rehabStart > ittEndDate) {
    // We have clear phases: post-immob → rehab → stabilization
    const itp75Days = daysDiff(ittEndDate, rehabStart);
    const itp50Days = daysDiff(rehabStart, rehabEnd);
    const itp25Days = daysDiff(rehabEnd, recoveryEnd.event_date);

    if (itp75Days > 0) {
      results.push({
        label: 'ITP al 75%',
        value: `${itp75Days} giorni`,
        days: itp75Days,
        startDate: ittEndDate,
        endDate: rehabStart,
        notes: 'Dalla fine immobilizzazione all\'inizio riabilitazione.',
      });
    }
    if (itp50Days > 0) {
      results.push({
        label: 'ITP al 50%',
        value: `${itp50Days} giorni`,
        days: itp50Days,
        startDate: rehabStart,
        endDate: rehabEnd,
        notes: 'Periodo riabilitativo.',
      });
    }
    if (itp25Days > 0) {
      results.push({
        label: 'ITP al 25%',
        value: `${itp25Days} giorni`,
        days: itp25Days,
        startDate: rehabEnd,
        endDate: recoveryEnd.event_date,
        notes: 'Dalla fine riabilitazione alla stabilizzazione clinica.',
      });
    }
  } else {
    // No clear rehab phase — divide recovery into thirds as estimate.
    // Invariant: third + third + (total - 2*third) == total (holds for any rounding).
    const third = Math.round(totalRecoveryDays / 3);
    const phase1Days = third;
    const phase2Days = third;
    const phase3Days = totalRecoveryDays - third * 2;
    const phase1End = addDaysIso(ittEndDate, third);
    const phase2End = addDaysIso(ittEndDate, third * 2);

    // Guard each push on > 0 so tiny recovery windows don't emit "0 giorni" rows.
    if (phase1Days > 0) {
      results.push({
        label: 'ITP al 75%',
        value: `${phase1Days} giorni (stima)`,
        days: phase1Days,
        startDate: ittEndDate,
        endDate: phase1End,
        notes: 'Stima: primo terzo del periodo di recupero. Il perito deve verificare.',
      });
    }
    if (phase2Days > 0) {
      results.push({
        label: 'ITP al 50%',
        value: `${phase2Days} giorni (stima)`,
        days: phase2Days,
        startDate: phase1End,
        endDate: phase2End,
        notes: 'Stima: secondo terzo del periodo di recupero. Il perito deve verificare.',
      });
    }
    if (phase3Days > 0) {
      results.push({
        label: 'ITP al 25%',
        value: `${phase3Days} giorni (stima)`,
        days: phase3Days,
        startDate: phase2End,
        endDate: recoveryEnd.event_date,
        notes: 'Stima: ultimo terzo del periodo di recupero. Il perito deve verificare.',
      });
    }
  }

  return results;
}

/**
 * Extract the earliest event date from events as an approximation
 * of the incident date for table selection purposes.
 * Returns undefined if no valid dates are found.
 */
function extractEarliestEventDate(events: CalcEvent[]): string | undefined {
  if (events.length === 0) return undefined;

  const validDates = events
    .map((e) => e.event_date)
    .filter((d) => d && !isNaN(new Date(d).getTime()))
    .sort();

  return validDates.length > 0 ? validDates[0] : undefined;
}

function daysDiff(dateA: string, dateB: string): number {
  const a = new Date(dateA);
  const b = new Date(dateB);
  return Math.round(Math.abs(b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
}

/**
 * Durata INCLUSIVA di un periodo: conta sia il primo sia l'ultimo giorno — convenzione
 * medico-legale dei "giorni di degenza"/ITT usata nei benchmark depositati di Lavini
 * (ricovero 14→22.11 = 9 giorni, non 8). `daysDiff` conta gli SCARTI fra date (le notti);
 * resta per gli INTERVALLI fra eventi distinti (interventi, diagnosi→trattamento, recovery
 * gap post-ITT), dove non si ri-conta il giorno-confine già attribuito alla fase precedente.
 */
function inclusiveDays(start: string, end: string): number {
  return daysDiff(start, end) + 1;
}

