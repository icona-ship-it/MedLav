import { describe, it, expect } from 'vitest';
import { hasFiscalSignal } from './fiscal-signal';

describe('hasFiscalSignal', () => {
  it('storico di sedute senza importi → nessun segnale fiscale', () => {
    expect(hasFiscalSignal('CENTRO FISIOTERAPICO ESEMPI S.R.L. - STORICO APPUNTAMENTI\n1 Seduta di riabilitazione fisiochinesiterapia (90 minuti) del 15/05/2026 15:30\n2 Trattamento manuale del 19/05/2026 13:45')).toBe(false);
  });
  it('fattura, importo con decimali, euro, IVA, scontrino → segnale', () => {
    for (const t of ['FATTURA N. 12/2026', 'Totale 120,00', 'euro 45', '€ 30', 'IVA 22%', 'Scontrino fiscale', 'Ricevuta sanitaria', 'importo pagato']) {
      expect(hasFiscalSignal(t), t).toBe(true);
    }
  });
  it('«Totale sedute: 7» non è un segnale fiscale; «Totale 120.00» e «Imp. 45.50» sì', () => {
    expect(hasFiscalSignal('STORICO SEDUTE — Totale sedute: 7 — dal 15/05 al 05/06')).toBe(false);
    expect(hasFiscalSignal('Importo prestazioni: vedi allegato')).toBe(false);
    expect(hasFiscalSignal('Totale 120.00')).toBe(true);
    expect(hasFiscalSignal('Imp. 45.50 CHF')).toBe(true);
  });
  it('un referto con date e orari ma senza importi → nessun segnale', () => {
    expect(hasFiscalSignal('Visita del 22.05.2026 ore 10:40, prot. AMB/2026/00417. Si programma RM il 18.06.2026.')).toBe(false);
    expect(hasFiscalSignal(null)).toBe(false);
  });
});
