import { describe, it, expect } from 'vitest';
import { buildOrderUpdates } from './order-mapping';

describe('buildOrderUpdates', () => {
  it('maps order_number by identity, not by array index, when consolidation drops rows', () => {
    // 3 raw rows; consolidation collapsed rows 1+2 (same-day duplicate) into one
    // consolidated event, so allEvents has 2 entries but raw has 3.
    const allEvents = [
      { documentId: 'd1', eventDate: '2024-03-12', eventType: 'intervento', title: 'Op', orderNumber: 1 },
      { documentId: 'd1', eventDate: '2024-05-20', eventType: 'ricovero', title: 'Ric', orderNumber: 2 },
    ];
    const existingRaw = [
      { id: 'r1', document_id: 'd1', event_date: '2024-03-12', event_type: 'intervento', title: 'Op' },
      { id: 'r2', document_id: 'd1', event_date: '2024-03-12', event_type: 'intervento', title: 'Op' }, // dup
      { id: 'r3', document_id: 'd1', event_date: '2024-05-20', event_type: 'ricovero', title: 'Ric' },
    ];

    const updates = buildOrderUpdates(allEvents, existingRaw);

    // r1 and r2 (the duplicate pair) both map to order 1; r3 to order 2.
    expect(updates).toContainEqual({ id: 'r1', order_number: 1 });
    expect(updates).toContainEqual({ id: 'r2', order_number: 1 });
    expect(updates).toContainEqual({ id: 'r3', order_number: 2 });
    // The OLD positional bug would have assigned r3 (index 2) using allEvents[2]
    // (undefined) → dropped, and r2 the wrong event. Identity mapping fixes it.
  });

  it('assigns the correct order across documents (no cross-doc index drift)', () => {
    const allEvents = [
      { documentId: 'dA', eventDate: '2024-01-01', eventType: 'visita', title: 'V', orderNumber: 1 },
      { documentId: 'dB', eventDate: '2024-02-01', eventType: 'diagnosi', title: 'D', orderNumber: 2 },
    ];
    const existingRaw = [
      { id: 'b1', document_id: 'dB', event_date: '2024-02-01', event_type: 'diagnosi', title: 'D' },
      { id: 'a1', document_id: 'dA', event_date: '2024-01-01', event_type: 'visita', title: 'V' },
    ];

    const updates = buildOrderUpdates(allEvents, existingRaw);

    expect(updates).toContainEqual({ id: 'b1', order_number: 2 });
    expect(updates).toContainEqual({ id: 'a1', order_number: 1 });
  });

  it('skips raw rows with no matching consolidated event (keeps existing order, no corruption)', () => {
    const allEvents = [
      { documentId: 'd1', eventDate: '2024-03-12', eventType: 'intervento', title: 'Op', orderNumber: 1 },
    ];
    const existingRaw = [
      { id: 'r1', document_id: 'd1', event_date: '2024-03-12', event_type: 'intervento', title: 'Op' },
      { id: 'rX', document_id: 'd1', event_date: '1900-01-01', event_type: 'spesa_medica', title: 'Bollo' },
    ];

    const updates = buildOrderUpdates(allEvents, existingRaw);

    expect(updates).toEqual([{ id: 'r1', order_number: 1 }]);
  });

  it('handles null document_id and empty title without throwing', () => {
    const allEvents = [
      { documentId: '', eventDate: '2024-03-12', eventType: 'altro', title: '', orderNumber: 1 },
    ];
    const existingRaw = [
      { id: 'r1', document_id: null, event_date: '2024-03-12', event_type: 'altro', title: '' },
    ];

    expect(buildOrderUpdates(allEvents, existingRaw)).toEqual([{ id: 'r1', order_number: 1 }]);
  });
});
