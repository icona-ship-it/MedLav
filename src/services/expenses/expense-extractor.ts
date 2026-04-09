/**
 * LLM-based expense extraction from OCR text.
 * Produces structured expense items with: amount, receipt number, drug type,
 * category, facility, and linked diagnosis.
 *
 * Designed for Italian medical-legal practice: handles scontrini farmacia,
 * fatture mediche, ricevute, ticket sanitari.
 */

import {
  MISTRAL_MODELS,
  streamMistralChat,
  TIMEOUT_EXTRACTION,
  DETERMINISTIC_SEED,
} from '@/lib/mistral/client';
import type { ExpenseCategory } from './expense-analyzer';
import { logger } from '@/lib/logger';

// ── Types ─────────────────────────────────────────────────────────────

export interface ExtractedExpenseItem {
  /** Date of the expense (YYYY-MM-DD or partial) */
  date: string;
  /** Human-readable description of the expense */
  description: string;
  /** Amount in EUR, null if not found */
  amount: number | null;
  /** Receipt/invoice number if visible */
  receiptNumber: string | null;
  /** Drug name or type (from scontrino farmacia code or description) */
  drugType: string | null;
  /** Expense category */
  category: ExpenseCategory;
  /** Facility or pharmacy name */
  facility: string | null;
  /** Diagnosis this expense relates to, if determinable */
  linkedDiagnosis: string | null;
  /** Whether the expense appears justified — always null, left to the medical expert */
  isJustified: null;
  /** Additional notes (e.g., "ticket SSN", "privato") */
  notes: string | null;
}

export interface ExpenseExtractionResult {
  items: ExtractedExpenseItem[];
  totalAmount: number | null;
  currency: string;
}

// ── Prompt ─────────────────────────────────────────────────────────────

const EXPENSE_EXTRACTION_SYSTEM_PROMPT = `Sei un assistente specializzato nell'analisi di documenti di spesa medica per perizie medico-legali italiane.

Il tuo compito è estrarre OGNI singola voce di spesa presente nei documenti forniti (scontrini, fatture, ricevute, ticket).

## REGOLE ASSOLUTE
- Estrai TUTTE le voci, anche quelle piccole (ticket, copay, bolli)
- NON inventare importi non presenti nel testo
- NON inventare numeri di ricevuta/fattura non presenti nel testo
- Se un dato non è leggibile o assente, usa null
- Per gli scontrini farmacia: il codice a barre o codice prodotto spesso identifica il farmaco
- Importi in formato italiano: 1.500,00 = millecinquecento euro
- Il campo isJustified è SEMPRE null — la valutazione di congruità spetta al medico legale

## CATEGORIE
- farmaci: farmaci, parafarmaci, dispositivi medici da farmacia
- visite_specialistiche: visite mediche, consulenze, consulti
- esami_diagnostici: RX, TAC, RM, ecografie, analisi sangue, ECG
- interventi: interventi chirurgici, day surgery, ricoveri
- riabilitazione: fisioterapia, FKT, terapie fisiche, massoterapia
- ausili_protesi: tutori, stampelle, plantari, busti, ortesi
- trasporti: ambulanza, trasporti sanitari
- altro: tutto ciò che non rientra nelle categorie precedenti

## FORMATO SCONTRINO FARMACIA ITALIANO
Gli scontrini farmacia italiani contengono tipicamente:
- Numero scontrino fiscale in alto
- Codice prodotto (es. "042578016" per OTC, "A" per fascia A SSN)
- Asterisco (*) per farmaci con prescrizione
- Codice minsan o AIC per identificare il farmaco
- "SIC" = dispositivo medico, "OTC" = farmaco senza ricetta
- Ticket: copay SSN

## OUTPUT
Rispondi SOLO con JSON valido, nessun altro testo.`;

const EXPENSE_EXTRACTION_USER_PROMPT = `Analizza il seguente testo OCR di documenti di spesa medica ed estrai ogni singola voce di spesa.

Se è presente una diagnosi finale o un quadro clinico di riferimento, indicalo nel campo linkedDiagnosis per le voci correlate.

TESTO OCR:
---
{ocrText}
---

{diagnosisContext}

Rispondi con un oggetto JSON con questa struttura esatta:
{
  "items": [
    {
      "date": "YYYY-MM-DD o data parziale",
      "description": "descrizione della voce di spesa",
      "amount": 150.00,
      "receiptNumber": "numero scontrino/fattura o null",
      "drugType": "nome farmaco o tipo o null",
      "category": "farmaci|visite_specialistiche|esami_diagnostici|interventi|riabilitazione|ausili_protesi|trasporti|altro",
      "facility": "nome struttura/farmacia o null",
      "linkedDiagnosis": "diagnosi correlata o null",
      "isJustified": null,
      "notes": "note aggiuntive o null"
    }
  ]
}`;

