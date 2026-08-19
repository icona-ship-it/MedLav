/**
 * Rete deterministica post-LLM sulle voci di spesa (feedback medici 2026-08-19).
 *
 * Regola di prodotto (decisione founder+perito): UNA voce per documento
 * fiscale (fattura/ricevuta/scontrino) con l'importo TOTALE PAGATO — lordo di
 * IVA, bollo e oneri accessori — e la composizione nelle note. Il prompt lo
 * chiede già; questo modulo è la cintura di sicurezza quando il LLM scorpora
 * comunque (CASO-033: "consulenza 300" + "IVA 66,50" + "bollo 2" per una
 * ricevuta da 366,00).
 *
 * Tre passi, tutti puri e conservativi (nessuna voce sparisce mai):
 * 1. fusione delle voci con stesso documento + stesso numero fattura/ricevuta;
 * 2. fusione delle componenti fiscali orfane (IVA/bollo senza numero) nella
 *    UNICA voce non fiscale dello stesso documento — se è ambiguo non si tocca;
 * 3. ancoraggio dell'importo fuso al totale DICHIARATO nel documento quando
 *    combacia a meno di pochi euro (corregge l'IVA ricalcolata male dal LLM).
 */

import type { ExtractedExpenseItem } from './expense-extractor';
import { isFiscalComponentItem } from './expense-analyzer';

// ── Document blocks ────────────────────────────────────────────────────

const DOC_BLOCK_RE = /### DOCUMENTO: (.+?) ###\n([\s\S]*?)### FINE DOCUMENTO ###/g;

/** Mappa nome-file → testo OCR dai marker emessi dalla pipeline spese. */
export function parseDocumentBlocks(ocrText: string): Map<string, string> {
  const blocks = new Map<string, string>();
  if (!ocrText) return blocks;
  for (const m of ocrText.matchAll(DOC_BLOCK_RE)) {
    blocks.set(m[1].trim(), m[2]);
  }
  return blocks;
}

// ── Declared totals ────────────────────────────────────────────────────

const TOTAL_RES: RegExp[] = [
  // "TOTALE FATTURA 12.318,47" / "totale: € 120,00" — richiede 2 decimali con
  // virgola (formato documenti fiscali italiani). "ACCONTO x" NON matcha.
  /\btotal[ei]\b[^\d\n]{0,20}([\d.]+,\d{2})/gi,
  /\bda\s+pagare\b[^\d\n]{0,10}([\d.]+,\d{2})/gi,
];

