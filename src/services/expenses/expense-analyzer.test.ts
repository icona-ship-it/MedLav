import { describe, it, expect } from 'vitest';
import {
  analyzeExpenses,
  extractAmount,
  inferCategory,
} from './expense-analyzer';

// ---------------------------------------------------------------------------
// extractAmount
// ---------------------------------------------------------------------------

describe('extractAmount', () => {
  it('should extract "€ 150,00"', () => {
    expect(extractAmount('Visita ortopedica € 150,00')).toBe(150);
  });

  it('should extract "€150,00" without space', () => {
    expect(extractAmount('Farmaci €150,00')).toBe(150);
  });

  it('should extract "Euro 250,50"', () => {
    expect(extractAmount('Pagamento Euro 250,50')).toBe(250.5);
  });

  it('should extract "euro 1.500,00" with thousands separator', () => {
    expect(extractAmount('Intervento euro 1.500,00')).toBe(1500);
  });

  it('should extract "300,00 euro" (amount before currency)', () => {
    expect(extractAmount('Ticket 300,00 euro')).toBe(300);
  });

  it('should extract "45,50€" (no space before symbol)', () => {
    expect(extractAmount('Farmacia 45,50€')).toBe(45.5);
  });

  it('should extract "EUR 120,00"', () => {
    expect(extractAmount('Fattura EUR 120,00')).toBe(120);
  });

  it('should return null when no amount found', () => {
    expect(extractAmount('Visita di controllo ortopedica')).toBeNull();
  });

  it('should return null for empty string', () => {
    expect(extractAmount('')).toBeNull();
  });

  it('should return null for null/undefined input', () => {
    expect(extractAmount(null as unknown as string)).toBeNull();
    expect(extractAmount(undefined as unknown as string)).toBeNull();
  });

  it('should handle "€ 2.350,00" large amount', () => {
    expect(extractAmount('Chirurgia € 2.350,00')).toBe(2350);
  });
});

// ---------------------------------------------------------------------------
// inferCategory
// ---------------------------------------------------------------------------

describe('inferCategory', () => {
  it('should map event_type "intervento" to "interventi"', () => {
    expect(inferCategory('intervento', 'Artroscopia', '')).toBe('interventi');
  });

  it('should map event_type "esame" to "esami_diagnostici"', () => {
    expect(inferCategory('esame', 'RX ginocchio', '')).toBe('esami_diagnostici');
  });

  it('should map event_type "visita" to "visite_specialistiche"', () => {
    expect(inferCategory('visita', 'Controllo', '')).toBe('visite_specialistiche');
  });

  it('should map event_type "prescrizione" to "farmaci"', () => {
    expect(inferCategory('prescrizione', 'Ricetta', '')).toBe('farmaci');
  });

  it('should detect "farmacia" keyword in description', () => {
    expect(inferCategory('spesa_medica', 'Acquisto', 'scontrino farmacia')).toBe('farmaci');
  });

  it('should detect "fisioterapia" as riabilitazione', () => {
    expect(inferCategory('altro', 'Ciclo fisioterapia', '')).toBe('riabilitazione');
  });

  it('should detect "tutore" as ausili_protesi', () => {
    expect(inferCategory('altro', 'Acquisto tutore ginocchio', '')).toBe('ausili_protesi');
  });

  it('should detect "ambulanza" as trasporti', () => {
    expect(inferCategory('altro', 'Trasporto ambulanza', '')).toBe('trasporti');
  });

  it('should fallback to "altro" when no match', () => {
    expect(inferCategory('altro', 'Spesa generica', 'varie')).toBe('altro');
  });
});

// ---------------------------------------------------------------------------
// analyzeExpenses
// ---------------------------------------------------------------------------

