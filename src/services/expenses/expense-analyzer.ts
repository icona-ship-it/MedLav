/**
 * Expense analysis service for the "Analisi spese mediche" module.
 * Extracts, categorizes, and summarizes medical expenses from events.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ExpenseCategory =
  | 'farmaci'
  | 'visite_specialistiche'
  | 'esami_diagnostici'
  | 'interventi'
  | 'riabilitazione'
  | 'ausili_protesi'
  | 'trasporti'
  | 'altro';

export interface ExpenseItem {
  date: string;
  description: string;
  category: ExpenseCategory;
  amount: number | null;
  facility: string | null;
  documentSource: string;
  /** Numero ricevuta/fattura estratto dal testo (best-effort, benchmark spese
   * 2026-06-10: colonna "N. Ricevuta/Fattura"). Null se non riconoscibile. */
  receiptRef?: string | null;
}

export interface CategoryTotal {
  count: number;
  total: number | null;
}

export interface ExpenseAnalysisResult {
  items: ExpenseItem[];
  totalsByCategory: Record<ExpenseCategory, CategoryTotal>;
  totalItems: number;
  totalAmount: number | null;
  summary: string;
}

// ---------------------------------------------------------------------------
// Category labels for display
// ---------------------------------------------------------------------------

export const EXPENSE_CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  farmaci: 'Farmaci',
  visite_specialistiche: 'Visite specialistiche',
  esami_diagnostici: 'Esami diagnostici',
  interventi: 'Interventi chirurgici',
  riabilitazione: 'Riabilitazione / Fisioterapia',
  ausili_protesi: 'Ausili e protesi',
  trasporti: 'Trasporti sanitari',
  altro: 'Altro',
};

// ---------------------------------------------------------------------------
// Amount extraction
// ---------------------------------------------------------------------------

const AMOUNT_PATTERNS: RegExp[] = [
  // Formato anglosassone "euro 1,038.80" / "€ 12,345.67" (virgola-migliaia + punto-decimale)
  // — PRIMA dei pattern italiani, altrimenti "1,038.80" verrebbe letto come "1,03" (1.03).
  /(?:€|[Ee]uro|EUR)\s?(\d{1,3}(?:,\d{3})+\.\d{2})/,
  /(\d{1,3}(?:,\d{3})+\.\d{2})\s?(?:€|[Ee]uro)/,
  // "€ 150,00" or "€150,00" or "€ 1.500,00"
  /€\s?([\d.]+,\d{2})/,
  // "Euro 150,00" or "euro 150"
  /[Ee]uro\s?([\d.]+(?:,\d{1,2})?)/,
  // "150,00 euro" or "1.500 euro"
  /([\d.]+,\d{2})\s?[Ee]uro/,
  // "150,00 €" or "1.500,00€"
  /([\d.]+,\d{2})\s?€/,
  // "50,00 EUR" — codice ISO DOPO il numero (documenti commerciali/fatture reali;
  // bug Antoniazzi 2026-07-05: [Ee]uro non matcha "EUR", il pattern EUR-prefisso
  // esisteva solo prima della cifra → tutta la tabella spese usciva con "—")
  /([\d.]+,\d{2})\s?EUR\b/,
  // "EUR 150,00"
  /EUR\s?([\d.]+(?:,\d{1,2})?)/i,
];

// Il TOTALE dichiarato vince sugli importi parziali: su una ricevuta con
// "100,00 EUR + IVA 4% per un totale di 120,00 EUR" la spesa sostenuta è 120
// (è anche il numero che usa il gold). Finestra corta dopo "totale" per non
// agganciare cifre lontane. AUDIT 2026-07-16: il pattern RICHIEDE un marcatore
// valuta (€/euro/EUR) prima o dopo la cifra e un confine di parola prima di
// "total": senza, "capacità polmonare totale 5,90 litri" vinceva sull'importo
// vero ("euro 36,15") e falsava la tabella di un atto depositabile.
const TOTAL_AMOUNT_PATTERNS: RegExp[] = [
  /\btotal[ei][^\d\n]{0,12}(?:€|euro|eur)\s?([\d.]+,\d{2})/i,      // "totale: € 120,00"
  /\btotal[ei][^\d\n]{0,12}([\d.]+,\d{2})\s?(?:€|euro|eur)\b/i,    // "totale 120,00 EUR"
];

/**
 * Try to extract a monetary amount from text.
 * Returns null if no amount is found.
 */
