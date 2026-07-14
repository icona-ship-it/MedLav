import { describe, it, expect } from 'vitest';
import { synthesisHasOwnHeader } from './report-assembler';
import { generateHtmlReport, generateProfessionalHtmlReport } from './html-export';

describe('synthesisHasOwnHeader', () => {
  it('true quando la sintesi ha la propria "## Intestazione"', () => {
    expect(synthesisHasOwnHeader('## Intestazione\n\n**TRIBUNALE DI X**')).toBe(true);
    expect(synthesisHasOwnHeader('Premessa\n\n## Intestazione\n\nx')).toBe(true);
  });

  it('false quando manca o è null', () => {
    expect(synthesisHasOwnHeader('## Quesiti\n\n1. ...')).toBe(false);
    expect(synthesisHasOwnHeader(null)).toBe(false);
    expect(synthesisHasOwnHeader('')).toBe(false);
  });
});

describe('export: intestazione unica (no doppione)', () => {
  const pm = { tribunale: 'Tribunale Ordinario di Bolzano', rgNumber: '653/2026', ctuName: 'Dr. Franco Lavini' };
  const baseParams = {
    caseCode: 'X', caseType: 'ortopedica', caseRole: 'ctu', patientInitials: 'S.S.',
    events: [], anomalies: [], missingDocs: [], periziaMetadata: pm, reportStatus: 'completato',
  };

  it('sopprime la cover dell\'export quando la sintesi ha già l\'intestazione veronese', () => {
    const synthesis = '## Intestazione\n\n**TRIBUNALE ORDINARIO DI BOLZANO**\n\n**Numero di Ruolo Generale 653/2026**\n\n## Quesiti\n\n1. ...';
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const html = generateHtmlReport({ ...baseParams, synthesis } as any);
    expect(html).not.toContain('n. R.G.');                 // cover vecchia soppressa
    expect(html).toContain('Numero di Ruolo Generale');    // intestazione veronese presente
  });

  it('mantiene la cover quando la sintesi NON ha intestazione (fallback)', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const html = generateHtmlReport({ ...baseParams, synthesis: '## Quesiti\n\n1. ...' } as any);
    expect(html).toContain('n. R.G.');
  });

  it('path PROFESSIONAL (CTU con tribunale): sopprime la cover-page quando la sintesi ha l\'intestazione', () => {
    const synthesis = '## Intestazione\n\n**TRIBUNALE ORDINARIO DI BOLZANO**\n\n**Numero di Ruolo Generale 653/2026**\n\n## Quesiti\n\n1. ...';
    const profParams = { caseCode: 'X', caseRole: 'ctu', patientInitials: 'S.S.', periziaMetadata: pm, documentsWithPages: [], synthesis, anomalies: [], missingDocs: [], reportStatus: 'completato' };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const html = generateProfessionalHtmlReport(profParams as any);
    expect(html).not.toContain('class="cover"');     // cover-page strutturata soppressa
    expect(html).not.toContain('n. R.G.');           // niente terminologia vecchia
    expect(html).toContain('Numero di Ruolo Generale'); // resta la veronese nel corpo
  });

  it('path PROFESSIONAL: mantiene la cover-page se la sintesi NON ha intestazione', () => {
    const profParams = { caseCode: 'X', caseRole: 'ctu', patientInitials: 'S.S.', periziaMetadata: pm, documentsWithPages: [], synthesis: '## Quesiti\n\n1. ...', anomalies: [], missingDocs: [], reportStatus: 'completato' };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const html = generateProfessionalHtmlReport(profParams as any);
    expect(html).toContain('class="cover"');
  });

  it('firma DOPPIA datata (bozza + deposito), collegiale con ausiliario', () => {
    const pmColl = { ...pm, collaboratoreName: 'Dr. Bongiovanni', collaboratoreTitle: 'Neurologo' };
    const profParams = { caseCode: 'X', caseRole: 'ctu', patientInitials: 'S.S.', periziaMetadata: pmColl, documentsWithPages: [], synthesis: '## Quesiti\n\n1. ...', anomalies: [], missingDocs: [], reportStatus: 'completato' };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const html = generateProfessionalHtmlReport(profParams as any);
    expect(html).toContain('sottoscrizione della bozza');
    expect(html).toContain('deposito definitivo');
    expect(html).toContain('Dr. Bongiovanni'); // ausiliario nel blocco firma
  });

  it('immagine-firma integrata UNA volta (no blocco-immagine ridondante)', () => {
    const img = 'data:image/png;base64,AAAA';
    const profParams = { caseCode: 'X', caseRole: 'ctu', patientInitials: 'S.S.', periziaMetadata: pm, documentsWithPages: [], synthesis: '## Quesiti\n\n1. ...', anomalies: [], missingDocs: [], reportStatus: 'completato', signatureImageBase64: img };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const html = generateProfessionalHtmlReport(profParams as any);
    expect((html.match(/<img[^>]*alt="Firma"/g) || []).length).toBe(1); // una sola immagine firma
    expect(html).not.toContain('border-top: 1px solid #ccc; width: 300px'); // vecchio blocco rimosso
  });
});

describe('export: nota del perito sulle anomalie (promessa mantenuta 2026-07-14)', () => {
  const pm = { tribunale: 'Tribunale di Prova', rgNumber: '1/2026', ctuName: 'Dr. Prova' };
  const anomaly = {
    anomaly_type: 'gap_documentale', severity: 'media',
    description: 'Manca la relazione fisiatrica di controllo.',
    suggestion: 'Verificare in cartella.',
    resolution_note: 'Il controllo è documentato in relazione successiva non depositata.',
  };

  it('HTML modalità lavoro: la nota del perito compare accanto all\'anomalia', () => {
    const params = {
      caseCode: 'X', caseType: 'ortopedica', caseRole: 'stragiudiziale', patientInitials: 'S.S.',
      events: [], anomalies: [anomaly], missingDocs: [], periziaMetadata: pm,
      reportStatus: 'completato', synthesis: '## Epicrisi\n\ntesto', exportMode: 'lavoro',
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const html = generateHtmlReport(params as any);
    expect(html).toContain('Nota del perito');
    expect(html).toContain('relazione successiva non depositata');
  });
});
