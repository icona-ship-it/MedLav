import { describe, it, expect } from 'vitest';
import { sortEventsChrono, compareEventsChrono } from './event-order';

const ev = (event_date: string, order_number = 0, id = '') => ({ event_date, order_number, id });

describe('event-order — sortEventsChrono', () => {
  it('sorts ascending by ISO date', () => {
    const out = sortEventsChrono([ev('2024-03-15'), ev('2024-01-10'), ev('2024-02-20')]);
    expect(out.map((e) => e.event_date)).toEqual(['2024-01-10', '2024-02-20', '2024-03-15']);
  });

  it('pushes sentinel 1900-01-01 events to the BOTTOM (not the top)', () => {
    const out = sortEventsChrono([ev('1900-01-01', 1), ev('2024-05-01', 2), ev('2024-01-01', 3)]);
    expect(out.map((e) => e.event_date)).toEqual(['2024-01-01', '2024-05-01', '1900-01-01']);
  });

  it('pushes empty/missing dates to the bottom', () => {
    const out = sortEventsChrono([ev('', 1), ev('2024-02-01', 2)]);
    expect(out[0].event_date).toBe('2024-02-01');
    expect(out[1].event_date).toBe('');
  });

  it('breaks date ties by order_number (stable)', () => {
    const out = sortEventsChrono([
      { event_date: '2024-01-10', order_number: 3, id: 'c' },
      { event_date: '2024-01-10', order_number: 1, id: 'a' },
      { event_date: '2024-01-10', order_number: 2, id: 'b' },
    ]);
    expect(out.map((e) => e.id)).toEqual(['a', 'b', 'c']);
  });

  it('is robust to a scrambled order_number (orders by DATE, not order_number)', () => {
    // Simulates the order_number-misalignment bug: numbers do not match chronology.
    const out = sortEventsChrono([
      { event_date: '2024-03-01', order_number: 1 },
      { event_date: '2024-01-01', order_number: 99 },
      { event_date: '2024-02-01', order_number: 50 },
    ]);
    expect(out.map((e) => e.event_date)).toEqual(['2024-01-01', '2024-02-01', '2024-03-01']);
  });

  it('does not mutate the input', () => {
    const input = [ev('2024-03-01'), ev('2024-01-01')];
    const copy = [...input];
    sortEventsChrono(input);
    expect(input).toEqual(copy);
  });

  it('compareEventsChrono returns 0-ish ordering consistent for equal events', () => {
    expect(compareEventsChrono(ev('2024-01-01', 1), ev('2024-01-01', 1))).toBe(0);
  });
});
