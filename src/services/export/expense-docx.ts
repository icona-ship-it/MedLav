/**
 * Tabella spese per l'export DOCX del modulo "Analisi spese mediche"
 * (feedback medici 2026-08-19: il DOCX usciva SENZA le spese — la tabella
 * esisteva solo in-app e nell'export HTML, ma il perito lavora in Word).
 *
 * Formato deciso col perito: UNA sola tabella (niente giudizio di congruità,
 * che resta al medico legale), raggruppata per ente erogatore con subtotali e
 * totale generale. Le voci escluse dal totale (es. acconto assorbito nella
 * fattura a saldo) restano visibili con la motivazione e l'importo barrato.
 *
 * GDPR: mai nomi file nei documenti esportati (possono contenere il nome del
 * paziente) — il raggruppamento usa l'ente erogatore; nell'export ANONIMIZZATO
 * anche gli enti vengono omessi (localizzano indirettamente il periziando) e
 * la tabella è piatta.
 */

import {
  Paragraph, TextRun, Table, TableRow, TableCell,
  HeadingLevel, WidthType, AlignmentType, ShadingType,
} from 'docx';
import { formatDate } from '@/lib/format';

// ── Types ──────────────────────────────────────────────────────────────

export interface ExpenseDocxItem {
  date: string;
  description: string;
  amount: number | null;
  receiptNumber: string | null;
  facility: string | null;
  notes: string | null;
  excludedFromTotal?: boolean;
  exclusionReason?: string | null;
}

export interface ExpenseFacilityGroup {
  facility: string | null;
  items: ExpenseDocxItem[];
  /** Somma delle sole voci conteggiabili (non escluse, con importo). */
  subtotal: number | null;
}

// ── Pure helpers ───────────────────────────────────────────────────────

function sumCents(amounts: number[]): number {
  return Math.round(amounts.reduce((s, a) => s + Math.round(a * 100), 0)) / 100;
}

function countableAmounts(items: ReadonlyArray<ExpenseDocxItem>): number[] {
  return items
    .filter((i) => !i.excludedFromTotal && i.amount !== null)
    .map((i) => i.amount as number);
}

/** Raggruppa per ente erogatore; gruppi ordinati per data più antica, voci per
 * data. Le voci senza ente finiscono in un gruppo residuo (facility null). */
export function groupExpenseItemsByFacility(
  items: ReadonlyArray<ExpenseDocxItem>,
): ExpenseFacilityGroup[] {
  const byFacility = new Map<string, ExpenseDocxItem[]>();
  for (const item of items) {
    const key = item.facility?.trim() || '';
    const arr = byFacility.get(key);
    if (arr) arr.push(item);
    else byFacility.set(key, [item]);
  }

  const earliest = (evs: ExpenseDocxItem[]): string =>
    evs.map((e) => e.date).filter(Boolean).sort()[0] ?? '9999-12-31';

  return Array.from(byFacility.entries())
    .sort(([, a], [, b]) => earliest(a).localeCompare(earliest(b)))
    .map(([key, groupItems]) => {
      const sorted = [...groupItems].sort((a, b) => a.date.localeCompare(b.date));
      const amounts = countableAmounts(sorted);
      return {
        facility: key === '' ? null : key,
        items: sorted,
        subtotal: amounts.length > 0 ? sumCents(amounts) : null,
      };
    });
}

/** Totale generale al netto delle voci escluse (mai fidarsi di un totale
 * persistito: si ricalcola da ciò che la tabella mostra). */
export function computeExpenseGrandTotal(items: ReadonlyArray<ExpenseDocxItem>): number | null {
  const amounts = countableAmounts(items);
  return amounts.length > 0 ? sumCents(amounts) : null;
}

// ── DOCX rendering ─────────────────────────────────────────────────────

const FONT = 'Calibri';
const COL_WIDTHS = [1300, 3300, 1300, 1400, 1700]; // Data | Descrizione | N. doc | Importo | Note

function formatEuroDocx(amount: number): string {
  const [int, dec] = Math.abs(amount).toFixed(2).split('.');
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `€ ${grouped},${dec}`;
}

function textCell(text: string, opts?: { bold?: boolean; italics?: boolean; strike?: boolean; color?: string; align?: (typeof AlignmentType)[keyof typeof AlignmentType]; columnSpan?: number; shading?: string }): TableCell {
  return new TableCell({
    columnSpan: opts?.columnSpan,
    shading: opts?.shading ? { type: ShadingType.CLEAR, fill: opts.shading } : undefined,
    children: [new Paragraph({
      alignment: opts?.align,
      children: [new TextRun({
        text,
        bold: opts?.bold,
        italics: opts?.italics,
        strike: opts?.strike,
        color: opts?.color,
        size: 18,
        font: FONT,
      })],
    })],
  });
}

