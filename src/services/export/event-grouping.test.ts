import { describe, it, expect } from 'vitest';
import { groupEventsByDocument, buildDocumentGroupHeading } from './event-grouping';

function ev(documentId: string | null, date: string, facility: string | null = null) {
  return { document_id: documentId, event_date: date, facility };
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
