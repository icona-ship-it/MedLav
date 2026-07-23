import { describe, it, expect } from 'vitest';
import { buildVisibleSections, BASE_SECTIONS } from './perizia-form-sections';

/**
 * rc-mvp: il form mostra SOLO sezioni i cui campi lo schema zod strict RC
 * persiste davvero — niente sezioni giudiziali (tribunale/date/quesiti) né
 * campi CTP/co-perito, che il salvataggio scarterebbe in silenzio.
 */
describe('buildVisibleSections', () => {
  it('should never include court-only sections (tribunale/date/quesiti)', () => {
    const ids = buildVisibleSections({ isRC: true }).map((s) => s.id);
    for (const courtId of ['intestazione', 'quesiti']) {
      expect(ids).not.toContain(courtId);
    }
  });

  // Collaudo 2026-07-24 (CASO-2026-029): la sezione Date era assente su RC →
  // il campo "Data del sinistro" (àncora dei calcoli, feedback beta) era
  // invisibile. Ora c'è, ma SOLO coi campi persistiti dallo schema RC.
  it('RC: la sezione date esiste con dataSinistro, senza i termini giudiziali', () => {
    const date = buildVisibleSections({ isRC: true }).find((s) => s.id === 'date');
    expect(date).toBeDefined();
    expect(date!.fields).toContain('dataSinistro');
    expect(date!.fields).not.toContain('termineBozza');
    expect(date!.fields).not.toContain('termineOsservazioni');
  });

  it('should keep paziente, parti and esameObiettivo', () => {
    const ids = buildVisibleSections({ isRC: true }).map((s) => s.id);
    expect(ids).toContain('paziente');
    expect(ids).toContain('parti');
    expect(ids).toContain('esameObiettivo');
  });

  it('should NOT include the report-section picker (moved to the Elaborazione step)', () => {
    for (const params of [{ isRC: false }, { isRC: true }] as const) {
      const ids = buildVisibleSections(params).map((s) => s.id);
      expect(ids).not.toContain('sezioniReport');
    }
  });

  it('should not list CTP/co-perito fields in the parti section (non salvabili)', () => {
    const parti = BASE_SECTIONS.find((s) => s.id === 'parti')!;
    for (const removed of ['coCtuName', 'coCtuTitle', 'ctpRicorrente', 'ctpResistente']) {
      expect(parti.fields).not.toContain(removed);
    }
  });

  it('should append RC perito sections (anamnesi + il fatto) only when isRC', () => {
    const rc = buildVisibleSections({ isRC: true }).map((s) => s.id);
    expect(rc).toContain('ilFatto');
    expect(rc).toContain('anamnesi');

    const nonRc = buildVisibleSections({ isRC: false }).map((s) => s.id);
    expect(nonRc).not.toContain('ilFatto');
    expect(nonRc).not.toContain('anamnesi');
  });

  it('should list Dati Anamnestici FIRST (Lavini 2026-07-05: prima cosa da compilare)', () => {
    const ids = buildVisibleSections({ isRC: true }).map((s) => s.id);
    expect(ids[0]).toBe('anamnesi');
    // "Il Fatto" resta in coda
    expect(ids[ids.length - 1]).toBe('ilFatto');
  });

  it('should never mutate the underlying constants (immutability)', () => {
    const first = buildVisibleSections({ isRC: true });
    first.pop();
    const second = buildVisibleSections({ isRC: true });
    expect(second.length).toBe(BASE_SECTIONS.length + 2);
  });
});
