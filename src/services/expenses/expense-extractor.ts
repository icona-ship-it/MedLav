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
  assertNotTruncated,
} from '@/lib/mistral/client';
import type { ExpenseCategory } from './expense-analyzer';
import { reconcileExpenseItems } from './expense-reconciler';
import type { TokenUsage } from '@/services/cost-tracking/cost-calculator';
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
  /** Brief interpretation linking expense to diagnosis (e.g., "Coerente con trattamento frattura radiale") */
  interpretation: string | null;
  /** Nome file del blocco "### DOCUMENTO ###" da cui viene la voce — chiave per
   * la riconciliazione deterministica (riga unica lorda, dedup acconto/saldo).
   * Assente negli item legacy salvati prima del 2026-08-19. */
  sourceDocument?: string | null;
}

export interface ExpenseExtractionResult {
  items: ExtractedExpenseItem[];
  totalAmount: number | null;
  currency: string;
  /** LLM token usage of the extraction call — feeds pipeline cost tracking. */
  usage?: TokenUsage;
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
- Per ogni spesa, fornisci una breve "interpretation" che spieghi la correlazione con la diagnosi (se disponibile). Es: "Coerente con il trattamento conservativo della frattura radiale", "Terapia antidolorifica post-traumatica", "Esame di controllo post-operatorio"

## REGOLA CRITICA SULLA DATA (segnalata dal perito 2026-05-11)
- NON SCARTARE MAI una voce per assenza di data. L'importo e' il dato vincolante; la data e' opzionale.
- Cascade per popolare il campo data: data pagamento → data fattura → data prestazione clinica correlata → stringa vuota.
- Le voci con date vuota devono comparire COMUNQUE in tabella. Esempi tipici: imposta di bollo, riepiloghi totali, righe di sintesi, contanti senza ricevuta, scontrini con stampa termica sbiadita.

## REGOLA CRITICA: UNA VOCE PER DOCUMENTO FISCALE, IMPORTO LORDO (direttiva perito 2026-08-19 — SOSTITUISCE la precedente regola di scorporo)
- Produci UNA SOLA voce per ogni documento fiscale (fattura, ricevuta, scontrino, avviso di pagamento). L'amount della voce e' il TOTALE PAGATO documentato, COMPRENSIVO di IVA, imposta di bollo, oneri amministrativi e accessori.
- MAI creare voci separate per IVA, bollo, oneri o singoli capitoli della stessa fattura.
- La composizione va nel campo notes. Esempio: ricevuta "prestazione 300,00 + IVA 22% 66,00, da pagare 366,00" → UNA voce con amount 366.00 e notes "di cui prestazione 300,00 e IVA 66,00".
- Fattura con piu' capitoli (es. quota equipe + supporto + oneri + DRG) → UNA voce con il TOTALE FATTURA; i capitoli nelle notes.
- Scontrino farmacia con piu' prodotti → UNA voce con il totale dello scontrino; i singoli farmaci/prodotti nelle notes (e nel campo drugType se uno solo).
- Se il documento espone un TOTALE ("totale", "totale fattura", "da pagare"), usa QUEL numero come amount: NON ricalcolare mai la somma da solo.
- NON dedurre importi non scritti (es. bollo "implicito"): se non e' nel testo, non esiste.

## STRUTTURA DEL TESTO IN INGRESSO
Il testo OCR e' organizzato in blocchi documento separati da:
\`\`\`
### DOCUMENTO: nome-file.pdf ###
... contenuto OCR del documento ...
### FINE DOCUMENTO ###
\`\`\`
ESAMINA OGNI DOCUMENTO SEPARATAMENTE. Non confondere o fondere voci di documenti diversi.

## REGOLA CRITICA SU DEDUPLICAZIONE PRESTAZIONE vs DOCUMENTO (Lavini 2026-05-11)
Caso tipico: un singolo pagamento medico produce PIU' documenti:
- Prenotazione/preventivo (riporta prestazione + prezzo + numero ricetta)
- Avviso pagoPA (riporta Codice Avviso + Ep.AdmNo + importo)
- Ricevuta pagoPA (riporta ID transazione + importo)
Questi sono **3 documenti per 1 sola prestazione**.

CRITERIO DI DEDUPLICA: due documenti riferiscono alla STESSA prestazione se condividono ALMENO UNO dei seguenti identificatori:
- Codice Avviso pagoPA identico (es. \`3010 0000 0111 5409 10\`)
- Ep.AdmNo identico (es. \`O0002233730\`)
- Numero ricetta identico (es. \`050A10205378841\`)
- Numero fattura identico (es. \`10/2026\`)
- Numero ricevuta TC identico (es. \`TC3630661\`)
- Stessa data + stesso importo + stessa struttura erogatrice
In tal caso: PRODUCI UNA SOLA voce di spesa, fondendo le informazioni dai vari documenti. Nelle note cita tutti i documenti fonte.

REGOLA OPPOSTA — VOCI DISTINTE OBBLIGATORIE: due documenti riferiscono a prestazioni DIVERSE se gli identificatori sopra sono DIVERSI, anche se importo e struttura sono identici. Esempio:
- pagopa #1 con Ep.AdmNo O0002233730, codice 3010...5409 10, €35
- pagopa #2 con Ep.AdmNo O0002236660, codice 3010...6924 37, €35
Sono **2 prestazioni distinte** (es. "richiesta cartella clinica" + "ritiro cartella clinica"): crea **2 voci**.

NON saltare MAI un documento solo perche' un'altra voce ha lo stesso importo: confronta SEMPRE gli identificatori sopra.

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
      "notes": "note aggiuntive o null",
      "interpretation": "breve correlazione con la diagnosi o null",
      "sourceDocument": "nome-file del blocco ### DOCUMENTO ### da cui viene la voce"
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

  // Cap OCR text — Mistral Large 3 supports 262K tokens (~470K chars).
  // Lavini bug 2026-05-11: 150K era troppo stretto, su 7 PDF compositi
  // (referti+ricevute) il cap troncava silenziosamente le ultime pagine
  // perdendo voci di spesa intere. 400K lascia abbondante headroom per
  // system prompt + output (~50K) restando sotto il limite token.
  const MAX_OCR_CHARS = 400_000;
  const trimmedOcr = ocrText.length > MAX_OCR_CHARS
    ? ocrText.slice(0, MAX_OCR_CHARS) + '\n\n[... testo troncato per limiti di contesto]'
    : ocrText;

  if (ocrText.length > MAX_OCR_CHARS) {
    logger.warn('expense-extractor', `OCR text truncated from ${ocrText.length} to ${MAX_OCR_CHARS} chars — possible expense items missed`);
  }

  const diagnosisContext = finalDiagnosis
    ? `DIAGNOSI DI RIFERIMENTO: ${finalDiagnosis}\nUsa questa diagnosi per compilare il campo linkedDiagnosis dove pertinente.`
    : 'Nessuna diagnosi di riferimento fornita. Lascia linkedDiagnosis a null se non determinabile dal testo.';

  const userPrompt = EXPENSE_EXTRACTION_USER_PROMPT
    .replace('{ocrText}', trimmedOcr)
    .replace('{diagnosisContext}', diagnosisContext);

  const result = await streamMistralChat({
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
  assertNotTruncated(result, 'expense-extraction');

  // Rete deterministica (feedback medici 2026-08-19): fonde gli scorpori
  // IVA/bollo/capitoli nella voce lorda del documento fiscale e ancora
  // l'importo al totale dichiarato. Idempotente su output già puliti.
  const parsed = parseExpenseResponse(result.content);
  const reconciled = reconcileExpenseItems(parsed.items, trimmedOcr);
  if (reconciled.stats.mergedGroups > 0 || reconciled.stats.anchoredAmounts > 0) {
    logger.info('expense-extractor', `Reconciled expense items: ${parsed.items.length} → ${reconciled.items.length} (${reconciled.stats.mergedGroups} merged groups, ${reconciled.stats.anchoredAmounts} anchored amounts)`);
  }

  return { items: reconciled.items, totalAmount: reconciled.totalAmount, currency: parsed.currency, usage: result.usage };
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
    // GDPR Art.9: niente body LLM grezzo nei log (può contenere nomi/importi/dati).
    logger.error('expense-extractor', `Failed to parse LLM response as JSON (${raw.length} chars)`);
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
      interpretation: typeof item.interpretation === 'string' ? item.interpretation : null,
      sourceDocument: typeof item.sourceDocument === 'string' ? item.sourceDocument : null,
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
