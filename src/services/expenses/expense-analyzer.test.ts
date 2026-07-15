import { describe, it, expect } from 'vitest';
import {
  analyzeExpenses,
  extractAmount,
  inferCategory,
  isSsrCostNotification,
  collectSsnCosts,
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

describe('QA 2026-06-11 — dedup voci di spesa (PDF caricato due volte)', () => {
  function makeExpense(overrides: Partial<{ title: string; description: string; event_date: string; facility: string | null }> = {}) {
    return {
      event_type: 'spesa_medica',
      title: 'Fattura visita ortopedica € 150,00',
      description: 'Fattura n. 42/2024 per visita specialistica, importo 150,00 euro',
      event_date: '2024-06-15',
      facility: 'Studio Medico',
      source_type: 'altro',
      ...overrides,
    };
  }

  it('should count the same expense once when extracted from duplicate documents', () => {
    const result = analyzeExpenses([makeExpense(), makeExpense()]);
    expect(result.totalItems).toBe(1);
  });

  it('should keep genuinely different expenses (different date or amount)', () => {
    const result = analyzeExpenses([
      makeExpense(),
      makeExpense({ event_date: '2024-07-01', title: 'Fattura visita di controllo € 80,00', description: 'Fattura n. 51/2024, importo 80,00 euro' }),
    ]);
    expect(result.totalItems).toBe(2);
  });
});

describe('fix Bigon — parser US + esclusione notifiche SSR', () => {
  it('extractAmount riconosce il formato anglosassone "euro 1,038.80"', () => {
    expect(extractAmount('Prestazione euro 1,038.80')).toBeCloseTo(1038.8, 2);
    expect(extractAmount('Intervento euro 1.038,80')).toBeCloseTo(1038.8, 2);
  });

  it('isSsrCostNotification riconosce le notifiche-costo a carico del SSN/SSR', () => {
    expect(isSsrCostNotification('Prestazione', 'il SSR ha impiegato euro 1.038,80')).toBe(true);
    expect(isSsrCostNotification('Ricovero a carico del SSN')).toBe(true);
    expect(isSsrCostNotification('Fattura fisioterapia', 'euro 450,00 pagati dal paziente')).toBe(false);
    expect(isSsrCostNotification('Ticket € 36,15')).toBe(false);
  });

  it('isSsrCostNotification: ordine INVERTITO "costo sostenuto dal SSR" (CASO-2026-220)', () => {
    // La description usa l'ordine invertito, il source_text quello diretto: entrambi vanno beccati.
    expect(isSsrCostNotification(
      'Spesa sanitaria per percorso di cura',
      'Informazione amministrativa relativa al costo del percorso di cura sostenuto dal Servizio Sanitario Regionale: euro 27,90',
    )).toBe(true);
    expect(isSsrCostNotification(
      'Spesa sanitaria per percorso di cura',
      'costo del percorso di cura',
      'il Servizio Sanitario Regionale ha impiegato euro 27.90 per il Suo percorso di cura.',
    )).toBe(true);
    // Una spesa VERA del paziente non deve essere esclusa dal nuovo pattern invertito.
    expect(isSsrCostNotification(
      'Visita fisiatrica', 'euro 120,00 sostenuti dalla paziente presso studio privato',
    )).toBe(false);
  });

  it('analyzeExpenses ESCLUDE le notifiche SSR dal totale risarcibile', () => {
    const ev = (o: Record<string, unknown>) => ({
      event_type: 'spesa_medica', title: '', description: '', event_date: '2024-06-15',
      facility: null, source_type: 'spese_mediche', ...o,
    });
    const result = analyzeExpenses([
      ev({ title: 'Costo ricovero', description: 'il SSR ha impiegato euro 50.000,00' }),
      ev({ title: 'Ticket fisioterapia € 36,15' }),
    ]);
    expect(result.totalItems).toBe(1);
    expect(result.totalAmount).toBeCloseTo(36.15, 2);
  });
});

describe('extractAmount — valuta ISO dopo il numero (bug Antoniazzi 2026-07-05)', () => {
  it('parsa "Importo: 50,00 EUR" (formato dei documenti commerciali reali)', () => {
    expect(extractAmount('Prestazione radiografica. Importo: 50,00 EUR. Fattura n. 26878/2025/T')).toBe(50);
  });

  it('parsa "160,00 EUR" e "4,00 EUR"', () => {
    expect(extractAmount('RM eseguita. Importo: 160,00 EUR. Esente IVA')).toBe(160);
    expect(extractAmount('importo IVA: 4,00 EUR, inclusa nel totale')).toBe(4);
  });

  it('parsa il formato migliaia italiano prima di EUR', () => {
    expect(extractAmount('Totale 1.500,00 EUR')).toBe(1500);
  });

  it('non si fa ingannare da EUR senza numero attaccato', () => {
    expect(extractAmount('pagamento in EUR con carta')).toBeNull();
  });
});

describe('analyzeExpenses — componenti fiscali non sono voci di spesa (gold: solo prestazioni)', () => {
  const base = { event_type: 'spesa_medica', event_date: '2025-09-13', facility: 'X', source_type: 'altro' };

  it('esclude la riga IVA quando è componente inclusa nel totale di un\'altra voce', () => {
    const result = analyzeExpenses([
      { ...base, title: 'Acquisto tutore articolato', description: 'Importo della prestazione: 100,00 EUR + IVA 4% (4,00 EUR) per un totale di 120,00 EUR.' },
      { ...base, title: 'IVA 4% su tutore articolato', description: "IVA al 4% applicata sull'acquisto del tutore (importo IVA: 4,00 EUR, inclusa nel totale di 120,00 EUR)." },
    ]);
    expect(result.items).toHaveLength(1);
    expect(result.items[0].description).toContain('tutore');
    expect(result.items[0].amount).toBe(120);
    expect(result.totalAmount).toBe(120);
  });

  it('esclude l\'imposta di bollo come voce autonoma', () => {
    const result = analyzeExpenses([
      { ...base, title: 'RM gomito destro', description: 'Importo: 160,00 EUR. Fattura n. 23102/2025/D.' },
      { ...base, title: 'Imposta di bollo', description: 'Imposta di bollo di 2,00 EUR applicata sulla fattura n. 23102/2025/D.' },
    ]);
    expect(result.items).toHaveLength(1);
    expect(result.totalAmount).toBe(160);
  });

  it('NON esclude una prestazione vera che cita l\'IVA nella descrizione', () => {
    const result = analyzeExpenses([
      { ...base, title: 'Visita fisiatrica', description: 'Importo: 90,00 EUR, esente IVA ex art. 10.' },
    ]);
    expect(result.items).toHaveLength(1);
    expect(result.totalAmount).toBe(90);
  });
});

describe('isSsrCostNotification — costi SSR a forma estesa (bug Bigon 2026-07-05)', () => {
  const base = { event_type: 'spesa_medica', event_date: '2024-11-13', facility: 'AOUI', source_type: 'altro' };

  it('esclude "Il Servizio Sanitario Regionale ha impiegato euro X"', () => {
    const r = analyzeExpenses([
      { ...base, title: 'Costo procedura radiologica TC', description: 'Il Servizio Sanitario Regionale ha impiegato euro 521.35 per il percorso di cura.' },
    ]);
    expect(r.items).toHaveLength(0);
    expect(r.totalAmount).toBeNull();
  });

  it('esclude "Il Servizio Sanitario Regionale ha impegnato euro X" (impegnato con N)', () => {
    const r = analyzeExpenses([
      { ...base, title: 'Spesa sanitaria per episodio di Pronto Soccorso', description: 'Il Servizio Sanitario Regionale ha impegnato euro 2.085,90 per il percorso di cura relativo all\'episodio di Pronto Soccorso.' },
      { ...base, title: 'Spesa sanitaria per percorso di cura in Pronto Soccorso', description: 'Il Servizio Sanitario Regionale ha impegnato 2.085,90 Euro per il percorso di cura della paziente presso il Pronto Soccorso.' },
    ]);
    expect(r.items).toHaveLength(0);
  });

  it('esclude tutte le 7 voci SSR di Bigon → tabella spese vuota (come il gold)', () => {
    const bigon = [
      'Il Servizio Sanitario Regionale ha impiegato euro 521.35 per il percorso di cura.',
      'Il Servizio Sanitario Regionale ha impiegato euro 279,00 per le prestazioni radiologiche.',
      'Il Servizio Sanitario Regionale ha impegnato euro 1.038,80 per il percorso di cura.',
      'Il Servizio Sanitario Regionale ha impegnato euro 2.085,90 per il percorso di cura.',
      'Il Servizio Sanitario Regionale ha impegnato 2.085,90 Euro per il percorso di cura.',
      'Il Servizio Sanitario Regionale ha impiegato euro 54,35 per il percorso di cura durante il ricovero.',
    ].map((d, i) => ({ ...base, title: `Spesa sanitaria ${i}`, description: d }));
    const r = analyzeExpenses(bigon);
    expect(r.items).toHaveLength(0);
    expect(r.totalAmount).toBeNull();
  });

  it('NON esclude una spesa out-of-pocket vera (Antoniazzi: pagata dal danneggiato)', () => {
    const r = analyzeExpenses([
      { ...base, title: 'RX gomito destro', description: 'Prestazione radiografica. Importo: 50,00 EUR. Fattura n. 26878, pagamento tramite Bancomat.' },
    ]);
    expect(r.items).toHaveLength(1);
    expect(r.totalAmount).toBe(50);
  });
});

describe('collectSsnCosts — tabella separata costi SSN', () => {
  const ev = (o: Record<string, unknown>) => ({
    event_type: 'spesa_medica', title: '', description: '', event_date: '2024-06-15',
    facility: null, source_type: 'spese_mediche', ...o,
  });
  it('raccoglie i costi SSN (esclusi dalle spese danneggiato) col totale', () => {
    const r = collectSsnCosts([
      ev({ title: 'Costo A', description: 'il SSR ha impiegato euro 521,35' }),
      ev({ title: 'Ticket fisioterapia € 36,15' }), // spesa danneggiato → NON qui
      ev({ title: 'Costo B', source_text: 'il Servizio Sanitario Regionale ha impiegato euro 279,00' }),
    ]);
    expect(r.items).toHaveLength(2);
    expect(r.total).toBeCloseTo(800.35, 2);
  });
  it('nessun costo SSN → lista vuota, totale null', () => {
    const r = collectSsnCosts([ev({ title: 'Ticket € 36,15' })]);
    expect(r.items).toHaveLength(0);
    expect(r.total).toBeNull();
  });
});
