import { describe, it, expect } from 'vitest';
import {
  calculateMedicoLegalPeriods,
  calculateITTITP,
  calculationsToITTITPSegments,
  formatITTITPTable,
} from './medico-legal-calc';

function makeEvent(eventDate: string, eventType: string, title: string, description = '') {
  return { event_date: eventDate, event_type: eventType, title, description };
}

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
    expect(total!.days).toBe(157);
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
    expect(hospital!.days).toBe(8);
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
    expect(itt!.days).toBe(10);
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
    expect(itt!.days).toBe(10);
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
});
