/**
 * F8 (feedback beta tester 2026-08-19): la data di una voce di spesa deve
 * esistere nel documento da cui la voce viene. Il modello aveva datato una
 * consulenza «28.04» pescando la data da un altro documento (la ricevuta era
 * di ottobre). Rete deterministica: la voce resta, ma viene marcata «data da
 * verificare» con la ragione — mai silenziosa, mai cancellata.
 */
import { dateAppearsInText } from '@/lib/date-in-text';
import { parseDocumentBlocks } from './expense-reconciler';
import type { ExtractedExpenseItem } from './expense-extractor';

export const DATE_NOT_IN_SOURCE_NOTE = 'Data non trovata nel documento di origine: verificare sul giustificativo';

export function flagExpenseDatesNotInSource(items: ExtractedExpenseItem[], ocrText: string): ExtractedExpenseItem[] {
  const blocks = parseDocumentBlocks(ocrText);
  return items.map((item) => {
    if (!item.date) return item;
    const source = (item.sourceDocument && blocks.get(item.sourceDocument)) || ocrText;
    if (dateAppearsInText(item.date, source) !== false) return item;
    const notes = item.notes && item.notes.includes(DATE_NOT_IN_SOURCE_NOTE)
      ? item.notes
      : [DATE_NOT_IN_SOURCE_NOTE, item.notes].filter(Boolean).join(' | ');
    return { ...item, dateNotInSource: true, notes };
  });
}