export function extractAmount(text: string): number | null {
  if (!text || typeof text !== 'string') return null;

  for (const totalPattern of TOTAL_AMOUNT_PATTERNS) {
    const total = text.match(totalPattern);
    if (total?.[1]) {
      return parseItalianNumber(total[1]);
    }
  }

  for (const pattern of AMOUNT_PATTERNS) {
    const match = text.match(pattern);
    if (match?.[1]) {
      return parseItalianNumber(match[1]);
    }
  }
  return null;
}

/**
 * Parse di un importo riconoscendo SIA il formato italiano (1.500,00) SIA quello
 * anglosassone (1,500.00) — alcuni gestionali/SSR emettono importi in formato US
 * ("euro 1,038.80"), che col vecchio parser italiano dava cifre sbagliate (gonfiava
 * il totale). Regola: l'ULTIMO separatore è il decimale.
 */
function parseItalianNumber(raw: string): number | null {
  const lastComma = raw.lastIndexOf(',');
  const lastDot = raw.lastIndexOf('.');
  let normalized: string;
  if (lastComma > lastDot) {
    // virgola decimale (italiano): i punti sono migliaia
    normalized = raw.replace(/\./g, '').replace(',', '.');
  } else if (lastDot > lastComma) {
    // AUDIT 2026-07-16 (errore 1000x): "euro 1.500" (migliaia italiane SENZA
    // decimali) veniva letto come 1.5. Se non c'è virgola e dopo l'ULTIMO punto
    // ci sono esattamente 3 cifre, è il formato migliaia italiano (1.500, 12.000):
    // i punti si eliminano. "27.90" (2 cifre) resta decimale anglosassone.
    if (lastComma === -1 && /\.\d{3}$/.test(raw)) {
      normalized = raw.replace(/\./g, '');
    } else {
      // punto decimale (anglosassone): le virgole sono migliaia
      normalized = raw.replace(/,/g, '');
    }
  } else {
    // un solo tipo di separatore (o nessuno): default italiano (virgola = decimale)
    normalized = raw.replace(',', '.');
  }
  const num = parseFloat(normalized);
  return isNaN(num) || num < 0 ? null : num;
}

/**
 * Best-effort: numero di ricevuta/fattura dal testo (benchmark spese
 * 2026-06-10, es. "Fattura n. 10/2026" → "10/2026", "ricevuta TC3630661" →
 * "TC3630661"). Deterministico, MAI inventato: null se non riconoscibile.
 * Il riferimento deve contenere almeno una cifra (evita falsi positivi tipo
 * "fattura elettronica"); il gap fra parola-chiave e numero non può
 * attraversare altre parole.
 */
