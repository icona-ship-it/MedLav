/**
 * Test for the cronistoria-export filter applied across LegMed.
 * The filter is centralized in src/lib/constants.ts — every export and
 * detector imports the same NON_CLINICAL_EVENT_TYPES set.
 */

import { describe, it, expect } from 'vitest';
import { NON_CLINICAL_EVENT_TYPES, isClinicalEvent } from '@/lib/constants';

interface RawEvent {
  order_number: number;
  event_type: string;
  title: string;
}

function filterClinical(events: RawEvent[]): RawEvent[] {
  return events.filter((e) => !NON_CLINICAL_EVENT_TYPES.has(e.event_type));
}

describe('cronistoria timeline-export filter (Passaniti regression)', () => {
  it('strips spesa_medica events (SSN cost notices)', () => {
    const events: RawEvent[] = [
      { order_number: 1, event_type: 'visita', title: 'Visita PS' },
      { order_number: 2, event_type: 'spesa_medica', title: 'Spesa SSN 1057.95' },
      { order_number: 3, event_type: 'esame', title: 'RX polso' },
    ];
    const result = filterClinical(events);
    expect(result).toHaveLength(2);
    expect(result.map((e) => e.order_number)).toEqual([1, 3]);
  });

  it('strips documento_amministrativo events (avvisi pagamento)', () => {
    const events: RawEvent[] = [
      { order_number: 1, event_type: 'documento_amministrativo', title: 'Avviso pagamento 20.60' },
      { order_number: 2, event_type: 'visita', title: 'Visita controllo' },
    ];
    const result = filterClinical(events);
    expect(result).toHaveLength(1);
    expect(result[0].order_number).toBe(2);
  });

  it('strips certificato (administrative)', () => {
    const events: RawEvent[] = [
      { order_number: 1, event_type: 'certificato', title: 'Certificato medico' },
      { order_number: 2, event_type: 'intervento', title: 'Osteosintesi' },
    ];
    const result = filterClinical(events);
    expect(result).toHaveLength(1);
    expect(result[0].order_number).toBe(2);
  });

  it('preserves all clinical event types', () => {
    const events: RawEvent[] = [
      { order_number: 1, event_type: 'visita', title: 'A' },
      { order_number: 2, event_type: 'esame', title: 'B' },
      { order_number: 3, event_type: 'diagnosi', title: 'C' },
      { order_number: 4, event_type: 'intervento', title: 'D' },
      { order_number: 5, event_type: 'terapia', title: 'E' },
      { order_number: 6, event_type: 'ricovero', title: 'F' },
      { order_number: 7, event_type: 'follow-up', title: 'G' },
      { order_number: 8, event_type: 'referto', title: 'H' },
      { order_number: 9, event_type: 'prescrizione', title: 'I' },
      { order_number: 10, event_type: 'consenso', title: 'J' },
      { order_number: 11, event_type: 'complicanza', title: 'K' },
      { order_number: 12, event_type: 'altro', title: 'L' },
    ];
    const result = filterClinical(events);
    expect(result).toHaveLength(12);
  });

  it('mirrors the Passaniti scenario: 6 SSN/admin events stripped', () => {
    // Reproduces the actual case CASO-2026-154 Passaniti where the LegMed
    // cronistoria included 6 non-clinical events the perito Lavini wanted out:
    //   - row 12 spesa SSN 1057.95
    //   - row 30 costo RX polso 27.90
    //   - row 31 ticket visita chir mano 20.60
    //   - rows 36-37 spesa RX polso 10/02/2026
    //   - row 38 avviso pagamento 20.60
    const passanitiEvents: RawEvent[] = [
      { order_number: 8, event_type: 'ricovero', title: 'Accesso PS politrauma' },
      { order_number: 12, event_type: 'spesa_medica', title: 'Spesa sanitaria episodio cura 1057.95' },
      { order_number: 13, event_type: 'intervento', title: 'Osteosintesi placca e viti' },
      { order_number: 30, event_type: 'spesa_medica', title: 'Costo procedura RX polso 27.90' },
      { order_number: 31, event_type: 'spesa_medica', title: 'Pagamento ticket visita chir mano 20.60' },
      { order_number: 36, event_type: 'spesa_medica', title: 'Spesa sanitaria RX polso 27.90' },
      { order_number: 37, event_type: 'spesa_medica', title: 'Costo procedura RX polso controllo 27.90' },
      { order_number: 38, event_type: 'documento_amministrativo', title: 'Avviso pagamento 20.60' },
    ];
    const clinical = filterClinical(passanitiEvents);
    expect(clinical).toHaveLength(2); // Only ricovero + intervento survive
    expect(clinical.every((e) => !NON_CLINICAL_EVENT_TYPES.has(e.event_type))).toBe(true);
  });

  it('isClinicalEvent helper inverts the set correctly', () => {
    expect(isClinicalEvent('visita')).toBe(true);
    expect(isClinicalEvent('intervento')).toBe(true);
    expect(isClinicalEvent('spesa_medica')).toBe(false);
    expect(isClinicalEvent('documento_amministrativo')).toBe(false);
    expect(isClinicalEvent('certificato')).toBe(false);
  });
});