describe('analyzeExpenses', () => {
  function makeEvent(overrides: Partial<{
    event_type: string;
    title: string;
    description: string;
    event_date: string;
    facility: string | null;
    source_type: string;
  }> = {}) {
    return {
      event_type: 'spesa_medica',
      title: 'Spesa generica',
      description: '',
      event_date: '2024-06-15',
      facility: null,
      source_type: 'altro',
      ...overrides,
    };
  }

  it('should return empty result for empty array', () => {
    const result = analyzeExpenses([]);
    expect(result.totalItems).toBe(0);
    expect(result.totalAmount).toBeNull();
    expect(result.items).toEqual([]);
  });

  it('should return empty result for null input', () => {
    const result = analyzeExpenses(null as unknown as []);
    expect(result.totalItems).toBe(0);
  });

  it('should categorize and count items correctly', () => {
    const events = [
      makeEvent({ event_type: 'visita', title: 'Visita ortopedica € 120,00' }),
      makeEvent({ event_type: 'esame', title: 'RX ginocchio € 45,00' }),
      makeEvent({ event_type: 'visita', title: 'Visita neurologica € 150,00' }),
    ];

    const result = analyzeExpenses(events);

    expect(result.totalItems).toBe(3);
    expect(result.totalsByCategory.visite_specialistiche.count).toBe(2);
    expect(result.totalsByCategory.esami_diagnostici.count).toBe(1);
  });

  it('should sum amounts within a category', () => {
    const events = [
      makeEvent({ event_type: 'visita', title: 'Visita € 100,00' }),
      makeEvent({ event_type: 'visita', title: 'Controllo € 80,00' }),
    ];

    const result = analyzeExpenses(events);
    expect(result.totalsByCategory.visite_specialistiche.total).toBe(180);
    expect(result.totalAmount).toBe(180);
  });

  it('should handle items without amounts', () => {
    const events = [
      makeEvent({ event_type: 'visita', title: 'Visita di controllo' }),
    ];

    const result = analyzeExpenses(events);
    expect(result.totalItems).toBe(1);
    expect(result.totalsByCategory.visite_specialistiche.count).toBe(1);
    expect(result.totalsByCategory.visite_specialistiche.total).toBeNull();
    expect(result.totalAmount).toBeNull();
  });

  it('should mix items with and without amounts', () => {
    const events = [
      makeEvent({ event_type: 'visita', title: 'Visita € 100,00' }),
      makeEvent({ event_type: 'visita', title: 'Controllo senza importo' }),
    ];

    const result = analyzeExpenses(events);
    expect(result.totalAmount).toBe(100);
    expect(result.totalsByCategory.visite_specialistiche.total).toBe(100);
    expect(result.summary).toContain('1 voce non presenta');
  });

  it('should sort items by date', () => {
    const events = [
      makeEvent({ event_date: '2024-06-20', title: 'Seconda' }),
      makeEvent({ event_date: '2024-01-10', title: 'Prima' }),
      makeEvent({ event_date: '2024-12-01', title: 'Terza' }),
    ];

    const result = analyzeExpenses(events);
    expect(result.items[0].description).toBe('Prima');
    expect(result.items[1].description).toBe('Seconda');
    expect(result.items[2].description).toBe('Terza');
  });

  it('should extract amount from description when not in title', () => {
    const events = [
      makeEvent({
        event_type: 'visita',
        title: 'Visita specialistica',
        description: 'Pagamento € 200,00 in contanti',
      }),
    ];

    const result = analyzeExpenses(events);
    expect(result.items[0].amount).toBe(200);
  });

  it('should prefer title amount over description amount', () => {
    const events = [
      makeEvent({
        event_type: 'visita',
        title: 'Visita € 150,00',
        description: 'Costo previsto € 200,00',
      }),
    ];

    const result = analyzeExpenses(events);
    expect(result.items[0].amount).toBe(150);
  });

  it('should include facility in items', () => {
    const events = [
      makeEvent({ facility: 'Ospedale Civile di Brescia', title: 'Visita' }),
    ];

    const result = analyzeExpenses(events);
    expect(result.items[0].facility).toBe('Ospedale Civile di Brescia');
  });

  it('should generate summary with totals', () => {
    const events = [
      makeEvent({ event_type: 'visita', title: 'Visita € 100,00' }),
      makeEvent({ event_type: 'esame', title: 'RX € 50,00' }),
    ];

    const result = analyzeExpenses(events);
    expect(result.summary).toContain('2 voci di spesa');
    expect(result.summary).toContain('Visite specialistiche');
    expect(result.summary).toContain('Esami diagnostici');
  });

  it('should handle large number of events', () => {
    const events = Array.from({ length: 100 }, (_, i) =>
      makeEvent({ event_type: 'visita', title: `Visita ${i} € ${(i + 1) * 10},00`, event_date: `2024-${String(Math.floor(i / 10) + 1).padStart(2, '0')}-15` }),
    );

    const result = analyzeExpenses(events);
    expect(result.totalItems).toBe(100);
    expect(result.totalAmount).toBe(50500); // sum of 10+20+...+1000
  });

  it('should produce valid result shape with all category keys', () => {
    const result = analyzeExpenses([makeEvent()]);
    const expectedCategories = [
      'farmaci', 'visite_specialistiche', 'esami_diagnostici', 'interventi',
      'riabilitazione', 'ausili_protesi', 'trasporti', 'altro',
    ];
    for (const cat of expectedCategories) {
      expect(result.totalsByCategory).toHaveProperty(cat);
    }
  });
});
