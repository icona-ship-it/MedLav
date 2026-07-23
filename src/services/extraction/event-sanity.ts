/**
 * Sanity deterministica sugli eventi estratti (feedback beta 2026-07-20,
 * CASO-2026-028): un referto manoscritto con data mal letta (08.07 → 08.01)
 * aveva prodotto una "guarigione clinica" datata 4 mesi PRIMA del trauma e un
 * controllo futuro mai avvenuto in cronologia — con "Anomalie: 0".
 *
 * Stessa filosofia del low-quality-page-guard: MAI perdere un fatto (l'evento
 * resta), ma confidenza cappata + requiresVerification + nota chiara, così il
 * perito lo vede nella coda "Da controllare". Niente nuovi tipi-anomalia
 * (l'enum è ritirato per direttiva Lavini sulle anomalie temporali): queste
 * sono DATE IMPOSSIBILI o contenuti non-accadimento, segnalati sull'evento.
 *
 * Funzioni pure, immutabili e idempotenti (note mai duplicate).
 */

/** Cap per un evento con data FUTURA rispetto all'elaborazione. */
export const FUTURE_DATE_CONFIDENCE_CAP = 40;
/** Cap per eventi provenienti da pagine manoscritte. */
export const HANDWRITTEN_PAGE_CONFIDENCE_CAP = 55;

const FUTURE_DATE_NOTE =
  '[AUTO] Data futura rispetto all\'elaborazione: probabile appuntamento programmato o data mal letta — verificare sul documento originale';
const HEALING_BEFORE_INCIDENT_NOTE =
  '[AUTO] Guarigione/esiti con data PRIMA del sinistro: possibile preesistenza documentata (stato anteriore) OPPURE data mal letta — verificare a quale patologia si riferisce';
const PLANNED_APPOINTMENT_NOTE =
  '[AUTO] Possibile appuntamento/controllo PROGRAMMATO, non un accadimento — verificare se effettivamente eseguito';
const HANDWRITTEN_NOTE =
  '[AUTO] Pagina manoscritta: testo a rischio di lettura errata — verificare sul documento originale';

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Contenuti che descrivono ESITI/GUARIGIONE (impossibili prima del sinistro). */
const HEALING_RE = /guarigion|esiti consolidat|clinicamente guarit|in esiti di|rimozione .{0,12}gesso|postumi stabilizzat/i;

/** Testo che descrive un appuntamento PROGRAMMATO (non eseguito). */
const PLANNED_RE = /\bprogrammat[oa]\b|\bda eseguire\b|\bfissat[oa] per\b|\bappuntamento previsto\b/i;
/** Marcatori di ESECUZIONE: se presenti, l'atto è avvenuto (niente flag). */
const EXECUTED_RE = /\beseguit|\beffettuat|\bvisionat|\brimosso\b|\briscontrat|\brefertat/i;

interface SanityEvent {
  eventDate: string;
  title: string;
  description: string;
  confidence: number;
  requiresVerification: boolean;
  reliabilityNotes?: string | null;
  sourcePages?: number[];
}

function appendNote(existing: string | null | undefined, note: string): string {
  const cur = existing ?? '';
  if (cur.includes(note)) return cur;
  return cur.length > 0 ? `${cur} | ${note}` : note;
}

function flag<T extends SanityEvent>(event: T, note: string, cap: number): T {
  return {
    ...event,
    confidence: Math.min(event.confidence, cap),
    requiresVerification: true,
    reliabilityNotes: appendNote(event.reliabilityNotes, note),
  };
}

export interface TemporalSanityOptions {
  /** Data di elaborazione (ISO YYYY-MM-DD): eventi oltre questa data sono futuri. */
  todayIso: string;
  /** Data sinistro (ISO) quando nota: contenuti di guarigione antecedenti = data impossibile. */
  incidentIso?: string | null;
}

export interface SanityFlagResult<T> {
  events: T[];
  flaggedCount: number;
}