function parseItalianAmount(raw: string): number | null {
  const n = parseFloat(raw.replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/** Tutti i totali dichiarati nel testo (non solo il primo): su una fattura a
 * saldo convivono "TOTALE FATTURA" e "TOTALE DA PAGARE" e serve poter scegliere
 * quello giusto per confronto. */
export function findDeclaredTotals(text: string): number[] {
  const totals = new Set<number>();
  for (const re of TOTAL_RES) {
    for (const m of text.matchAll(re)) {
      const n = parseItalianAmount(m[1]);
      if (n !== null) totals.add(n);
    }
  }
  return [...totals];
}

// ── Reconciliation ─────────────────────────────────────────────────────

export interface ReconcileResult {
  items: ExtractedExpenseItem[];
  totalAmount: number | null;
  /** Solo conteggi (GDPR: mai contenuti nei log). */
  stats: { mergedGroups: number; anchoredAmounts: number; excludedDeposits: number };
}

/** Tolleranza per l'ancoraggio al totale documentato: copre IVA ricalcolata
 * male e bolli dedotti (±3 €), senza mai "correggere" verso totali estranei. */
const ANCHOR_TOLERANCE_EUR = 3;

/** Tolleranza deposito↔acconto dichiarato: copre commissioni bancarie e bolli
 * (caso reale: deposito 11.512,73 vs acconto in fattura 11.510,73 = 2 €). */
const DEPOSIT_MATCH_TOLERANCE_EUR = 5;

/** Voce che rappresenta un acconto/deposito versato prima del saldo. */
const DEPOSIT_ITEM_RE = /\b(deposito\s+cauzionale|acconto|caparra)\b/i;

/** Dichiarazione "ACCONTO <importo>" dentro una fattura a saldo. */
const ACCONTO_DECLARATION_RE = /\bacconto\b[^\d\n]{0,20}([\d.]+,\d{2})/gi;

/** Acconti dichiarati per documento (nome file → importi). */
function findDeclaredAcconti(blocks: Map<string, string>): Map<string, number[]> {
  const byDoc = new Map<string, number[]>();
  for (const [doc, text] of blocks) {
    const amounts: number[] = [];
    for (const m of text.matchAll(ACCONTO_DECLARATION_RE)) {
      const n = parseItalianAmount(m[1]);
      if (n !== null) amounts.push(n);
    }
    if (amounts.length > 0) byDoc.set(doc, amounts);
  }
  return byDoc;
}

const MAX_NOTES_LENGTH = 800;

function normalizeRef(ref: string): string {
  return ref.trim().toLowerCase();
}

function formatAmountForNote(amount: number | null): string {
  return amount === null ? 'senza importo' : `€ ${amount.toFixed(2).replace('.', ',')}`;
}

function isFiscalLine(item: ExtractedExpenseItem): boolean {
  return isFiscalComponentItem(item.description);
}

/** Fonde un gruppo di voci dello stesso documento fiscale in una voce lorda. */
function mergeGroup(group: ExtractedExpenseItem[]): ExtractedExpenseItem {
  const nonFiscal = group.filter((i) => !isFiscalLine(i));
  const pool = nonFiscal.length > 0 ? nonFiscal : group;
  const main = pool.reduce((best, i) => ((i.amount ?? -1) > (best.amount ?? -1) ? i : best), pool[0]);

  const others = group.filter((i) => i !== main);
  const amounts = group.map((i) => i.amount).filter((a): a is number => a !== null);
  // Centesimi: somma su interi per evitare 0.1+0.2 float drift.
  const amount = amounts.length > 0
    ? Math.round(amounts.reduce((s, a) => s + Math.round(a * 100), 0)) / 100
    : null;

  const composition = others
    .map((i) => `${i.description} (${formatAmountForNote(i.amount)})`)
    .join('; ');
  const noteParts = [
    main.notes,
    composition ? `Comprende anche: ${composition}` : null,
  ].filter(Boolean);
  const notes = noteParts.length > 0
    ? noteParts.join(' | ').slice(0, MAX_NOTES_LENGTH)
    : null;

  const drugTypes = [...new Set(group.map((i) => i.drugType).filter(Boolean))];

  return {
    ...main,
    amount,
    notes,
    drugType: drugTypes.length === 1 ? drugTypes[0] : null,
    facility: group.find((i) => i.facility)?.facility ?? null,
    isJustified: null,
  };
}

/** Ancora l'importo di una voce FUSA al totale dichiarato nel suo documento,
 * se uno dei totali combacia a meno di ANCHOR_TOLERANCE_EUR. */
function anchorToDeclaredTotal(
  item: ExtractedExpenseItem,
  blocks: Map<string, string>,
): { item: ExtractedExpenseItem; anchored: boolean } {
  if (item.amount === null || !item.sourceDocument) return { item, anchored: false };
  const block = blocks.get(item.sourceDocument);
  if (!block) return { item, anchored: false };

  const totals = findDeclaredTotals(block);
  if (totals.length === 0) return { item, anchored: false };

  let best: number | null = null;
  for (const t of totals) {
    if (best === null || Math.abs(t - item.amount) < Math.abs(best - item.amount)) best = t;
  }
  if (best === null || best === item.amount || Math.abs(best - item.amount) > ANCHOR_TOLERANCE_EUR) {
    return { item, anchored: false };
  }

  const note = `Importo allineato al totale documentato (${formatAmountForNote(best)})`;
  return {
    anchored: true,
    item: {
      ...item,
      amount: best,
      notes: (item.notes ? `${item.notes} | ${note}` : note).slice(0, MAX_NOTES_LENGTH),
    },
  };
}

export function reconcileExpenseItems(
  items: ExtractedExpenseItem[],
  ocrText: string,
): ReconcileResult {
  if (!Array.isArray(items) || items.length === 0) {
    return { items: [], totalAmount: null, stats: { mergedGroups: 0, anchoredAmounts: 0, excludedDeposits: 0 } };
  }

  const blocks = parseDocumentBlocks(ocrText);
  let mergedGroups = 0;
  let anchoredAmounts = 0;

  // Passo 1 — gruppi per documento fiscale: stesso file + stesso numero.
  // Senza numero non si raggruppa qui (un PDF può contenere più fatture);
  // senza sourceDocument nemmeno (due fatture di file diversi possono avere lo
  // stesso numero: fonderle sommerebbe prestazioni distinte).
  const byInvoice = new Map<string, ExtractedExpenseItem[]>();
  const singles: ExtractedExpenseItem[] = [];
  for (const item of items) {
    if (item.receiptNumber && item.sourceDocument) {
      const key = `${item.sourceDocument}|ref:${normalizeRef(item.receiptNumber)}`;
      const arr = byInvoice.get(key);
      if (arr) arr.push(item);
      else byInvoice.set(key, [item]);
    } else {
      singles.push(item);
    }
  }

  const mergedFlags = new Map<ExtractedExpenseItem, boolean>();
  const working: ExtractedExpenseItem[] = [];
  for (const group of byInvoice.values()) {
    if (group.length > 1) {
      const merged = mergeGroup(group);
      mergedGroups++;
      mergedFlags.set(merged, true);
      working.push(merged);
    } else {
      working.push(group[0]);
    }
  }

  // Passo 2 — componenti fiscali orfane (senza numero): si fondono SOLO se il
  // loro documento ha esattamente UNA voce non fiscale a cui appartenere.
  const fiscalOrphans = singles.filter((i) => isFiscalLine(i) && i.sourceDocument);
  const restSingles = singles.filter((i) => !fiscalOrphans.includes(i));
  working.push(...restSingles);

  for (const orphan of fiscalOrphans) {
    const hosts = working.filter(
      (i) => i.sourceDocument === orphan.sourceDocument && !isFiscalLine(i),
    );
    if (hosts.length === 1) {
      const host = hosts[0];
      const merged = mergeGroup([host, orphan]);
      mergedGroups++;
      mergedFlags.set(merged, true);
      working[working.indexOf(host)] = merged;
    } else {
      working.push(orphan); // ambiguo o senza ospite: resta visibile com'è
    }
  }

  // Passo 3 — ancoraggio al totale documentato, SOLO sulle voci fuse (una voce
  // singola legittima non va corretta verso un totale che le somiglia per caso).
  const anchored = working.map((item) => {
    if (!mergedFlags.get(item)) return item;
    const res = anchorToDeclaredTotal(item, blocks);
    if (res.anchored) anchoredAmounts++;
    return res.item;
  });

  // Passo 4 — dedup acconto/saldo (feedback medici 2026-08-19: deposito
  // cauzionale 11.512,73 sommato ALLA fattura a saldo che lo dichiarava già
  // assorbito → +11.512,73 fantasma). Esclusione SEMPRE trasparente: la riga
  // resta in tabella con la motivazione, esce solo dal totale. Conservativa:
  // serve la dichiarazione "acconto ≈ importo" in un ALTRO documento E la voce
  // estratta di quel documento (la fattura che lo assorbe).
  const accontiByDoc = findDeclaredAcconti(blocks);
  let excludedDeposits = 0;
  const withDeposits = anchored.map((item) => {
    if (item.excludedFromTotal || item.amount === null) return item;
    if (!DEPOSIT_ITEM_RE.test(item.description)) return item;
    for (const [doc, acconti] of accontiByDoc) {
      if (doc === item.sourceDocument) continue; // dichiarazione in un ALTRO documento
      const declaredIdx = acconti.findIndex((a) => Math.abs(a - (item.amount as number)) <= DEPOSIT_MATCH_TOLERANCE_EUR);
      if (declaredIdx === -1) continue;
      const declared = acconti[declaredIdx];
      const host = anchored.find((i) =>
        i !== item &&
        i.sourceDocument === doc &&
        i.amount !== null &&
        i.amount >= declared - DEPOSIT_MATCH_TOLERANCE_EUR &&
        !DEPOSIT_ITEM_RE.test(i.description));
      if (!host) continue;
      // Una dichiarazione giustifica UNA sola esclusione (due depositi identici
      // non possono appoggiarsi allo stesso acconto dichiarato).
      acconti.splice(declaredIdx, 1);
      excludedDeposits++;
      return {
        ...item,
        excludedFromTotal: true,
        exclusionReason: `Già compreso nella fattura a saldo${host.receiptNumber ? ` n. ${host.receiptNumber}` : ''} — acconto dichiarato in fattura: ${formatAmountForNote(declared)}`,
      };
    }
    return item;
  });

  withDeposits.sort((a, b) => a.date.localeCompare(b.date));

  const validAmounts = withDeposits
    .filter((i) => !i.excludedFromTotal)
    .map((i) => i.amount)
    .filter((a): a is number => a !== null);
  const totalAmount = validAmounts.length > 0
    ? Math.round(validAmounts.reduce((s, a) => s + Math.round(a * 100), 0)) / 100
    : null;

  return { items: withDeposits, totalAmount, stats: { mergedGroups, anchoredAmounts, excludedDeposits } };
}
