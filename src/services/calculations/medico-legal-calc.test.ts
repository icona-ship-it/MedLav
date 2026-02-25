import { describe, it, expect } from 'vitest';
import { calculateMedicoLegalPeriods } from './medico-legal-calc';

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
