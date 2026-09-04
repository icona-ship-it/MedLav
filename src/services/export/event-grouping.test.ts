import { describe, it, expect } from 'vitest';
import { groupEventsByDocument, buildDocumentGroupHeading } from './event-grouping';

function ev(documentId: string | null, date: string, facility: string | null = null, scope?: string | null) {
  return { document_id: documentId, event_date: date, facility, temporal_scope: scope ?? null };
}

describe('event-grouping — cronistoria per documento (feedback beta 2026-07-20)', () => {
  it('un verbale PS estratto in 6 eventi → UN gruppo, non 6 intestazioni', () => {
    const groups = groupEventsByDocument([
      ev('ps', '2026-05-12'), ev('ps', '2026-05-12'), ev('ps', '2026-05-12'),
      ev('ps', '2026-05-12'), ev('ps', '2026-05-12'), ev('ps', '2026-05-12'),
      ev('visita', '2026-05-20'),
    ]);
    expect(groups).toHaveLength(2);
    expect(groups[0].events).toHaveLength(6);
  });

  it('gruppi ordinati per data più antica (cronologia a livello di documento)', () => {
    const groups = groupEventsByDocument([
      ev('tardo', '2026-06-10'),
      ev('presto', '2026-05-12'),
    ]);
    expect(groups.map((g) => g.documentId)).toEqual(['presto', 'tardo']);
  });

  it('intestazione: tipo classificato + struttura + data; MAI il nome file', () => {
    const heading = buildDocumentGroupHeading('cartella_clinica', [
      ev('x', '2026-05-12', 'Ospedale Civile di Cittàdemo'),
    ]);
    expect(heading).toContain('Cartella Clinica');
    expect(heading).toContain('Ospedale Civile di Cittàdemo');
    expect(heading).toContain('in data 12.05.2026');
  });

  it('documento multi-data → intervallo "dal X al Y"; senza date valide → "s.d."', () => {
    expect(buildDocumentGroupHeading('altro', [ev('x', '2026-05-15'), ev('x', '2026-06-05')]))
      .toContain('dal 15.05.2026 al 05.06.2026');
    expect(buildDocumentGroupHeading('altro', [ev('x', '1900-01-01')])).toContain('s.d.');
  });

  it('eventi senza document_id → gruppo residuo con heading vuoto (fallback lista piatta)', () => {
    const groups = groupEventsByDocument([ev(null, '2026-05-12')]);
    expect(groups).toHaveLength(1);
    expect(groups[0].documentId).toBe('');
    expect(groups[0].heading).toBe('');
  });
});

describe('event-grouping — ambito temporale (feedback medici 2026-08-19 Mail 2: referto di 3 pagine esploso in 12 eventi)', () => {
  const referto = [
    ev('ref', '2026-02-27', 'AOUI Demo', 'retrospettivo'),
    ev('ref', '2026-03-03', 'AOUI Demo', 'retrospettivo'),
    ev('ref', '2026-04-14', 'AOUI Demo', 'retrospettivo'),
    ev('ref', '2026-05-22', 'AOUI Demo', 'corrente'),
    ev('ref', '2026-06-18', 'AOUI Demo', 'programmato'),
  ];

  it('intestazione: SOLO la data della visita, non "dal 27.02 al 18.06"', () => {
    const heading = buildDocumentGroupHeading('referto_specialistico', referto);
    expect(heading).toContain('in data 22.05.2026');
    expect(heading).not.toContain('27.02.2026');
    expect(heading).not.toContain('18.06.2026');
  });

  it('partizioni: 1 corrente, 3 retrospettivi, 1 programmato — nessun evento perso', () => {
    const [g] = groupEventsByDocument(referto);
    expect(g.current).toHaveLength(1);
    expect(g.retrospective).toHaveLength(3);
    expect(g.scheduled).toHaveLength(1);
    expect(g.events).toHaveLength(5);
  });

  it('ordine dei gruppi: il referto del 22.05 viene DOPO una visita del 10.04, non prima per via dell\'anamnesi', () => {
    const groups = groupEventsByDocument([...referto, ev('visita', '2026-04-10', null, 'corrente')]);
    expect(groups.map((g) => g.documentId)).toEqual(['visita', 'ref']);
  });

  it('righe legacy senza scope (null/assente) → tutto "corrente": intestazione e ordine come prima', () => {
    const heading = buildDocumentGroupHeading('altro', [ev('x', '2026-05-15'), ev('x', '2026-06-05')]);
    expect(heading).toContain('dal 15.05.2026 al 05.06.2026');
    const [g] = groupEventsByDocument([ev('x', '2026-05-15'), ev('x', '2026-06-05')]);
    expect(g.current).toHaveLength(2);
    expect(g.retrospective).toHaveLength(0);
  });

  it('documento fatto SOLO di menzioni anamnestiche → data dall\'unico che c\'è, mai "s.d."', () => {
    const heading = buildDocumentGroupHeading('altro', [ev('x', '2019-01-01', null, 'retrospettivo')]);
    expect(heading).toContain('in data 01.01.2019');
  });

  it('fallback a gradini: senza correnti, retrospettivo e programmato NON si mescolano in un intervallo (mai "dal 27.02 al 18.06")', () => {
    const heading = buildDocumentGroupHeading('altro', [ev('x', '2026-02-27', null, 'retrospettivo'), ev('x', '2026-06-18', null, 'programmato')]);
    expect(heading).toContain('in data 27.02.2026');
    expect(heading).not.toContain('18.06.2026');
  });

  it('un corrente SENZA data non svuota l\'intestazione: si usa il corrente datato o il gradino successivo', () => {
    const heading = buildDocumentGroupHeading('altro', [ev('x', '1900-01-01', null, 'corrente'), ev('x', '2026-05-22', null, 'corrente')]);
    expect(heading).toContain('in data 22.05.2026');
    const [g] = groupEventsByDocument([ev('x', '1900-01-01', null, 'corrente'), ev('x', '2019-01-01', null, 'retrospettivo')]);
    expect(g.heading).toContain('in data 01.01.2019');
  });
});
