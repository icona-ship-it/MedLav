import { describe, it, expect } from 'vitest';
import type { ConsolidatedEvent } from '../consolidation/event-consolidator';
import { checkSelectiveCoverage } from './selective-coverage';

function ev(partial: Partial<ConsolidatedEvent>): ConsolidatedEvent {
  return {
    eventDate: '2024-03-12',
    datePrecision: 'full',
    eventType: 'visita',
    title: 'Evento',
    description: '',
    sourceType: 'referto',
    diagnosis: null,
    doctor: null,
    facility: null,
    confidence: 90,
    requiresVerification: false,
    reliabilityNotes: null,
    sourceText: '',
    sourcePages: [1],
    orderNumber: 1,
    documentId: 'd1',
    discrepancyNote: null,
    ...partial,
  };
}

describe('checkSelectiveCoverage', () => {
  it('reports no missing when every T1 event date appears in the narrative', () => {
    const events = [
      ev({ eventType: 'intervento', eventDate: '2024-03-12' }),
      ev({ eventType: 'diagnosi', eventDate: '2024-04-01' }),
    ];
    const content = 'In data 12.03.2024 intervento; il 01.04.2024 la diagnosi definitiva.';
    const res = checkSelectiveCoverage(content, events);
    expect(res.t1Total).toBe(2);
    expect(res.missing).toHaveLength(0);
  });

  it('flags a T1 event whose date is absent from the narrative', () => {
    const events = [
      ev({ eventType: 'intervento', eventDate: '2024-03-12' }),
      ev({ eventType: 'ricovero', eventDate: '2024-05-20', description: 'ricovero in chirurgia' }),
    ];
    const content = 'In data 12.03.2024 intervento chirurgico.'; // 20.05.2024 missing
    const res = checkSelectiveCoverage(content, events);
    expect(res.t1Total).toBe(2);
    expect(res.missing).toHaveLength(1);
    expect(res.missing[0].eventDate).toBe('2024-05-20');
  });

  it('ignores routine T2/T3 events (selective is allowed to paraphrase them)', () => {
    const events = [
      ev({ eventType: 'visita', eventDate: '2024-06-01' }), // T2
      ev({ eventType: 'terapia', eventDate: '2024-06-02' }), // T2
    ];
    const content = 'Controlli ambulatoriali nei mesi successivi.'; // no dates
    const res = checkSelectiveCoverage(content, events);
    expect(res.t1Total).toBe(0);
    expect(res.missing).toHaveLength(0);
  });

  it('does not flag sentinel-dated events (no real date to look for)', () => {
    const events = [ev({ eventType: 'diagnosi', eventDate: '1900-01-01' })];
    const content = 'Narrazione senza quella data.';
    const res = checkSelectiveCoverage(content, events);
    expect(res.missing).toHaveLength(0);
  });

  it('treats a discordant event as T1 even if its type is routine', () => {
    const events = [
      ev({ eventType: 'visita', eventDate: '2024-07-07', discrepancyNote: 'DISCORDANTE: diagnosi divergenti' }),
    ];
    const content = 'Nessuna menzione.';
    const res = checkSelectiveCoverage(content, events);
    expect(res.t1Total).toBe(1);
    expect(res.missing).toHaveLength(1);
  });
});
