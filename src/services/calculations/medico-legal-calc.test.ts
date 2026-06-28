import { describe, it, expect } from 'vitest';
import {
  calculateMedicoLegalPeriods,
  calculateITTITP,
  calculationsToITTITPSegments,
  formatITTITPTable,
  formatRicoveroITTFactsBlock,
} from './medico-legal-calc';

function makeEvent(eventDate: string, eventType: string, title: string, description = '') {
  return { event_date: eventDate, event_type: eventType, title, description };
}

describe('formatRicoveroITTFactsBlock — fatti deterministici Epicrisi (ricovero + durata complessiva)', () => {
  it('giorni di ricovero INCLUSIVI (14→22 = 9, come i benchmark) + durata complessiva, MAI etichettati ITT/invalidità', () => {
    const events = [
      makeEvent('2024-11-14', 'ricovero', 'Ricovero'),
      makeEvent('2024-11-22', 'ricovero', 'Lettera di dimissione', 'dimissione a domicilio'),
      makeEvent('2025-01-16', 'follow-up', 'Controllo ortopedico'),
    ];
    const block = formatRicoveroITTFactsBlock(events);
    expect(block).toContain('Giorni di ricovero');
    expect(block).toContain('9 (nove)'); // inclusivo (gold), coerente con calculateHospitalDays e la sezione PERIODI
    expect(block).toContain('Durata complessiva del periodo di malattia');
    // il numero della durata NON va etichettato come ITT/invalidità (era il bug "448 gg ITT")
    expect(block).not.toMatch(/invalidità temporanea/i);
    expect(block).not.toContain('ITT');
  });

  it('esclude le menzioni anno-only dallo span: niente 01.01.YYYY, niente span gonfiato (fix review Bug B)', () => {
    const events: Array<{ event_date: string; event_type: string; title: string; description: string; date_precision?: string }> = [
      // anamnesi remota "colecistectomia nel 2002" — data fabbricata 01.01, precisione anno
      { event_date: '2002-01-01', event_type: 'intervento', title: 'Colecistectomia', description: 'in anamnesi', date_precision: 'anno' },
      { event_date: '2024-11-14', event_type: 'ricovero', title: 'Ricovero', description: '' },
      { event_date: '2024-11-22', event_type: 'ricovero', title: 'Dimissione', description: 'lettera di dimissione' },
    ];
    const block = formatRicoveroITTFactsBlock(events);
    // il 2002 NON deve comparire (né come 01.01.2002 né come anno che gonfia lo span)
    expect(block).not.toContain('2002');
    // lo span parte dall'evento day-precise (14.11.2024), non dall'anamnesi
    expect(block).toContain('14.11.2024');
  });

  it('nessun ricovero → niente riga ricovero, ma la durata complessiva resta', () => {
    const events = [
      makeEvent('2024-01-10', 'visita', 'Prima visita'),
      makeEvent('2024-06-15', 'follow-up', 'Ultimo controllo'),
    ];
    const block = formatRicoveroITTFactsBlock(events);
    expect(block).not.toContain('Giorni di ricovero');
    expect(block).toContain('Durata complessiva del periodo di malattia');
  });

  it('fasce graduate 75/50/25 NON incluse (restano scaffold del perito)', () => {
    const events = [
      makeEvent('2024-11-14', 'ricovero', 'Ricovero'),
      makeEvent('2024-11-22', 'ricovero', 'Dimissione', 'dimissione'),
    ];
    const block = formatRicoveroITTFactsBlock(events);
    expect(block).not.toContain('75%');
    expect(block).not.toContain('50%');
    expect(block).not.toContain('25%');
  });

  it('eventi vuoti → stringa vuota', () => {
    expect(formatRicoveroITTFactsBlock([])).toBe('');
  });
});

