import { describe, it, expect } from 'vitest';
import { planConsolidationPersistence, type RawEventRowForPersistence } from './consolidation-persistence';
import type { ConsolidatedEvent } from '@/services/consolidation/event-consolidator';

const row = (id: string, o: Partial<RawEventRowForPersistence> = {}): RawEventRowForPersistence => ({
  id, title: `Titolo ${id}`, description: `Descrizione ${id}`, event_type: 'visita', diagnosis: null, doctor: null, facility: null,
  confidence: 90, requires_verification: false, reliability_notes: null, source_pages: '[1]', temporal_scope: 'corrente', ...o,
});
const ev = (rowId: string, o: Partial<ConsolidatedEvent> = {}): ConsolidatedEvent => ({
  orderNumber: 1, documentId: 'd', discrepancyNote: null, rowId, absorbedRowIds: [], mutated: false,
  eventDate: '2026-04-18', datePrecision: 'giorno', eventType: 'visita', title: `Titolo ${rowId}`, description: `Descrizione ${rowId}`,
  sourceType: 'cartella_clinica', diagnosis: null, doctor: null, facility: null, confidence: 90, requiresVerification: false,
  reliabilityNotes: null, sourceText: 'x', sourcePages: [1], temporalScope: 'corrente', ...o,
});

describe('planConsolidationPersistence — il DB riflette le decisioni del consolidatore', () => {
  it('le righe assorbite vengono eliminate una volta sola; un sopravvissuto non è mai eliminato', () => {
    const plan = planConsolidationPersistence(
      [ev('a', { absorbedRowIds: ['b', 'c', 'b'] }), ev('c')],
      [row('a'), row('b'), row('c')],
    );
    expect(plan.deleteIds).toEqual(['b']);
  });
  it('un sopravvissuto mutato viene riscritto solo nei campi cambiati; uno non mutato non tocca il DB', () => {
    const plan = planConsolidationPersistence(
      [
        ev('a', { mutated: true, title: 'Nuovo titolo', sourcePages: [1, 2], requiresVerification: true, eventType: 'terapia' }),
        ev('b', { title: 'Cambiato ma non mutato' }),
      ],
      [row('a'), row('b')],
    );
    expect(plan.updates).toEqual([{ id: 'a', fields: { title: 'Nuovo titolo', event_type: 'terapia', requires_verification: true, source_pages: '[1,2]' } }]);
  });
  it('senza rowId (eventi non provenienti dal DB) non produce né delete né update', () => {
    const plan = planConsolidationPersistence([ev('', { rowId: undefined, mutated: true, title: 'x' })], [row('a')]);
    expect(plan).toEqual({ deleteIds: [], updates: [] });
  });
});

import { applyPlanToRows } from './consolidation-persistence';
import { buildOrderUpdates } from './order-mapping';

describe('applyPlanToRows — l’ordine si assegna sulle righe come saranno dopo il piano', () => {
  it('un sopravvissuto cambiato di tipo (ricovero → visita) riceve comunque il suo order_number; le righe assorbite spariscono', () => {
    const plan = { deleteIds: ['r2'], updates: [{ id: 'r1', fields: { event_type: 'visita', title: 'Accesso in Pronto Soccorso: trauma' } }] };
    const raw = [
      { id: 'r1', document_id: 'd', event_date: '2026-04-18', event_type: 'ricovero', title: 'Accesso PS' },
      { id: 'r2', document_id: 'd', event_date: '2026-04-18', event_type: 'visita', title: 'Triage' },
      { id: 'r3', document_id: 'd', event_date: '2026-04-18', event_type: 'esame', title: 'RX' },
    ];
    const rows = applyPlanToRows(raw, plan);
    expect(rows.map((r) => r.id)).toEqual(['r1', 'r3']);
    const orders = buildOrderUpdates(
      [
        { documentId: 'd', eventDate: '2026-04-18', eventType: 'visita', title: 'Accesso in Pronto Soccorso: trauma', orderNumber: 1 },
        { documentId: 'd', eventDate: '2026-04-18', eventType: 'esame', title: 'RX', orderNumber: 2 },
      ],
      rows,
    );
    expect(orders).toEqual([{ id: 'r1', order_number: 1 }, { id: 'r3', order_number: 2 }]);
  });
});
