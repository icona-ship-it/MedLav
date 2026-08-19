import { describe, it, expect } from 'vitest';
import type { ExtractedExpenseItem } from './expense-extractor';
import {
  parseDocumentBlocks,
  findDeclaredTotals,
  reconcileExpenseItems,
} from './expense-reconciler';

/**
 * Rete deterministica post-LLM per il feedback medici 2026-08-19 (Mail 1,
 * CASO-033): una voce per documento fiscale con l'importo TOTALE PAGATO
 * (lordo IVA/bollo), mai scorpori — anche quando il LLM sgarra.
 * Tutti i dati qui sono FITTIZI (universo Cittàdemo/Demprova).
 */

function makeItem(overrides: Partial<ExtractedExpenseItem>): ExtractedExpenseItem {
  return {
    date: '2026-01-10',
    description: 'Voce di prova',
    amount: 100,
    receiptNumber: null,
    drugType: null,
    category: 'altro',
    facility: null,
    linkedDiagnosis: null,
    isJustified: null,
    notes: null,
    interpretation: null,
    sourceDocument: null,
    ...overrides,
  };
}

describe('parseDocumentBlocks', () => {
  it('should map document names to their OCR text', () => {
    const ocr = '### DOCUMENTO: fattura-a.pdf ###\ntesto A\n### FINE DOCUMENTO ###\n\n### DOCUMENTO: ricevuta-b.pdf ###\ntesto B\n### FINE DOCUMENTO ###';
    const blocks = parseDocumentBlocks(ocr);
    expect(blocks.get('fattura-a.pdf')).toContain('testo A');
    expect(blocks.get('ricevuta-b.pdf')).toContain('testo B');
  });

  it('should return empty map when no markers are present', () => {
    expect(parseDocumentBlocks('testo libero senza marker').size).toBe(0);
  });
});

describe('findDeclaredTotals', () => {
  it('should collect ALL declared totals, not just the first', () => {
    const text = 'TOTALE FATTURA 10.208,47\nACCONTO 9.408,47\nTOTALE DA PAGARE 800,00';
    const totals = findDeclaredTotals(text);
    expect(totals).toContain(10208.47);
    expect(totals).toContain(800.00);
    // ACCONTO non è un totale
    expect(totals).not.toContain(9408.47);
  });

  it('should find "da Pagare €" totals from handwritten-style receipts', () => {
    const totals = findDeclaredTotals('Bollo o IVA 22% 66,00\nda Pagare € 366,00');
    expect(totals).toContain(366.00);
  });
});