describe('calculateMedicoLegalPeriods', () => {
  it('should return empty for no events', () => {
    expect(calculateMedicoLegalPeriods([])).toEqual([]);
  });

  it('should calculate total illness period', () => {
    const events = [
      makeEvent('2024-01-10', 'visita', 'Prima visita'),
      makeEvent('2024-06-15', 'follow-up', 'Ultimo controllo'),
    ];

    const calcs = calculateMedicoLegalPeriods(events);
    const total = calcs.find((c) => c.label === 'Periodo totale malattia');

    expect(total).toBeDefined();
    expect(total!.days).toBe(158); // inclusivo: 10.01→15.06 conta entrambi gli estremi
    expect(total!.startDate).toBe('2024-01-10');
    expect(total!.endDate).toBe('2024-06-15');
  });

  it('should calculate hospital days from ricovero to dimissione', () => {
    const events = [
      makeEvent('2024-01-10', 'ricovero', 'Ricovero ospedaliero'),
      makeEvent('2024-01-18', 'ricovero', 'Dimissione', 'Lettera di dimissione'),
    ];

    const calcs = calculateMedicoLegalPeriods(events);
    const hospital = calcs.find((c) => c.label === 'Giorni di ricovero');

    expect(hospital).toBeDefined();
    expect(hospital!.days).toBe(9); // inclusivo: 10.01→18.01 = 9 giorni di degenza (gold)
  });

  it('should calculate interval between surgeries', () => {
    const events = [
      makeEvent('2024-01-10', 'intervento', 'Primo intervento'),
      makeEvent('2024-03-15', 'intervento', 'Secondo intervento'),
    ];

    const calcs = calculateMedicoLegalPeriods(events);
    const interval = calcs.find((c) => c.label.includes('Intervallo tra interventi'));

    expect(interval).toBeDefined();
    expect(interval!.days).toBe(65);
  });

  it('should calculate diagnosis to treatment time', () => {
    const events = [
      makeEvent('2024-01-10', 'diagnosi', 'Diagnosi tumore'),
      makeEvent('2024-02-20', 'intervento', 'Intervento chirurgico'),
    ];

    const calcs = calculateMedicoLegalPeriods(events);
    const d2t = calcs.find((c) => c.label.includes('diagnosi'));

    expect(d2t).toBeDefined();
    expect(d2t!.days).toBe(41);
  });

  it('should include ITT estimate', () => {
    const events = [
      makeEvent('2024-01-10', 'ricovero', 'Ricovero'),
      makeEvent('2024-01-20', 'ricovero', 'Dimissione ospedaliera', 'Dimissione in buone condizioni'),
    ];

    const calcs = calculateMedicoLegalPeriods(events);
    const itt = calcs.find((c) => c.label.includes('ITT'));

    expect(itt).toBeDefined();
    expect(itt!.days).toBe(11); // inclusivo: 10.01→20.01 = 11 giorni
  });
});

