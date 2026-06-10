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
  // "€ 150,00" or "€150,00" or "€ 1.500,00"
  /€\s?([\d.]+,\d{2})/,
  // "Euro 150,00" or "euro 150"
  /[Ee]uro\s?([\d.]+(?:,\d{1,2})?)/,
  // "150,00 euro" or "1.500 euro"
  /([\d.]+,\d{2})\s?[Ee]uro/,
  // "150,00 €" or "1.500,00€"
  /([\d.]+,\d{2})\s?€/,
  // "EUR 150,00"
  /EUR\s?([\d.]+(?:,\d{1,2})?)/i,
];

/**
 * Try to extract a monetary amount from text.
 * Returns null if no amount is found.
 */
export function extractAmount(text: string): number | null {
  if (!text || typeof text !== 'string') return null;

  for (const pattern of AMOUNT_PATTERNS) {
    const match = text.match(pattern);
    if (match?.[1]) {
      return parseItalianNumber(match[1]);
    }
  }
  return null;
}

/**
 * Parse Italian number format (1.500,00 → 1500.00).
 */
function parseItalianNumber(raw: string): number | null {
  // Remove thousands separators (dots), replace comma with decimal dot
  const normalized = raw.replace(/\./g, '').replace(',', '.');
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

    const category = inferCategory(ev.event_type, ev.title, ev.description);
    const amount = extractAmount(ev.title) ?? extractAmount(ev.description);

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