// ── Main extraction function ──────────────────────────────────────────

/**
 * Extract structured expense items from OCR text using Mistral LLM.
 *
 * @param ocrText - Concatenated OCR text from expense documents
 * @param finalDiagnosis - Final diagnosis for linking expenses (optional)
 * @returns Structured expense items
 */
export async function extractExpensesFromOcr(
  ocrText: string,
  finalDiagnosis?: string,
): Promise<ExpenseExtractionResult> {
  if (!ocrText || ocrText.trim().length < 10) {
    logger.info('expense-extractor', 'No OCR text provided, returning empty result');
    return { items: [], totalAmount: null, currency: 'EUR' };
  }

  // Cap OCR text to avoid exceeding context window
  const MAX_OCR_CHARS = 50_000;
  const trimmedOcr = ocrText.length > MAX_OCR_CHARS
    ? ocrText.slice(0, MAX_OCR_CHARS) + '\n\n[... testo troncato per limiti di contesto]'
    : ocrText;

  const diagnosisContext = finalDiagnosis
    ? `DIAGNOSI DI RIFERIMENTO: ${finalDiagnosis}\nUsa questa diagnosi per compilare il campo linkedDiagnosis dove pertinente.`
    : 'Nessuna diagnosi di riferimento fornita. Lascia linkedDiagnosis a null se non determinabile dal testo.';

  const userPrompt = EXPENSE_EXTRACTION_USER_PROMPT
    .replace('{ocrText}', trimmedOcr)
    .replace('{diagnosisContext}', diagnosisContext);

  const { content } = await streamMistralChat({
    model: MISTRAL_MODELS.MISTRAL_LARGE,
    messages: [
      { role: 'system', content: EXPENSE_EXTRACTION_SYSTEM_PROMPT },
      { role: 'user', content: userPrompt },
    ],
    temperature: 0,
    maxTokens: 8192,
    responseFormat: { type: 'json_object' },
    timeoutMs: TIMEOUT_EXTRACTION,
    randomSeed: DETERMINISTIC_SEED,
    label: 'expense-extraction',
  });

  return parseExpenseResponse(content);
}

// ── Response parsing ──────────────────────────────────────────────────

const VALID_CATEGORIES = new Set<string>([
  'farmaci', 'visite_specialistiche', 'esami_diagnostici', 'interventi',
  'riabilitazione', 'ausili_protesi', 'trasporti', 'altro',
]);

function parseExpenseResponse(raw: string): ExpenseExtractionResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    logger.error('expense-extractor', `Failed to parse LLM response as JSON: ${raw.slice(0, 200)}`);
    return { items: [], totalAmount: null, currency: 'EUR' };
  }

  const obj = parsed as Record<string, unknown>;
  const rawItems = Array.isArray(obj.items) ? obj.items : [];

  const items: ExtractedExpenseItem[] = [];
  let totalAmount: number | null = null;

  for (const rawItem of rawItems) {
    const item = rawItem as Record<string, unknown>;
    if (!item || typeof item !== 'object') continue;

    const amount = typeof item.amount === 'number' && item.amount >= 0 ? item.amount : null;
    const category = typeof item.category === 'string' && VALID_CATEGORIES.has(item.category)
      ? item.category as ExpenseCategory
      : 'altro';

    items.push({
      date: typeof item.date === 'string' ? item.date : '',
      description: typeof item.description === 'string' ? item.description : 'Voce non identificata',
      amount,
      receiptNumber: typeof item.receiptNumber === 'string' ? item.receiptNumber : null,
      drugType: typeof item.drugType === 'string' ? item.drugType : null,
      category,
      facility: typeof item.facility === 'string' ? item.facility : null,
      linkedDiagnosis: typeof item.linkedDiagnosis === 'string' ? item.linkedDiagnosis : null,
      isJustified: null, // Always null — medical expert decides
      notes: typeof item.notes === 'string' ? item.notes : null,
    });

    if (amount !== null) {
      totalAmount = (totalAmount ?? 0) + amount;
    }
  }

  // Sort by date
  items.sort((a, b) => a.date.localeCompare(b.date));

  logger.info('expense-extractor', `Extracted ${items.length} expense items, total: ${totalAmount !== null ? `€${totalAmount.toFixed(2)}` : 'N/A'}`);

  return { items, totalAmount, currency: 'EUR' };
}
