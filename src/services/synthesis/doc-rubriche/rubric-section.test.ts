import { describe, it, expect } from 'vitest';
import { formatDocumentazioneSanitariaRubriche, dischargeDateFromText } from './rubric-section';

describe('formatDocumentazioneSanitariaRubriche — dal DB al blocco', () => {
  it('intestazione dagli eventi correnti; la lettera di dimissione sta alla data di dimissione', () => {
    const docs = [
      { documentId: 'rx', documentType: 'esame_strumentale', pages: [{ pageNumber: 1, ocrText: 'RX torace: nella norma.' }] },
      { documentId: 'let', documentType: 'lettera_dimissione', pages: [{ pageNumber: 1, ocrText: 'Ricoverata dal 16/07/2023 al 25/07/2023\nDIAGNOSI DI DIMISSIONE\nFrattura del femore.\nTRATTAMENTO ADOTTATO\nOsteosintesi.' }] },
    ];
    const events = [
      { event_date: '2023-07-20', document_id: 'rx', facility: 'Ospedale Civile di Cittàdemo', temporal_scope: 'corrente' },
      { event_date: '2023-07-16', document_id: 'let', facility: 'Ospedale Civile di Cittàdemo', temporal_scope: 'corrente' },
      { event_date: '2010-01-01', date_precision: 'anno', document_id: 'let', temporal_scope: 'retrospettivo' },
    ];
    const out = formatDocumentazioneSanitariaRubriche(docs, events);
    expect(out.blocks).toBe(2);
    expect(out.markdown.indexOf('Referto di esame strumentale')).toBeLessThan(out.markdown.indexOf('Lettera di dimissione'));
    expect(out.markdown).toContain('**Lettera di dimissione, Ospedale Civile di Cittàdemo, in data 16.07.2023:**');
    expect(out.markdown).toContain('Intervento: «Osteosintesi.»');
  });
  it('dischargeDateFromText legge "dal … al …" e "dimesso il …"', () => {
    expect(dischargeDateFromText('Ricoverato dal 1/7/2023 al 9/7/2023')).toBe('2023-07-09');
    expect(dischargeDateFromText('Dimessa in data 25.07.2023')).toBe('2023-07-25');
    expect(dischargeDateFromText('nessuna data')).toBeNull();
  });
});