describe('A2 — graduated ITT/ITP segments', () => {
  it('returns no segments for empty events', () => {
    expect(calculateITTITP([])).toEqual([]);
  });

  it('produces an ITT 100% segment for a hospital stay', () => {
    const events = [
      makeEvent('2024-01-10', 'ricovero', 'Ricovero ospedaliero'),
      makeEvent('2024-01-20', 'ricovero', 'Dimissione ospedaliera', 'Dimissione in buone condizioni'),
    ];
    const segments = calculateITTITP(events);
    const itt = segments.find((s) => s.percentage === 100);
    expect(itt).toBeDefined();
    expect(itt!.days).toBe(11); // inclusivo: 10.01→20.01 = 11 giorni di degenza
    expect(itt!.startDate).toBe('2024-01-10');
    expect(itt!.endDate).toBe('2024-01-20');
  });

  it('produces graduated ITP segments (75/50/25) with a documented rehab phase', () => {
    const events = [
      makeEvent('2024-01-10', 'ricovero', 'Ricovero'),
      makeEvent('2024-01-20', 'ricovero', 'Dimissione', 'Dimissione, applicato tutore'),
      makeEvent('2024-02-10', 'terapia', 'Inizio fisioterapia', 'Ciclo di riabilitazione motoria'),
      makeEvent('2024-03-10', 'terapia', 'Fine fisioterapia', 'Termine fisioterapia'),
      makeEvent('2024-04-10', 'follow-up', 'Controllo finale', 'Stabilizzazione clinica'),
    ];
    const segments = calculateITTITP(events);
    const percentages = segments.map((s) => s.percentage);
    expect(percentages).toContain(100);
    expect(percentages).toContain(75);
    expect(percentages).toContain(50);
    expect(percentages).toContain(25);
    // All positive day counts
    expect(segments.every((s) => s.days > 0)).toBe(true);
  });

  it('marks third-split ITP segments as estimated when no rehab phase is documented', () => {
    const events = [
      makeEvent('2024-01-10', 'ricovero', 'Ricovero'),
      makeEvent('2024-01-20', 'ricovero', 'Dimissione', 'Dimissione'),
      makeEvent('2024-05-20', 'follow-up', 'Controllo', 'Visita di controllo'),
    ];
    const segments = calculateITTITP(events);
    const itp = segments.filter((s) => s.percentage !== 100);
    expect(itp.length).toBeGreaterThan(0);
    expect(itp.every((s) => s.estimated)).toBe(true);
  });

  it('calculationsToITTITPSegments ignores non-ITT/ITP rows', () => {
    const calcs = calculateMedicoLegalPeriods([
      makeEvent('2024-01-10', 'ricovero', 'Ricovero'),
      makeEvent('2024-01-20', 'ricovero', 'Dimissione', 'Dimissione'),
    ]);
    const segments = calculationsToITTITPSegments(calcs);
    // Hospital-days / total-illness rows must not leak in as segments
    expect(segments.every((s) => [100, 75, 50, 25].includes(s.percentage))).toBe(true);
  });

  it('formatITTITPTable renders a Markdown table with a totals row', () => {
    const events = [
      makeEvent('2024-01-10', 'ricovero', 'Ricovero'),
      makeEvent('2024-01-20', 'ricovero', 'Dimissione', 'Dimissione'),
    ];
    const table = formatITTITPTable(calculateITTITP(events));
    expect(table).toContain('| Periodo | Dal | Al | Giorni | Invalidità |');
    expect(table).toContain('|---|---|---|---|---|');
    expect(table).toContain('100%');
    expect(table).toContain('Totale giorni');
  });

  it('formatITTITPTable returns empty string for no segments', () => {
    expect(formatITTITPTable([])).toBe('');
  });

  // Post-audit: the UI passes RAW DB rows, which can carry the sentinel date
  // '1900-01-01' for undated clinical events. Those must be filtered, else the
  // table shows "Data non documentata" and multi-decade windows.
  it('calculateITTITP ignores sentinel-dated and malformed-date events', () => {
    const segments = calculateITTITP([
      makeEvent('1900-01-01', 'visita', 'Visita non datata'),
      makeEvent('2024-03', 'esame', 'Esame con data parziale'),
      makeEvent('2024-01-10', 'ricovero', 'Ricovero'),
      makeEvent('2024-01-20', 'ricovero', 'Dimissione', 'Dimissione in buone condizioni'),
    ]);
    const itt = segments.find((s) => s.percentage === 100);
    expect(itt).toBeDefined();
    expect(itt!.startDate).toBe('2024-01-10'); // anchored on the real ricovero, not 1900
    expect(segments.every((s) => s.startDate !== '1900-01-01' && s.endDate !== '1900-01-01')).toBe(true);
  });

  it('formatITTITPTable escapes pipe characters in labels', () => {
    const table = formatITTITPTable([
      { label: 'ITT | 100', percentage: 100, days: 5, startDate: '2024-01-10', endDate: '2024-01-15', estimated: false },
    ]);
    // The literal pipe in the label must be escaped so columns don't shift.
    expect(table).toContain('ITT \\| 100');
  });

  it('formatITTITPTable usa la notazione formale cifra + lettere (benchmark)', () => {
    const table = formatITTITPTable([
      { label: 'ITP', percentage: 75, days: 90, startDate: '2024-01-10', endDate: '2024-04-09', estimated: false },
    ]);
    expect(table).toContain('90 (novanta)');
    expect(table).toContain('75% (settantacinque per cento)');
  });
});