function buildItemRow(item: ExpenseDocxItem): TableRow {
  const excluded = item.excludedFromTotal === true;

  const descChildren: Paragraph[] = [new Paragraph({
    children: [new TextRun({ text: item.description, size: 18, font: FONT, color: excluded ? '777777' : undefined })],
  })];
  if (excluded) {
    descChildren.push(new Paragraph({
      children: [new TextRun({
        text: `Non sommata al totale${item.exclusionReason ? ` — ${item.exclusionReason}` : ''}`,
        italics: true,
        size: 16,
        color: '9A3412',
        font: FONT,
      })],
    }));
  }

  return new TableRow({
    children: [
      textCell(formatDate(item.date), { color: excluded ? '777777' : undefined }),
      new TableCell({ children: descChildren }),
      textCell(item.receiptNumber ?? '—', { color: excluded ? '777777' : undefined }),
      textCell(item.amount !== null ? formatEuroDocx(item.amount) : '—', {
        align: AlignmentType.RIGHT,
        strike: excluded,
        color: excluded ? '777777' : undefined,
      }),
      textCell(item.notes ?? '—', { color: '64748B' }),
    ],
  });
}

/**
 * Sezione DOCX completa: heading numerato + tabella (raggruppata per ente, o
 * piatta se anonimizzata) + totale generale + disclaimer congruità.
 */
export function buildExpenseDocxSection(params: {
  items: ExpenseDocxItem[];
  sectionNumber: string;
  anonymized?: boolean;
}): (Paragraph | Table)[] {
  const { items, sectionNumber, anonymized } = params;
  const out: (Paragraph | Table)[] = [];

  out.push(
    new Paragraph({
      text: `${sectionNumber}. TABELLA SPESE MEDICHE`,
      heading: HeadingLevel.HEADING_1,
    }),
    new Paragraph({ text: '' }),
  );

  if (items.length === 0) {
    out.push(new Paragraph({
      children: [new TextRun({ text: 'Nessuna voce di spesa individuata nella documentazione analizzata.', italics: true, font: FONT })],
    }));
    return out;
  }

  const rows: TableRow[] = [
    new TableRow({
      tableHeader: true,
      children: ['Data', 'Descrizione', 'N. fattura/ricevuta', 'Importo', 'Note'].map((h, i) =>
        textCell(h, { bold: true, shading: 'F1F5F9', align: i === 3 ? AlignmentType.RIGHT : undefined }),
      ),
    }),
  ];

  if (anonymized) {
    // Tabella piatta: gli enti localizzano indirettamente il periziando.
    const sorted = [...items].sort((a, b) => a.date.localeCompare(b.date));
    for (const item of sorted) rows.push(buildItemRow(item));
  } else {
    for (const group of groupExpenseItemsByFacility(items)) {
      rows.push(new TableRow({
        children: [textCell(group.facility ?? 'Ente non indicato', { bold: true, columnSpan: 5, shading: 'E2E8F0' })],
      }));
      for (const item of group.items) rows.push(buildItemRow(item));
      if (group.subtotal !== null && group.items.length > 1) {
        rows.push(new TableRow({
          children: [
            textCell('Subtotale', { bold: true, columnSpan: 3, align: AlignmentType.RIGHT }),
            textCell(formatEuroDocx(group.subtotal), { bold: true, align: AlignmentType.RIGHT }),
            textCell(''),
          ],
        }));
      }
    }
  }

  const grandTotal = computeExpenseGrandTotal(items);
  if (grandTotal !== null) {
    rows.push(new TableRow({
      children: [
        textCell('TOTALE GENERALE', { bold: true, columnSpan: 3, align: AlignmentType.RIGHT, shading: 'F1F5F9' }),
        textCell(formatEuroDocx(grandTotal), { bold: true, align: AlignmentType.RIGHT, shading: 'F1F5F9' }),
        textCell('', { shading: 'F1F5F9' }),
      ],
    }));
  }

  out.push(new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    columnWidths: COL_WIDTHS,
    rows,
  }));

  out.push(
    new Paragraph({ text: '' }),
    new Paragraph({
      children: [new TextRun({
        text: 'Nota: la valutazione di congruità delle spese è riservata al medico legale. Gli importi sono quelli documentati (totale pagato, IVA e bolli inclusi) e vanno verificati con i documenti originali.',
        italics: true,
        size: 16,
        color: '795548',
        font: FONT,
      })],
    }),
  );

  return out;
}
