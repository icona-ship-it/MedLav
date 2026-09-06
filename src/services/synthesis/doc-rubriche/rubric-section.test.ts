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
    expect(out.markdown).toContain('**Lettera di dimissione, Ospedale Civile di Cittàdemo, dal 16.07.2023 al 25.07.2023:**');
    expect(out.markdown).toContain('Intervento: «Osteosintesi.»');
  });
  it('dischargeDateFromText legge "dal … al …" e "dimesso il …"', () => {
    expect(dischargeDateFromText('Ricoverato dal 1/7/2023 al 9/7/2023')).toBe('2023-07-09');
    expect(dischargeDateFromText('Dimessa in data 25.07.2023')).toBe('2023-07-25');
    expect(dischargeDateFromText('nessuna data')).toBeNull();
  });
});

describe('intestazione: qualificatore esame, struttura dalla carta intestata, medico', () => {
  it('esame strumentale senza eventi con struttura: titolo esame nel tipo, struttura dalla carta intestata', () => {
    const docs = [{ documentId: 'rx', documentType: 'esame_strumentale', pages: [{ pageNumber: 1, ocrText: 'CENTRO DIAGNOSTICO ESEMPI\nVia degli Esempi 10 - Cittàdemo\nRX polso destro\nFrattura composta del radio. Ulna integra.' }] }];
    const out = formatDocumentazioneSanitariaRubriche(docs, [{ event_date: '2026-02-10', document_id: 'rx', temporal_scope: 'corrente' }]);
    expect(out.markdown).toContain('**Referto di esame strumentale – RX polso destro, Centro Diagnostico Esempi, in data 10.02.2026:**');
    expect(out.markdown).not.toContain('Via degli Esempi');
    expect(out.markdown).toContain('«RX polso destro: Frattura composta del radio. Ulna integra.»');
  });
  it('visita senza struttura: il medico degli eventi entra nell\'intestazione', () => {
    const docs = [{ documentId: 'v', documentType: 'referto_specialistico', pages: [{ pageNumber: 1, ocrText: 'Visita ortopedica\nCONCLUSIONI\nQuadro in evoluzione favorevole.' }] }];
    const out = formatDocumentazioneSanitariaRubriche(docs, [{ event_date: '2026-03-04', document_id: 'v', doctor: 'Dott.ssa Fittizi Marta', temporal_scope: 'corrente' }]);
    expect(out.markdown).toContain('**Referto specialistico, Dott.ssa Fittizi Marta, in data 04.03.2026:**');
  });
});

// Panel giro 8 (2026-09-06), caso C: «strutture erogatrici sostituite da nomi di
// persona, indirizzi o garble» nelle intestazioni.
describe('intestazione: la struttura non è un indirizzo né un nome di persona', () => {
  const pages = [{ pageNumber: 1, ocrText: 'ECG\nTachicardia sinusale.' }];
  it('facility dagli eventi che è un indirizzo → omessa; che è un nome di persona → "Dott. …"', () => {
    const a = formatDocumentazioneSanitariaRubriche(
      [{ documentId: 'ecg', documentType: 'esame_strumentale', pages }],
      [{ event_date: '2025-09-13', document_id: 'ecg', facility: 'Via degli Esempi, 17 - 00000 CITTÀDEMO', temporal_scope: 'corrente' }],
    );
    expect(a.markdown).not.toContain('Via degli Esempi');
    const b = formatDocumentazioneSanitariaRubriche(
      [{ documentId: 'ecg', documentType: 'esame_strumentale', pages }],
      [{ event_date: '2025-09-13', document_id: 'ecg', facility: 'ANNA DEMPROVA', temporal_scope: 'corrente' }],
    );
    expect(b.markdown).toContain('Dott. Anna Demprova');
    expect(b.markdown).not.toContain('ANNA DEMPROVA,');
    const c = formatDocumentazioneSanitariaRubriche(
      [{ documentId: 'ecg', documentType: 'esame_strumentale', pages }],
      [{ event_date: '2025-09-13', document_id: 'ecg', facility: 'Studio Radiologico Demprova', temporal_scope: 'corrente' }],
    );
    expect(c.markdown).toContain('Studio Radiologico Demprova');
  });
});