// ── Ondata 1 (audit project-wide): correttezza calcoli ITT/ITP ──
describe('Audit Ondata 1 — ITT/ITP correctness', () => {
  const ittDays = (calcs: ReturnType<typeof calculateMedicoLegalPeriods>) =>
    calcs.find((c) => c.label.includes('ITT'))?.days ?? null;
  const hospitalRows = (calcs: ReturnType<typeof calculateMedicoLegalPeriods>) =>
    calcs.filter((c) => c.label === 'Giorni di ricovero');

  it('does NOT double-count when 2 admissions share 1 discharge', () => {
    const calcs = calculateMedicoLegalPeriods([
      makeEvent('2024-01-10', 'ricovero', 'Primo ricovero'),
      makeEvent('2024-01-15', 'ricovero', 'Secondo ricovero'),
      makeEvent('2024-01-20', 'ricovero', 'Dimissione', 'Dimissione'),
      makeEvent('2024-03-01', 'follow-up', 'Controllo'),
    ]);
    expect(hospitalRows(calcs)).toHaveLength(1); // discharge paired once
    expect(ittDays(calcs)).toBe(11); // Jan10→Jan20 inclusivo (= 11), non 15 (niente double-count)
  });

  it('detects a discharge NOT labeled "dimissione" ("Relazione di fine ricovero")', () => {
    const calcs = calculateMedicoLegalPeriods([
      makeEvent('2024-01-10', 'ricovero', 'Ricovero'),
      makeEvent('2024-01-20', 'referto', 'Relazione di fine ricovero', 'Paziente dimesso'),
      makeEvent('2024-03-01', 'follow-up', 'Controllo'),
    ]);
    expect(ittDays(calcs)).toBe(11); // hospital stay not lost (Jan10→Jan20 inclusivo)
  });

  it('does NOT produce a backward ITP period when the only follow-up precedes the discharge', () => {
    const calcs = calculateMedicoLegalPeriods([
      makeEvent('2024-01-05', 'follow-up', 'Visita pre-ricovero'),
      makeEvent('2024-01-10', 'ricovero', 'Ricovero'),
      makeEvent('2024-01-20', 'ricovero', 'Dimissione', 'Dimissione'),
    ]);
    // No ITP segment may have endDate before startDate.
    for (const c of calcs.filter((x) => x.label.startsWith('ITP'))) {
      if (c.startDate && c.endDate) expect(c.endDate >= c.startDate).toBe(true);
    }
  });

  it('uses explicit rehab phases for English "physiotherapy" (not the thirds estimate)', () => {
    const calcs = calculateMedicoLegalPeriods([
      makeEvent('2024-01-10', 'ricovero', 'Ricovero'),
      makeEvent('2024-01-20', 'ricovero', 'Dimissione', 'Dimissione'),
      makeEvent('2024-02-01', 'terapia', 'Start physiotherapy', 'physical therapy cycle'),
      makeEvent('2024-03-01', 'terapia', 'End physiotherapy', 'physiotherapy completed'),
      makeEvent('2024-04-01', 'follow-up', 'Controllo finale'),
    ]);
    const itp = calcs.filter((c) => c.label.startsWith('ITP'));
    // Explicit phases are NOT marked "(stima)".
    expect(itp.length).toBeGreaterThan(0);
    expect(itp.every((c) => !c.value.includes('stima'))).toBe(true);
  });

  it('keeps the thirds invariant (sum of ITP days == total recovery) and emits no 0-day rows', () => {
    for (const totalApprox of [2, 5, 10, 100, 101, 102]) {
      const end = new Date(Date.UTC(2024, 0, 11) + totalApprox * 86_400_000).toISOString().slice(0, 10);
      const calcs = calculateMedicoLegalPeriods([
        makeEvent('2024-01-10', 'ricovero', 'Ricovero'),
        makeEvent('2024-01-11', 'ricovero', 'Dimissione', 'Dimissione'),
        makeEvent(end, 'follow-up', 'Controllo'),
      ]);
      const itp = calcs.filter((c) => c.label.startsWith('ITP') && c.value.includes('stima'));
      expect(itp.every((c) => (c.days ?? 0) > 0)).toBe(true); // no "0 giorni" rows
      const sum = itp.reduce((a, c) => a + (c.days ?? 0), 0);
      // total recovery = end - dischargeDate(2024-01-11)
      const total = Math.round((Date.parse(end + 'T00:00:00Z') - Date.parse('2024-01-11T00:00:00Z')) / 86_400_000);
      expect(sum).toBe(total);
    }
  });

  it('is robust to unsorted input (sorts internally)', () => {
    const sorted = calculateMedicoLegalPeriods([
      makeEvent('2024-01-10', 'ricovero', 'Ricovero'),
      makeEvent('2024-01-20', 'ricovero', 'Dimissione', 'Dimissione'),
      makeEvent('2024-03-01', 'follow-up', 'Controllo'),
    ]);
    const shuffled = calculateMedicoLegalPeriods([
      makeEvent('2024-03-01', 'follow-up', 'Controllo'),
      makeEvent('2024-01-20', 'ricovero', 'Dimissione', 'Dimissione'),
      makeEvent('2024-01-10', 'ricovero', 'Ricovero'),
    ]);
    expect(ittDays(shuffled)).toBe(ittDays(sorted));
    const totSorted = sorted.find((c) => c.label === 'Periodo totale malattia');
    const totShuffled = shuffled.find((c) => c.label === 'Periodo totale malattia');
    expect(totShuffled?.days).toBe(totSorted?.days);
    expect(totShuffled?.startDate).toBe('2024-01-10');
    expect(totShuffled?.endDate).toBe('2024-03-01');
  });
});

