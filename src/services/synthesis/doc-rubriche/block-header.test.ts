import { describe, it, expect } from 'vitest';
import { describeDocumentBlock, buildBlockHeader } from './block-header';

describe('describeDocumentBlock — data e struttura del blocco dai soli eventi correnti', () => {
  it('data unica; la menzione anamnestica non data il documento', () => {
    const d = describeDocumentBlock([
      { eventDate: '2019-01-01', datePrecision: 'anno', temporalScope: 'retrospettivo' },
      { eventDate: '2026-02-10', temporalScope: 'corrente', facility: 'Ospedale Civile di Cittàdemo' },
      { eventDate: '2026-02-10', temporalScope: 'corrente' },
    ]);
    expect(d).toEqual({ sortIso: '2026-02-10', dateLabel: '10.02.2026', facility: 'Ospedale Civile di Cittàdemo' });
  });
  it('data dominante ≥60%, altrimenti intervallo', () => {
    expect(describeDocumentBlock([{ eventDate: '2026-02-10' }, { eventDate: '2026-02-10' }, { eventDate: '2026-02-17' }]).dateLabel).toBe('10.02.2026');
    const range = describeDocumentBlock([{ eventDate: '2026-02-10' }, { eventDate: '2026-02-17' }]);
    expect(range.dateLabel).toBe('dal 10.02.2026 al 17.02.2026');
    expect(range.sortIso).toBe('2026-02-10');
  });
  it('solo menzioni: prima menzione; senza date: s.d.; precisione anno', () => {
    expect(describeDocumentBlock([{ eventDate: '2020-05-01', temporalScope: 'retrospettivo' }]).dateLabel).toBe('01.05.2020');
    expect(describeDocumentBlock([{ eventDate: '1900-01-01', datePrecision: 'sconosciuta' }]).dateLabel).toBe('s.d.');
    expect(describeDocumentBlock([{ eventDate: '2019-01-01', datePrecision: 'anno' }]).dateLabel).toBe('2019');
    expect(describeDocumentBlock([])).toEqual({ sortIso: '9999-12-31', dateLabel: 's.d.', facility: null });
  });
  it('buildBlockHeader nei tre formati', () => {
    expect(buildBlockHeader('Cartella clinica', 'Ospedale Civile di Cittàdemo', '10.02.2026')).toBe('**Cartella clinica, Ospedale Civile di Cittàdemo, in data 10.02.2026:**');
    expect(buildBlockHeader('Referto', null, 'dal 10.02.2026 al 17.02.2026')).toBe('**Referto, dal 10.02.2026 al 17.02.2026:**');
    expect(buildBlockHeader('Referto', null, 's.d.')).toBe('**Referto, s.d.:**');
  });
});

describe('intervallo robusto', () => {
  it('una data isolata a mesi di distanza non allarga il ricovero', () => {
    const d = describeDocumentBlock([{ eventDate: '2023-01-16' }, { eventDate: '2023-07-16' }, { eventDate: '2023-07-20' }, { eventDate: '2023-07-25' }]);
    expect(d.dateLabel).toBe('dal 16.07.2023 al 25.07.2023');
    expect(d.sortIso).toBe('2023-07-16');
  });
});
