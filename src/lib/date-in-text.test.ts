import { describe, it, expect } from 'vitest';
import { dateAppearsInText, dateTextVariants, textHasAnyFullDate } from './date-in-text';

describe('dateAppearsInText — la data della voce deve esistere nel documento (F8, feedback 2026-08-19)', () => {
  it('riconosce i formati italiani comuni, con o senza zeri, con mese in lettere e abbreviato', () => {
    for (const t of ['Verona, 18/10/2025', 'del 18.10.2025', 'data 18-10-25', 'in data 18 ottobre 2025', 'il 18 ott. 2025', 'emessa 2025-10-18', 'ricevuta n. 4 del 18/10/2025 ore 10:30']) {
      expect(dateAppearsInText('2025-10-18', t), t).toBe(true);
    }
    expect(dateAppearsInText('2025-10-08', 'Verona, 8/10/2025')).toBe(true);
  });
  it('NON confonde: 28.04.2025 non c\'è in un documento di ottobre; 18/10/2025 non è 18/10/2024; 1/10 non è 11/10', () => {
    expect(dateAppearsInText('2025-04-28', 'Ricevuta del 18/10/2025 — consulenza medico legale')).toBe(false);
    expect(dateAppearsInText('2024-10-18', 'Ricevuta del 18/10/2025')).toBe(false);
    expect(dateAppearsInText('2025-10-01', 'Ricevuta del 11/10/2025')).toBe(false);
    expect(dateAppearsInText('2025-10-18', 'prot. 118/10/2025')).toBe(false);
  });
  it('date parziali: mese/anno e solo anno; vuoto o testo vuoto → null (nessun giudizio)', () => {
    expect(dateAppearsInText('2025-10', 'ottobre 2025')).toBe(true);
    expect(dateAppearsInText('2025-10', 'del 10/2025')).toBe(true);
    expect(dateAppearsInText('2025', 'anno 2025')).toBe(true);
    expect(dateAppearsInText('', 'testo')).toBeNull();
    expect(dateAppearsInText('2025-10-18', '')).toBeNull();
    expect(dateAppearsInText('data sconosciuta', 'testo')).toBeNull();
    expect(dateTextVariants('2025-13-01')).toEqual([]);
  });
  it('textHasAnyFullDate', () => {
    expect(textHasAnyFullDate('Fattura n. 12 del 03/05/2026')).toBe(true);
    expect(textHasAnyFullDate('Fattura n. 12, importo 120,00')).toBe(false);
  });
});