export function extractReceiptRef(...texts: Array<string | null | undefined>): string | null {
  // Pattern in ordine di affidabilità: keyword fattura/ricevuta + numero; poi i
  // riferimenti di pagamento PagoPA presenti nel benchmark spese ("TC3630661",
  // "EP.ADMID 3630661") che valorizzano la colonna senza keyword.
  const PATTERNS: RegExp[] = [
    /(?:fattura|ricevuta|scontrino|proforma)(?:\s+(?:fiscale|quietanzata))?\s*(?:n(?:\.|°|um\.?|umero)?)?\s*[:.]?\s*([A-Za-z]{0,4}\d[\dA-Za-z\/\-.]{0,18})/i,
    /\b(TC\d{5,})\b/,
    /EP\.?\s*ADM(?:ID|NO)\s*:?\s*(\d{5,})/i,
  ];
  for (const t of texts) {
    if (!t) continue;
    for (const re of PATTERNS) {
      const m = t.match(re);
      if (m?.[1]) return m[1].replace(/[.,;:]+$/, '');
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Category inference
// ---------------------------------------------------------------------------

interface CategoryRule {
  category: ExpenseCategory;
  keywords: string[];
}

const CATEGORY_RULES: CategoryRule[] = [
  {
    category: 'farmaci',
    keywords: [
      'farmac', 'medicinale', 'medicament', 'ricetta', 'prescrizione',
      'compresse', 'capsule', 'fiale', 'pomata', 'crema', 'sciroppo',
      'antibiotico', 'analgesico', 'antidolorifico', 'antinfiammatorio',
      'paracetamolo', 'ibuprofene', 'cortisone', 'anestetico',
      'ticket farmaceutic', 'farmacia', 'scontrino farmacia',
    ],
  },
  {
    category: 'visite_specialistiche',
    keywords: [
      'visita', 'consulenza', 'consulto', 'specialistic', 'ambulatoriale',
      'ortoped', 'neurolog', 'cardiolog', 'dermatolog', 'oculist',
      'fisiatra', 'fisioterapista', 'oncologo', 'urologo', 'ginecologo',
      'chirurgo', 'internista', 'pneumologo', 'gastroenterologo',
      'reumatolog', 'endocrinolog', 'medico legale',
    ],
  },
  {
    category: 'esami_diagnostici',
    keywords: [
      'esame', 'analisi', 'radiografia', 'rx ', 'tac ', 'risonanza', 'rmn',
      'ecografia', 'elettrocardiogramma', 'ecg', 'emocromo', 'laboratorio',
      'sangue', 'urine', 'biopsia', 'istologico', 'citologico',
      'mammografia', 'densitometria', 'scintigrafia', 'pet ', 'moc ',
      'elettromiografia', 'emg', 'holter', 'spirometria',
      'ematochimico', 'strumentale', 'referto',
    ],
  },
  {
    category: 'interventi',
    keywords: [
      'intervento', 'operazione', 'chirurg', 'artroscop', 'protesi',
      'anestesia', 'sala operatoria', 'ricovero', 'degenza',
      'day hospital', 'day surgery',
    ],
  },
  {
    category: 'riabilitazione',
    keywords: [
      'riabilitazione', 'riabilitat', 'fisioterapia', 'fisiokinesiterapia',
      'fkt', 'ginnastica', 'massoterapia', 'idroterapia', 'tens',
      'ultrasuoni', 'laserterapia', 'tecar', 'magnetoterapia',
      'ciclo sedute', 'sedute',
    ],
  },
  {
    category: 'ausili_protesi',
    keywords: [
      'ausilio', 'protesi', 'ortesi', 'tutore', 'busto', 'corsetto',
      'stampelle', 'deambulatore', 'carrozzina', 'sedia a rotelle',
      'plantare', 'scarpa ortopedica', 'collare', 'ginocchiera',
      'cavigliera', 'polsiera',
    ],
  },
  {
    category: 'trasporti',
    keywords: [
      'trasporto', 'ambulanza', 'taxi sanitario', 'viaggio',
      'spostamento', 'trasferta', 'chilometr', 'km ',
    ],
  },
];

/**
 * Infer expense category from event title + description + event_type.
 */
export function inferCategory(
  eventType: string,
  title: string,
  description: string,
): ExpenseCategory {
  const text = `${title} ${description}`.toLowerCase();

  // Direct mapping from event_type
  if (eventType === 'intervento') return 'interventi';
  if (eventType === 'esame' || eventType === 'referto') return 'esami_diagnostici';
  if (eventType === 'visita' || eventType === 'follow-up') return 'visite_specialistiche';
  if (eventType === 'prescrizione') return 'farmaci';

  // Keyword-based classification
  for (const rule of CATEGORY_RULES) {
    for (const kw of rule.keywords) {
      if (text.includes(kw)) {
        return rule.category;
      }
    }
  }

  return 'altro';
}

// ---------------------------------------------------------------------------
// Main analysis function
// ---------------------------------------------------------------------------

interface AnalyzableEvent {
  event_type: string;
  title: string;
  description: string;
  event_date: string;
  facility: string | null;
  source_type: string;
  /** Ancora verbatim OCR (≤200 char): fallback per l'estrazione dell'importo
   * quando titolo/descrizione non lo riportano (casi reali 2026-07-14: 3 voci
   * su 4 senza importo perché l'estrazione non l'aveva copiato in description,
   * ma "€ 120,00" era nel sourceText). */
  source_text?: string | null;
  /** Documento di origine: serve a riconoscere la STESSA notifica di costo SSN
   * letta in due documenti diversi (fascicolo ↔ referto). */
  document_id?: string | null;
}

/**
 * Analyze events and produce a structured expense summary.
 *
 * 1. Filters events with event_type === 'spesa_medica'
 * 2. Also includes ALL other events (visite, esami, interventi etc. all imply costs)
 * 3. Extracts amounts from descriptions using regex
 * 4. Categorizes each expense
 * 5. Calculates totals per category
 * 6. Generates a human-readable summary
 */
/**
 * Vero se la voce è una NOTIFICA DI COSTO a carico del Servizio Sanitario (SSN/SSR),
 * non una spesa out-of-pocket del danneggiato → esclusa dalle spese risarcibili.
 */
export function isSsrCostNotification(title: string, description?: string | null, sourceText?: string | null): boolean {
  // Include ANCHE il source_text (ancora OCR): la frase SSR spesso vive lì
  // integrale mentre titolo/descrizione la parafrasano (CASO-2026-220: source_text
  // "il Servizio Sanitario Regionale ha impiegato euro 27.90", ma la description
  // usava l'ordine invertito "costo sostenuto dal SSR" → sfuggiva).
  const t = `${title} ${description ?? ''} ${sourceText ?? ''}`.toLowerCase();
  const service = '(s\\.?s\\.?[rn]\\.?|servizio sanitario(\\s+(regionale|nazionale))?|sistema sanitario)';
  // Ordine DIRETTO: "il SSR ha impiegato/impegnato/sostenuto/speso ..."
  const serviceVerb = new RegExp(`${service} ha (impi?egat|impegnat|sosten[uy]t|spes)`);
  // Ordine INVERTITO: "costo/spesa ... sostenuto/impiegato/impegnato/speso DAL SSR"
  const invertedVerb = new RegExp(`(impi?egat|impegnat|sosten[uy]t|spes)[a-z]*\\s+(euro\\s+[\\d.,]+\\s+)?(dal|da parte del|a carico del)\\s+${service}`);
  return (
    serviceVerb.test(t) ||
    invertedVerb.test(t) ||
    /a carico del (ssn|s\.s\.n|servizio sanitario|sistema sanitario)|onere a carico del (ssn|servizio sanitario)|costo a carico del (ssn|servizio sanitario)|rimborsat[oa] dal (ssn|servizio sanitario)|in regime (di )?ssn/.test(t)
  );
}

/**
 * Vero se la voce è una COMPONENTE FISCALE di un'altra spesa (IVA scorporata,
 * imposta/marca da bollo), non una prestazione autonoma: l'estrazione a volte
 * le crea come eventi separati e contarle gonfia il totale (Antoniazzi: IVA
 * "inclusa nel totale" del tutore + bollo della fattura RM → +6€ fantasma).
 * Il gold elenca solo prestazioni. Conservativo: match sul TITOLO — una
 * prestazione sanitaria vera non si intitola mai "IVA ..." o "Imposta di bollo".
 */
export function isFiscalComponentItem(title: string): boolean {
  return /^\s*(iva\b|imposta di bollo\b|marca da bollo\b|bollo\b)/i.test(title);
}

/**
 * Vero se la voce è un RECORD DI PAGAMENTO (ricevuta POS/bancomat, bonifico,
 * quietanza, "Pagamento ..."): la PROVA che una spesa è stata saldata, non una
 * prestazione in più. Da sola resta una voce valida (può essere l'unica traccia
 * della spesa); accanto a una prestazione con stessa data+importo è la sua
 * quietanza e va contata una volta sola (bug Antoniazzi 221: fattura RX €50 +
 * ricevuta bancomat €50 stesso giorno → totale gonfiato 380 invece di 330).
 */
export function isPaymentTransactionRecord(title: string): boolean {
  return /^\s*pagamento\b/i.test(title) || /\b(bancomat|pos|bonifico|transazione|quietanza)\b/i.test(title);
}

/** Voce di costo a carico del Servizio Sanitario (SSN/SSR). */
export interface SsnCostItem {
  date: string;
  description: string;
  facility: string | null;
  amount: number | null;
  documentId?: string | null;
}

export interface SsnCostSummary {
  items: SsnCostItem[];
  total: number | null;
  /** Notifiche unificate perché stesso importo, stessa data (±1 giorno) e documento
   * DIVERSO: la stessa notifica letta due volte (fascicolo ↔ referto), non due costi. */
  mergedDuplicates: number;
}

/** Stessa notifica vista in due documenti: stesso importo, data a ±1 giorno (il PS a
 * cavallo di mezzanotte porta la data del giorno dopo), documento diverso. Due voci
 * nello STESSO documento con pari importo sono due prestazioni (due RX a 27,90). */
function isSameNotificationFromAnotherDocument(a: SsnCostItem, b: SsnCostItem): boolean {
  if (a.amount == null || b.amount == null || Math.abs(a.amount - b.amount) > 0.005) return false;
  if (!a.documentId || !b.documentId || a.documentId === b.documentId) return false;
  const da = Date.parse(`${a.date}T00:00:00Z`);
  const db = Date.parse(`${b.date}T00:00:00Z`);
  if (Number.isNaN(da) || Number.isNaN(db)) return false;
  return Math.abs(da - db) <= 86_400_000;
}

/**
 * Raccoglie i COSTI A CARICO DEL SSN/SSR — le notifiche-costo che analyzeExpenses
 * ESCLUDE dalle spese del danneggiato — in una lista separata, così il perito ha
 * tutti i costi ordinati ma distinti (out-of-pocket vs pubblici). Puro.
 */
export function collectSsnCosts(events: AnalyzableEvent[]): SsnCostSummary {
  if (!Array.isArray(events) || events.length === 0) return { items: [], total: null, mergedDuplicates: 0 };
  const items: SsnCostItem[] = [];
  for (const ev of events) {
    if (!ev || typeof ev.title !== 'string') continue;
    if (!isSsrCostNotification(ev.title, ev.description, ev.source_text)) continue;
    const amount = extractAmount(ev.title)
      ?? extractAmount(ev.description)
      ?? (ev.source_text ? extractAmount(ev.source_text) : null);
    items.push({ date: ev.event_date ?? '', description: ev.title, facility: ev.facility ?? null, amount, documentId: ev.document_id ?? null });
  }
  items.sort((a, b) => a.date.localeCompare(b.date));
  // Dedup deterministica (stessa data + importo + descrizione = stessa notifica).
  const seen = new Set<string>();
  const deduped = items.filter((i) => {
    const key = `${i.date}|${i.amount ?? 'null'}|${i.description.toLowerCase().replace(/\s+/g, ' ').trim().slice(0, 80)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  // Stessa notifica letta in DUE documenti (panel giro 7, caso C: +2.886,25 € di doppioni).
  const unified: SsnCostItem[] = [];
  let mergedDuplicates = 0;
  for (const item of deduped) {
    if (unified.some((kept) => isSameNotificationFromAnotherDocument(kept, item))) { mergedDuplicates++; continue; }
    unified.push(item);
  }
  const withAmount = unified.filter((i) => i.amount != null);
  const total = withAmount.length > 0 ? withAmount.reduce((s, i) => s + (i.amount ?? 0), 0) : null;
  return { items: unified, total, mergedDuplicates };
}

export function analyzeExpenses(
  events: AnalyzableEvent[],
): ExpenseAnalysisResult {
  if (!Array.isArray(events) || events.length === 0) {
    return emptyResult();
  }

  const items: ExpenseItem[] = [];

  for (const ev of events) {
    // Skip non-string/invalid inputs gracefully
    if (!ev || typeof ev.title !== 'string') continue;

    // NON sono spese risarcibili del danneggiato le notifiche-costo a carico del SSN/SSR
    // (es. "il SSR ha impiegato euro X", "a carico del Servizio Sanitario"): contarle gonfia
    // il quantum con costi che il danneggiato non ha sostenuto.
    if (isSsrCostNotification(ev.title, ev.description, ev.source_text)) continue;

    // Le componenti fiscali (IVA scorporata, bollo) non sono voci di spesa autonome.
    if (isFiscalComponentItem(ev.title)) continue;

    const category = inferCategory(ev.event_type, ev.title, ev.description);
    // Importo: titolo → descrizione → sourceText verbatim (l'ancora OCR spesso
    // contiene "euro 120,00" anche quando l'estrazione non l'ha copiato altrove).
    const amount = extractAmount(ev.title)
      ?? extractAmount(ev.description)
      ?? (ev.source_text ? extractAmount(ev.source_text) : null);

    items.push({
      date: ev.event_date ?? '',
      description: ev.title,
      category,
      amount,
      facility: ev.facility ?? null,
      documentSource: ev.source_type ?? 'altro',
      receiptRef: extractReceiptRef(ev.title, ev.description),
    });
  }

  // Sort by date
  items.sort((a, b) => a.date.localeCompare(b.date));

  // QA 2026-06-11 (Tedesco): un PDF spese caricato due volte duplicava le voci
  // gonfiando il totale. Dedup deterministica: stessa data + stesso importo +
  // stesso numero ricevuta (quando presente) o stessa descrizione normalizzata
  // → è la STESSA spesa, conta una volta sola (anche fattura vs quietanza).
  const seenExpense = new Set<string>();
  const dedupedItems = items.filter((item) => {
    const refOrDesc = item.receiptRef?.trim()
      || item.description.toLowerCase().replace(/\s+/g, ' ').trim().slice(0, 80);
    const key = `${item.date}|${item.amount ?? 'null'}|${refOrDesc}`;
    if (seenExpense.has(key)) return false;
    seenExpense.add(key);
    return true;
  });

  // Antoniazzi 221 (2026-07-16): la fattura della prestazione E la ricevuta di
  // pagamento che la salda sfuggono al dedup sopra (la ricevuta porta il numero
  // fattura nella chiave, la prestazione la descrizione) → +€50 fantasma sul
  // totale. Conservativo: scarta il record-di-pagamento SOLO se esiste una voce
  // NON-pagamento con stessa data+importo (è la sua quietanza); da solo resta.
  const serviceAmountKeys = new Set(
    dedupedItems
      .filter((i) => i.amount != null && !isPaymentTransactionRecord(i.description))
      .map((i) => `${i.date}|${i.amount}`),
  );
  const withoutPaymentDupes = dedupedItems.filter((i) =>
    !(i.amount != null && isPaymentTransactionRecord(i.description) && serviceAmountKeys.has(`${i.date}|${i.amount}`)),
  );
  items.length = 0;
  items.push(...withoutPaymentDupes);

  // Calculate totals per category
  const allCategories: ExpenseCategory[] = [
    'farmaci', 'visite_specialistiche', 'esami_diagnostici', 'interventi',
    'riabilitazione', 'ausili_protesi', 'trasporti', 'altro',
  ];

  const totalsByCategory: Record<ExpenseCategory, CategoryTotal> = {} as Record<ExpenseCategory, CategoryTotal>;
  for (const cat of allCategories) {
    totalsByCategory[cat] = { count: 0, total: null };
  }

  let grandTotal: number | null = null;

  for (const item of items) {
    const entry = totalsByCategory[item.category];
    entry.count += 1;
    if (item.amount !== null) {
      entry.total = (entry.total ?? 0) + item.amount;
      grandTotal = (grandTotal ?? 0) + item.amount;
    }
  }

  const summary = buildSummary(items, totalsByCategory, grandTotal);

  return {
    items,
    totalsByCategory,
    totalItems: items.length,
    totalAmount: grandTotal,
    summary,
  };
}

// ---------------------------------------------------------------------------
// Summary text builder
// ---------------------------------------------------------------------------

function buildSummary(
  items: ExpenseItem[],
  totals: Record<ExpenseCategory, CategoryTotal>,
  grandTotal: number | null,
): string {
  if (items.length === 0) {
    return 'Nessuna spesa medica individuata nella documentazione analizzata.';
  }

  const lines: string[] = [];
  lines.push(`Analisi eseguita su ${items.length} voci di spesa individuate nella documentazione.`);
  lines.push('');

  const categoriesWithItems = Object.entries(totals)
    .filter(([, v]) => v.count > 0)
    .sort(([, a], [, b]) => b.count - a.count);

  for (const [cat, data] of categoriesWithItems) {
    const label = EXPENSE_CATEGORY_LABELS[cat as ExpenseCategory];
    const amountStr = data.total !== null
      ? ` — totale documentato: ${formatCurrency(data.total)}`
      : ' — importo non documentato';
    lines.push(`- ${label}: ${data.count} ${data.count === 1 ? 'voce' : 'voci'}${amountStr}`);
  }

  if (grandTotal !== null) {
    lines.push('');
    lines.push(`Totale complessivo documentato: ${formatCurrency(grandTotal)}`);
  }

  const itemsWithAmount = items.filter((i) => i.amount !== null).length;
  const itemsWithoutAmount = items.length - itemsWithAmount;
  if (itemsWithoutAmount > 0) {
    lines.push('');
    lines.push(
      `Nota: ${itemsWithoutAmount} ${itemsWithoutAmount === 1 ? 'voce non presenta' : 'voci non presentano'} importo esplicitamente documentato nel testo.`,
    );
  }

  return lines.join('\n');
}

function formatCurrency(amount: number): string {
  return `€ ${amount.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// ---------------------------------------------------------------------------
// Empty result factory
// ---------------------------------------------------------------------------

function emptyResult(): ExpenseAnalysisResult {
  const allCategories: ExpenseCategory[] = [
    'farmaci', 'visite_specialistiche', 'esami_diagnostici', 'interventi',
    'riabilitazione', 'ausili_protesi', 'trasporti', 'altro',
  ];
  const totalsByCategory: Record<ExpenseCategory, CategoryTotal> = {} as Record<ExpenseCategory, CategoryTotal>;
  for (const cat of allCategories) {
    totalsByCategory[cat] = { count: 0, total: null };
  }
  return {
    items: [],
    totalsByCategory,
    totalItems: 0,
    totalAmount: null,
    summary: 'Nessuna spesa medica individuata nella documentazione analizzata.',
  };
}