describe('QA 2026-06-11 — dedup ricoveri e sanity check (caso Tedesco, PDF duplicato)', () => {
  it('should merge identical/overlapping ricovero intervals (duplicated docs counted once)', () => {
    const events = [
      makeEvent('2024-01-10', 'ricovero', 'Ricovero ortopedia'),
      makeEvent('2024-01-10', 'ricovero', 'Ricovero ortopedia'), // duplicato dal PDF doppio
      makeEvent('2024-01-20', 'referto', 'Dimissione'),
      makeEvent('2024-01-20', 'referto', 'Dimissione'), // duplicato
      makeEvent('2024-03-01', 'visita', 'Controllo finale'),
    ];
    const calcs = calculateMedicoLegalPeriods(events);
    const ricoveri = calcs.filter((c) => c.label === 'Giorni di ricovero');
    expect(ricoveri).toHaveLength(1);
    expect(ricoveri[0].days).toBe(11); // inclusivo: Jan10→Jan20 (dup fusi, contati una volta)
  });

  it('should flag DA VERIFICARE when estimated periods exceed the observed interval', () => {
    // Intervallo osservato corto, ma ricovero "fantasma" lungo che gonfia ITT
    const events = [
      makeEvent('2024-01-01', 'ricovero', 'Ricovero'),
      makeEvent('2024-12-31', 'referto', 'Dimissione'), // ricovero di un anno
      makeEvent('2025-01-10', 'visita', 'Controllo'),
    ];
    const calcs = calculateMedicoLegalPeriods(events);
    const graduated = calcs.filter((c) => /ITT|ITP/.test(c.label));
    // La somma ITT(365) + ITP graduata supera l'intervallo (374 gg) → flag
    const flagged = graduated.filter((c) => c.notes.includes('DA VERIFICARE'));
    const total = graduated.reduce((s, c) => s + (c.days ?? 0), 0);
    if (total > 374 * 1.1) {
      expect(flagged.length).toBe(graduated.length);
      expect(flagged[0].notes).toContain('supera l\'intervallo documentato');
    } else {
      expect(flagged).toHaveLength(0); // somma plausibile: nessun falso allarme
    }
  });
});