/**
 * Flagga (mai rimuove) gli eventi con date impossibili o contenuti-appuntamento:
 * - data FUTURA rispetto all'elaborazione → cap 40 + nota (il "controllo del
 *   10.07 mai avvenuto" del caso beta);
 * - contenuto di guarigione/esiti datato PRIMA del sinistro → nota neutra di
 *   verifica SENZA cap (può essere il manoscritto 08.07 letto 08.01, ma anche
 *   una preesistenza legittima documentata per lo stato anteriore);
 * - testo "programmato/da eseguire" senza marcatori di esecuzione → nota
 *   di verifica (senza cap: la data può essere legittima).
 */
export function applyTemporalSanityFlags<T extends SanityEvent>(
  events: T[],
  opts: TemporalSanityOptions,
): SanityFlagResult<T> {
  const { todayIso, incidentIso } = opts;
  let flaggedCount = 0;

  const result = events.map((event) => {
    const d = event.eventDate;
    const validDate = !!d && ISO_DATE_RE.test(d) && d !== '1900-01-01';
    const text = `${event.title} ${event.description}`;

    if (validDate && d > todayIso) {
      flaggedCount++;
      return flag(event, FUTURE_DATE_NOTE, FUTURE_DATE_CONFIDENCE_CAP);
    }
    if (validDate && incidentIso && d < incidentIso && HEALING_RE.test(text)) {
      flaggedCount++;
      // Niente cap: può essere una preesistenza vera (es. certificato di
      // guarigione di un infortunio precedente, prodotto per lo stato
      // anteriore). Il perito decide; se la pagina è manoscritta il cap
      // arriva comunque dal guard manoscritti.
      return {
        ...event,
        requiresVerification: true,
        reliabilityNotes: appendNote(event.reliabilityNotes, HEALING_BEFORE_INCIDENT_NOTE),
      };
    }
    // Solo titolo o INCIPIT della descrizione (audit 2026-07-23): una dimissione
    // reale che cita in coda il follow-up "programmato a 30 giorni" non è un
    // appuntamento — il segnale vale quando "programmato" È il soggetto
    // dell'evento, non una prescrizione citata di passaggio.
    const plannedSignal = PLANNED_RE.test(event.title) || PLANNED_RE.test(event.description.slice(0, 80));
    if (plannedSignal && !EXECUTED_RE.test(text)) {
      flaggedCount++;
      // Nessun cap: la data dell'appuntamento può essere corretta — è il suo
      // essere "accadimento" a dover essere verificato dal perito.
      return {
        ...event,
        requiresVerification: true,
        reliabilityNotes: appendNote(event.reliabilityNotes, PLANNED_APPOINTMENT_NOTE),
      };
    }
    return event;
  });

  return { events: result, flaggedCount };
}

interface PageHandwritingRow {
  page_number: number;
  has_handwriting?: string | null;
}

/** Pagine (numeri assoluti nel documento) marcate come manoscritte dall'OCR. */
export function buildHandwrittenPageSet(pages: PageHandwritingRow[]): Set<number> {
  const set = new Set<number>();
  for (const page of pages) {
    if (page.has_handwriting === 'yes' || page.has_handwriting === 'partial') {
      set.add(page.page_number);
    }
  }
  return set;
}

/**
 * Cappa la confidenza degli eventi con almeno una sourcePage manoscritta
 * (Docsy flagga "testo MANOSCRITTO con necessità di controllo manuale"; noi
 * assegnavamo piena confidenza proprio al documento più ostico del fascicolo).
 */
export function capEventsFromHandwrittenPages<T extends SanityEvent>(
  events: T[],
  handwrittenPages: ReadonlySet<number>,
): SanityFlagResult<T> {
  if (handwrittenPages.size === 0) return { events, flaggedCount: 0 };

  let flaggedCount = 0;
  const result = events.map((event) => {
    const pages = event.sourcePages ?? [];
    if (!pages.some((p) => handwrittenPages.has(p))) return event;
    flaggedCount++;
    return flag(event, HANDWRITTEN_NOTE, HANDWRITTEN_PAGE_CONFIDENCE_CAP);
  });

  return { events: result, flaggedCount };
}