describe('reconcileExpenseItems — fusione per documento fiscale', () => {
  it('should merge IVA and bollo lines into the main line of the same document (riga unica lorda)', () => {
    // Il caso Invernizzi fittizio: 300 + IVA 66,50 (sbagliata dal LLM) + bollo
    // 2 dedotto — stesso documento, nessun numero ricevuta.
    const items = [
      makeItem({ description: 'Consulenza medico-legale', amount: 300, sourceDocument: 'ricevuta-cml.pdf', category: 'visite_specialistiche' }),
      makeItem({ description: 'IVA su consulenza medico-legale', amount: 66.5, sourceDocument: 'ricevuta-cml.pdf' }),
      makeItem({ description: 'Imposta di bollo su fattura consulenza', amount: 2, sourceDocument: 'ricevuta-cml.pdf' }),
    ];
    const ocr = '### DOCUMENTO: ricevuta-cml.pdf ###\nPrestazione di consulenza medico-legale 300,00\nBollo o IVA 22% 66,00\nda Pagare € 366,00\n### FINE DOCUMENTO ###';

    const result = reconcileExpenseItems(items, ocr);

    expect(result.items).toHaveLength(1);
    // Ancorato al totale documentato (366,00), NON alla somma LLM (368,50)
    expect(result.items[0].amount).toBe(366.00);
    expect(result.items[0].description).toBe('Consulenza medico-legale');
    expect(result.items[0].notes).toContain('IVA');
    expect(result.totalAmount).toBe(366.00);
  });

  it('should merge all chapters of the same invoice (same receiptNumber) into one gross line', () => {
    // Fattura ricovero fittizia con 4 capitoli + bollo, stesso numero fattura.
    const items = [
      makeItem({ description: 'Quota equipe chirurgica', amount: 6580, receiptNumber: '077/26', sourceDocument: 'fattura-saldo.pdf', category: 'interventi', date: '2026-05-28' }),
      makeItem({ description: 'Personale di supporto di reparto', amount: 385.5, receiptNumber: '077/26', sourceDocument: 'fattura-saldo.pdf', date: '2026-05-28' }),
      makeItem({ description: 'Oneri amministrativi', amount: 1188.37, receiptNumber: '077/26', sourceDocument: 'fattura-saldo.pdf', date: '2026-05-28' }),
      makeItem({ description: 'Quota DRG', amount: 2052.6, receiptNumber: '077/26', sourceDocument: 'fattura-saldo.pdf', date: '2026-05-28' }),
      makeItem({ description: 'Imposta di bollo su fattura ricovero', amount: 2, receiptNumber: '077/26', sourceDocument: 'fattura-saldo.pdf', date: '2026-05-28' }),
    ];
    const ocr = '### DOCUMENTO: fattura-saldo.pdf ###\nRICOVERO LP\nTOTALE FATTURA 10.208,47\nACCONTO 9.408,47\nTOTALE DA PAGARE 800,00\n### FINE DOCUMENTO ###';

    const result = reconcileExpenseItems(items, ocr);

    expect(result.items).toHaveLength(1);
    // Sceglie il totale documentato più VICINO alla somma (10.208,47, non 800,00)
    expect(result.items[0].amount).toBe(10208.47);
    expect(result.items[0].receiptNumber).toBe('077/26');
    // La voce principale è quella con l'importo maggiore
    expect(result.items[0].description).toContain('Quota equipe chirurgica');
    expect(result.items[0].notes).toContain('Oneri amministrativi');
  });

  it('should keep separate invoices in the same PDF as separate lines', () => {
    // Un PDF con 3 fatture di fisioterapia distinte (numeri diversi).
    const items = [
      makeItem({ description: 'Onorario FKT maggio', amount: 37, receiptNumber: '1167/2026', sourceDocument: 'fatture-fkt.pdf', date: '2026-05-12' }),
      makeItem({ description: 'Onorario FKT giugno (10 sedute)', amount: 825, receiptNumber: '1395/2026', sourceDocument: 'fatture-fkt.pdf', date: '2026-06-07' }),
      makeItem({ description: 'Imposta di bollo su fattura FKT giugno', amount: 2, receiptNumber: '1395/2026', sourceDocument: 'fatture-fkt.pdf', date: '2026-06-07' }),
      makeItem({ description: 'Onorario FKT luglio (3 sedute)', amount: 247.5, receiptNumber: '1953/2026', sourceDocument: 'fatture-fkt.pdf', date: '2026-07-31' }),
      makeItem({ description: 'Imposta di bollo su fattura FKT luglio', amount: 2, receiptNumber: '1953/2026', sourceDocument: 'fatture-fkt.pdf', date: '2026-07-31' }),
    ];

    const result = reconcileExpenseItems(items, '');

    expect(result.items).toHaveLength(3);
    const amounts = result.items.map((i) => i.amount).sort((a, b) => (a ?? 0) - (b ?? 0));
    expect(amounts).toEqual([37, 249.5, 827]);
    expect(result.totalAmount).toBeCloseTo(1113.5);
  });

  it('should merge multi-product pharmacy receipt into one line with detail in notes', () => {
    const items = [
      makeItem({ description: 'Ticket farmaci', amount: 4, receiptNumber: '0101-0007', sourceDocument: 'scontrino.pdf', category: 'farmaci', date: '2026-05-02' }),
      makeItem({ description: 'Farmaco A', amount: 4.5, receiptNumber: '0101-0007', sourceDocument: 'scontrino.pdf', category: 'farmaci', drugType: 'Farmaco A', date: '2026-05-02' }),
      makeItem({ description: 'Farmaco B', amount: 14.9, receiptNumber: '0101-0007', sourceDocument: 'scontrino.pdf', category: 'farmaci', drugType: 'Farmaco B', date: '2026-05-02' }),
      makeItem({ description: 'Dispositivo medico', amount: null, receiptNumber: '0101-0007', sourceDocument: 'scontrino.pdf', category: 'farmaci', date: '2026-05-02' }),
    ];

    const result = reconcileExpenseItems(items, '');

    expect(result.items).toHaveLength(1);
    expect(result.items[0].amount).toBeCloseTo(23.4);
    expect(result.items[0].notes).toContain('Farmaco A');
    expect(result.items[0].notes).toContain('senza importo');
  });

  it('should NOT merge fiscal lines when the document has multiple non-fiscal lines without receipt number (ambiguous)', () => {
    const items = [
      makeItem({ description: 'Visita specialistica', amount: 100, sourceDocument: 'doc-misto.pdf' }),
      makeItem({ description: 'RX polso', amount: 50, sourceDocument: 'doc-misto.pdf' }),
      makeItem({ description: 'IVA su prestazione', amount: 22, sourceDocument: 'doc-misto.pdf' }),
    ];

    const result = reconcileExpenseItems(items, '');

    // Ambiguo: a quale prestazione appartiene l'IVA? Non si fonde (resta visibile).
    expect(result.items).toHaveLength(3);
  });

  it('should NOT merge by receipt number when sourceDocument is missing (LLM pigro → rete disattivata, mai fusioni azzardate)', () => {
    const items = [
      makeItem({ description: 'Fattura A', amount: 100, receiptNumber: '162', sourceDocument: null }),
      makeItem({ description: 'Fattura B', amount: 200, receiptNumber: '162', sourceDocument: null }),
    ];

    const result = reconcileExpenseItems(items, '');

    expect(result.items).toHaveLength(2);
    expect(result.totalAmount).toBe(300);
  });

  it('should NOT merge items from different documents even with same receipt number', () => {
    const items = [
      makeItem({ description: 'Fattura studio A', amount: 100, receiptNumber: '162', sourceDocument: 'doc-a.pdf' }),
      makeItem({ description: 'Fattura studio B', amount: 200, receiptNumber: '162', sourceDocument: 'doc-b.pdf' }),
    ];

    const result = reconcileExpenseItems(items, '');

    expect(result.items).toHaveLength(2);
    expect(result.totalAmount).toBe(300);
  });

  it('should be a no-op on already-clean single items (idempotenza)', () => {
    const items = [
      makeItem({ description: 'Visita fisiatrica (totale con bollo)', amount: 102, receiptNumber: '01999/26', sourceDocument: 'fattura-visita.pdf', date: '2026-06-04' }),
      makeItem({ description: 'Trasporto in ambulanza', amount: 930.4, sourceDocument: 'ambulanza.pdf', date: '2026-04-01' }),
    ];

    const result = reconcileExpenseItems(items, '');

    expect(result.items).toHaveLength(2);
    expect(result.items[0].amount).toBe(930.4); // riordinato per data
    expect(result.items[1].amount).toBe(102);
    expect(result.totalAmount).toBeCloseTo(1032.4);
  });

  it('should NOT anchor a single (unmerged) item to a nearby declared total', () => {
    // L'ancoraggio vale solo per le voci FUSE: una voce singola legittima non
    // va "corretta" verso un totale che le somiglia per caso.
    const items = [
      makeItem({ description: 'Visita', amount: 101, sourceDocument: 'doc.pdf' }),
    ];
    const ocr = '### DOCUMENTO: doc.pdf ###\nTotale € 103,00\n### FINE DOCUMENTO ###';

    const result = reconcileExpenseItems(items, ocr);

    expect(result.items[0].amount).toBe(101);
  });

  it('should not anchor when no declared total is within tolerance', () => {
    const items = [
      makeItem({ description: 'Prestazione', amount: 300, receiptNumber: '9/26', sourceDocument: 'doc.pdf' }),
      makeItem({ description: 'IVA su prestazione', amount: 66, receiptNumber: '9/26', sourceDocument: 'doc.pdf' }),
    ];
    const ocr = '### DOCUMENTO: doc.pdf ###\nTotale € 999,00\n### FINE DOCUMENTO ###';

    const result = reconcileExpenseItems(items, ocr);

    expect(result.items).toHaveLength(1);
    expect(result.items[0].amount).toBe(366); // somma, nessun ancoraggio
  });

  it('should sort merged output by date and recompute total', () => {
    const items = [
      makeItem({ description: 'Terza', amount: 30, date: '2026-12-10' }),
      makeItem({ description: 'Prima', amount: 10, date: '2026-10-22' }),
      makeItem({ description: 'Seconda', amount: 20, date: '2026-11-15' }),
    ];

    const result = reconcileExpenseItems(items, '');

    expect(result.items.map((i) => i.description)).toEqual(['Prima', 'Seconda', 'Terza']);
    expect(result.totalAmount).toBe(60);
  });

  it('should handle empty input', () => {
    const result = reconcileExpenseItems([], '');
    expect(result.items).toHaveLength(0);
    expect(result.totalAmount).toBeNull();
  });

  describe('dedup acconto/saldo (F1 — esclusione trasparente, mai silenziosa)', () => {
    // Il caso reale sintetizzato: avviso di deposito cauzionale pagato prima
    // dell'intervento + fattura a saldo che dichiara "ACCONTO" già versato.
    const depositItem = makeItem({
      description: 'Deposito cauzionale intervento chirurgico',
      amount: 9410.47,
      receiptNumber: 'CNR2I 3010',
      sourceDocument: 'avviso-deposito.pdf',
      date: '2026-04-28',
      category: 'interventi',
    });
    const saldoItem = makeItem({
      description: 'Ricovero in libera professione',
      amount: 10208.47,
      receiptNumber: '077/26',
      sourceDocument: 'fattura-saldo.pdf',
      date: '2026-05-28',
      category: 'interventi',
    });
    const saldoOcr = '### DOCUMENTO: fattura-saldo.pdf ###\nRICOVERO LP\nTOTALE FATTURA 10.208,47\nACCONTO 9.408,47\nTOTALE DA PAGARE 800,00\n### FINE DOCUMENTO ###\n\n### DOCUMENTO: avviso-deposito.pdf ###\nDEPOSITO CAUZIONALE INTERVENTO LP\n9.410,47 Euro\n### FINE DOCUMENTO ###';

    it('should exclude the deposit from the total with a transparent reason when a saldo invoice declares the acconto', () => {
      const result = reconcileExpenseItems([depositItem, saldoItem], saldoOcr);

      expect(result.items).toHaveLength(2); // la riga NON sparisce mai
      const deposit = result.items.find((i) => i.description.includes('Deposito'));
      expect(deposit?.excludedFromTotal).toBe(true);
      expect(deposit?.exclusionReason).toContain('077/26');
      expect(deposit?.exclusionReason).toContain('acconto');
      // Totale: SOLO la fattura a saldo (il +9.410,47 fantasma del CASO-033)
      expect(result.totalAmount).toBe(10208.47);
    });

    it('should KEEP the deposit in the total when no saldo invoice declares a matching acconto', () => {
      // Deposito senza fattura a saldo documentata: è l'unica traccia della
      // spesa, resta contato.
      const result = reconcileExpenseItems([depositItem], '### DOCUMENTO: avviso-deposito.pdf ###\nDEPOSITO CAUZIONALE\n9.410,47 Euro\n### FINE DOCUMENTO ###');

      expect(result.items[0].excludedFromTotal).toBeFalsy();
      expect(result.totalAmount).toBe(9410.47);
    });

    it('should KEEP the deposit when the declared acconto differs by more than the tolerance', () => {
      const farOcr = saldoOcr.replace('ACCONTO 9.408,47', 'ACCONTO 9.000,00');
      const result = reconcileExpenseItems([depositItem, saldoItem], farOcr);

      const deposit = result.items.find((i) => i.description.includes('Deposito'));
      expect(deposit?.excludedFromTotal).toBeFalsy();
      expect(result.totalAmount).toBeCloseTo(9410.47 + 10208.47);
    });

    it('should KEEP the deposit when the declaring invoice has no extracted line item (conservativo)', () => {
      // L'OCR dichiara l'acconto ma il LLM non ha estratto la voce della
      // fattura a saldo: escludere il deposito lascerebbe il totale a zero.
      const result = reconcileExpenseItems([depositItem], saldoOcr);

      expect(result.items[0].excludedFromTotal).toBeFalsy();
      expect(result.totalAmount).toBe(9410.47);
    });

    it('should not flag ordinary items that merely mention acconto-like words in other documents', () => {
      const visitItem = makeItem({ description: 'Visita specialistica', amount: 150, sourceDocument: 'fattura-visita.pdf' });
      const result = reconcileExpenseItems([visitItem, saldoItem], saldoOcr);

      expect(result.items.every((i) => !i.excludedFromTotal)).toBe(true);
      expect(result.totalAmount).toBeCloseTo(150 + 10208.47);
    });

    it('should exclude at most ONE deposit per declared acconto (two identical deposits ≠ one declaration)', () => {
      const secondDeposit = makeItem({
        description: 'Acconto intervento (secondo versamento)',
        amount: 9410.47,
        sourceDocument: 'avviso-deposito-2.pdf',
        date: '2026-04-29',
      });
      const result = reconcileExpenseItems([depositItem, secondDeposit, saldoItem], saldoOcr);

      const excluded = result.items.filter((i) => i.excludedFromTotal);
      expect(excluded).toHaveLength(1);
      // Il secondo deposito resta contato: nessuna dichiarazione lo copre più.
      expect(result.totalAmount).toBeCloseTo(10208.47 + 9410.47);
    });

    it('should work after merging: saldo invoice split into chapters still hosts the exclusion', () => {
      // La fattura a saldo scorporata in capitoli (LLM vecchio stile) viene
      // prima FUSA (F2) e poi ospita comunque l'esclusione del deposito (F1).
      const chapters = [
        makeItem({ description: 'Quota equipe chirurgica', amount: 6580, receiptNumber: '077/26', sourceDocument: 'fattura-saldo.pdf', date: '2026-05-28' }),
        makeItem({ description: 'Oneri amministrativi', amount: 1188.37, receiptNumber: '077/26', sourceDocument: 'fattura-saldo.pdf', date: '2026-05-28' }),
        makeItem({ description: 'Quota DRG', amount: 2052.6, receiptNumber: '077/26', sourceDocument: 'fattura-saldo.pdf', date: '2026-05-28' }),
        makeItem({ description: 'Personale di supporto', amount: 385.5, receiptNumber: '077/26', sourceDocument: 'fattura-saldo.pdf', date: '2026-05-28' }),
        makeItem({ description: 'Imposta di bollo su fattura ricovero', amount: 2, receiptNumber: '077/26', sourceDocument: 'fattura-saldo.pdf', date: '2026-05-28' }),
      ];
      const result = reconcileExpenseItems([depositItem, ...chapters], saldoOcr);

      expect(result.items).toHaveLength(2);
      const deposit = result.items.find((i) => i.description.includes('Deposito'));
      expect(deposit?.excludedFromTotal).toBe(true);
      expect(result.totalAmount).toBe(10208.47);
    });
  });

  it('INVARIANTE SOLDI: senza ancoraggio, la fusione non altera mai il totale complessivo', () => {
    // Mix di gruppi fondibili, fiscali orfane e voci singole: la fusione sposta
    // importi DENTRO le righe, mai dentro/fuori dal totale.
    const items = [
      makeItem({ description: 'Prestazione X', amount: 500, receiptNumber: '1/26', sourceDocument: 'a.pdf' }),
      makeItem({ description: 'IVA su prestazione X', amount: 110, receiptNumber: '1/26', sourceDocument: 'a.pdf' }),
      makeItem({ description: 'Visita Y', amount: 80, sourceDocument: 'b.pdf' }),
      makeItem({ description: 'Imposta di bollo su fattura Y', amount: 2, sourceDocument: 'b.pdf' }),
      makeItem({ description: 'Trasporto', amount: 930.4, sourceDocument: 'c.pdf' }),
      makeItem({ description: 'Voce senza importo', amount: null, sourceDocument: 'd.pdf' }),
    ];
    const inputTotal = 500 + 110 + 80 + 2 + 930.4;

    const result = reconcileExpenseItems(items, ''); // nessun blocco OCR → nessun ancoraggio

    expect(result.totalAmount).toBeCloseTo(inputTotal, 2);
  });
});
