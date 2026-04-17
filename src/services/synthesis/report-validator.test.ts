import { describe, it, expect } from 'vitest';
import { validateReport } from './report-validator';
import type { ReportValidationContext, ReportIssue } from './report-validator';

function buildFullReport(overrides?: { events?: number }): string {
  const eventCount = overrides?.events ?? 5;
  const eventLines = Array.from({ length: eventCount }, (_, i) =>
    `In data 15.0${i + 1}.2024 il paziente veniva sottoposto a visita specialistica ortopedica presso la struttura ospedaliera ove veniva riscontrata una condizione clinica meritevole di approfondimento diagnostico e terapeutico specifico come da documentazione medica in atti. Il sanitario procedeva alla valutazione clinica completa con esame obiettivo articolare e funzionale, rilevando limitazione della mobilita articolare e dolore alla palpazione della regione interessata dalla lesione traumatica pregressa.`,
  ).join('\n');

  return `## Dati della Documentazione Sanitaria
${eventLines}

## Epicrisi
Il paziente M.R. si presentava presso il Pronto Soccorso del Presidio Ospedaliero per dolore al ginocchio destro
insorto a seguito di trauma contusivo occorso in data riferita. La documentazione analizzata comprende referti
specialistici ortopedici, esami strumentali di imaging avanzato, cartella clinica del ricovero ordinario e lettere
di dimissione ospedaliera con indicazioni terapeutiche e programma riabilitativo successivo.
Si procede alla ricostruzione cronologica dettagliata della vicenda clinica e alla valutazione medico-legale
completa del caso in esame, con particolare riferimento al nesso di causalita tra l'evento traumatico e le
conseguenze cliniche documentate nella documentazione sanitaria acquisita agli atti del presente procedimento.
Il decorso clinico documentato evidenzia un percorso terapeutico articolato che ha comportato multiple visite
specialistiche e accertamenti diagnostici strumentali al fine di definire il quadro clinico complessivo.

## Conclusioni
Alla luce di quanto sopra esposto e sulla base della documentazione sanitaria esaminata, dalla disamina degli atti
risultano i seguenti elementi rilevanti ai fini della valutazione medico-legale del caso in oggetto.
I periodi di invalidita temporanea totale e parziale risultano congruenti con il decorso clinico documentato e
con la tipologia delle lesioni riportate. Le risultanze degli accertamenti diagnostici strumentali confermano
la presenza di esiti permanenti compatibili con il meccanismo lesivo riferito.
Il danno biologico permanente e stimato nella misura del 15% secondo i criteri tabellari vigenti, tenuto conto
degli esiti clinici documentati e della compromissione funzionale residua accertata in sede di ultimo controllo.`;
}

describe('validateReport', () => {
  describe('complete report', () => {
    it('should return valid for a complete report with all sections', () => {
      const report = buildFullReport();
      const result = validateReport(report, 5);

      expect(result.valid).toBe(true);
      expect(result.issues.filter((i) => i.severity === 'error')).toHaveLength(0);
      expect(result.eventCoverage).toBe(100);
    });

    it('should block save when sentinel date leak is present (P0-VAL-002)', () => {
      const report = buildFullReport() + '\nIn data 01/01/1900 si segnala...';
      const result = validateReport(report, 5);

      // Sentinel dates are now errors: they must prevent a report from being saved.
      expect(result.valid).toBe(false);
      expect(result.issues.some(
        (i) => i.type === 'sentinel_date_leak' && i.severity === 'error',
      )).toBe(true);
    });
  });

  describe('empty report', () => {
    it('should detect empty report', () => {
      const result = validateReport('', 5);

      expect(result.valid).toBe(false);
      expect(result.issues).toHaveLength(1);
      expect(result.issues[0].type).toBe('empty_report');
      expect(result.issues[0].severity).toBe('error');
      expect(result.eventCoverage).toBe(0);
    });

    it('should detect whitespace-only report as empty', () => {
      const result = validateReport('   \n\t  ', 3);

      expect(result.valid).toBe(false);
      expect(result.issues[0].type).toBe('empty_report');
    });
  });

  describe('too short', () => {
    it('should detect report with less than 200 words', () => {
      const shortReport = '## Documentazione Sanitaria\nBreve.\n## Epicrisi\nEvento.\n## Conclusioni\nNulla.';
      const result = validateReport(shortReport, 0);

      expect(result.valid).toBe(false);
      expect(result.issues.some((i) => i.type === 'too_short')).toBe(true);
    });

    it('should not flag report with 200+ words', () => {
      const report = buildFullReport();
      const result = validateReport(report, 5);

      expect(result.issues.some((i) => i.type === 'too_short')).toBe(false);
    });
  });

  describe('missing sections', () => {
    it('should detect missing documentazione sanitaria', () => {
      const report = `## Epicrisi
${Array(100).fill('parola').join(' ')}

## Conclusioni
${Array(100).fill('parola').join(' ')}`;
      const result = validateReport(report, 0);

      expect(result.issues.some((i) =>
        i.type === 'missing_section' && i.message.includes('Documentazione sanitaria'),
      )).toBe(true);
    });

    it('should detect missing epicrisi/conclusioni', () => {
      const report = `## DATI DELLA DOCUMENTAZIONE SANITARIA
${Array(100).fill('parola').join(' ')}`;
      const result = validateReport(report, 0);

      expect(result.issues.some((i) =>
        i.type === 'missing_section' && i.message.includes('Epicrisi'),
      )).toBe(true);
    });

    it('should accept "Conclusioni" as epicrisi variant', () => {
      const report = `## DATI DELLA DOCUMENTAZIONE SANITARIA
${Array(100).fill('parola').join(' ')}

## Conclusioni
${Array(100).fill('parola').join(' ')}`;
      const result = validateReport(report, 0);

      expect(result.issues.filter((i) => i.type === 'missing_section')).toHaveLength(0);
    });

    it('should accept "Sintesi Conclusiva" as epicrisi variant', () => {
      const report = `## Documentazione Sanitaria
${Array(100).fill('parola').join(' ')}

## Sintesi Conclusiva
${Array(100).fill('parola').join(' ')}`;
      const result = validateReport(report, 0);

      expect(result.issues.filter((i) => i.type === 'missing_section')).toHaveLength(0);
    });
  });

  describe('sentinel date leak', () => {
    it('should detect 01/01/1900 in report', () => {
      const report = buildFullReport() + '\nIn data 01/01/1900 il paziente...';
      const result = validateReport(report, 5);

      expect(result.issues.some((i) =>
        i.type === 'sentinel_date_leak' && i.message.includes('1900'),
      )).toBe(true);
    });

    it('should detect 1900-01-01 in report', () => {
      const report = buildFullReport() + '\nData: 1900-01-01';
      const result = validateReport(report, 5);

      expect(result.issues.some((i) => i.type === 'sentinel_date_leak')).toBe(true);
    });

    it('should detect literal "Data non documentata" in report', () => {
      const report = buildFullReport() + '\nData non documentata nel referto.';
      const result = validateReport(report, 5);

      expect(result.issues.some((i) => i.type === 'sentinel_date_leak')).toBe(true);
    });

    it('should not flag report without sentinel dates', () => {
      const report = buildFullReport();
      const result = validateReport(report, 5);

      expect(result.issues.filter((i) => i.type === 'sentinel_date_leak')).toHaveLength(0);
    });
  });

  describe('event coverage', () => {
    it('should always return 100% coverage (Ev.N references removed from report format)', () => {
      const report = buildFullReport({ events: 3 });
      const result = validateReport(report, 3);
      expect(result.eventCoverage).toBe(100);
      expect(result.issues.filter((i) => i.type === 'low_event_coverage')).toHaveLength(0);
    });

    it('should return 100% coverage even when no Ev references exist', () => {
      const report = `## Documentazione Sanitaria
${Array(100).fill('parola').join(' ')}

## Epicrisi
${Array(100).fill('parola').join(' ')}`;
      const result = validateReport(report, 10);
      expect(result.eventCoverage).toBe(100);
    });
  });

  describe('phantom dates', () => {
    // buildFullReport() generates dates 15.01–15.05.2024, so context must include them all
    const context: ReportValidationContext = {
      events: [
        { orderNumber: 1, eventDate: '2024-01-15' },
        { orderNumber: 2, eventDate: '2024-02-15' },
        { orderNumber: 3, eventDate: '2024-03-15' },
        { orderNumber: 4, eventDate: '2024-04-15' },
        { orderNumber: 5, eventDate: '2024-05-15' },
      ],
    };

    it('should detect dates in report not present in events', () => {
      const report = buildFullReport() + '\nIn data 25/06/2024 si verificava un peggioramento.';
      const result = validateReport(report, 5, context);

      expect(result.issues.some((i) =>
        i.type === 'phantom_date' && i.message.includes('25/06/2024'),
      )).toBe(true);
    });

    it('should not flag dates that match event dates', () => {
      const report = buildFullReport() + '\nIn data 15/01/2024 il paziente si presentava.';
      const result = validateReport(report, 5, context);

      expect(result.issues.filter((i) => i.type === 'phantom_date')).toHaveLength(0);
    });

    it('should skip sentinel dates (handled by sentinel check)', () => {
      const report = buildFullReport() + '\nIn data 01/01/1900 si segnala.';
      const result = validateReport(report, 5, context);

      expect(result.issues.filter((i) => i.type === 'phantom_date')).toHaveLength(0);
    });

    it('should not duplicate phantom date warnings for same date', () => {
      const report = buildFullReport() + '\nData 25/06/2024 e ancora 25/06/2024 ripetuta.';
      const result = validateReport(report, 5, context);

      const phantomIssues = result.issues.filter((i) => i.type === 'phantom_date');
      expect(phantomIssues).toHaveLength(1);
    });

    it('should not run phantom dates check when no context', () => {
      const report = buildFullReport() + '\nIn data 25/06/2024 extra.';
      const result = validateReport(report, 5);

      expect(result.issues.filter((i) => i.type === 'phantom_date')).toHaveLength(0);
    });

    it('should handle ISO event dates correctly', () => {
      const ctx: ReportValidationContext = {
        events: [
          // buildFullReport() generates dates 15.01–15.05.2024
          { orderNumber: 1, eventDate: '2024-01-15' },
          { orderNumber: 2, eventDate: '2024-02-15' },
          { orderNumber: 3, eventDate: '2024-03-15' },
          { orderNumber: 4, eventDate: '2024-04-15' },
          { orderNumber: 5, eventDate: '2024-05-15' },
          { orderNumber: 6, eventDate: '2024-05-10' },
        ],
      };
      const report = buildFullReport() + '\nIn data 10/05/2024 il controllo.';
      const result = validateReport(report, 5, ctx);

      expect(result.issues.filter((i) => i.type === 'phantom_date')).toHaveLength(0);
    });
  });

  describe('numerical mismatch', () => {
    const contextWithCalc: ReportValidationContext = {
      events: [
        { orderNumber: 1, eventDate: '2024-01-15' },
      ],
      calculations: [
        { label: 'Invalidità temporanea totale', value: '45 giorni', days: 45 },
        { label: 'Invalidità temporanea parziale', value: '30 giorni', days: 30 },
        { label: 'Giorni ricovero', value: '10 giorni', days: 10 },
      ],
    };

    it('should detect ITT mismatch between report and calculations', () => {
      const report = buildFullReport() + '\nITT: 60 giorni di invalidità temporanea totale.';
      const result = validateReport(report, 5, contextWithCalc);

      expect(result.issues.some((i) =>
        i.type === 'numerical_mismatch' && i.message.includes('ITT') && i.message.includes('60'),
      )).toBe(true);
    });

    it('should not flag ITT within tolerance (±2 days)', () => {
      const report = buildFullReport() + '\nITT: 46 giorni complessivi.';
      const result = validateReport(report, 5, contextWithCalc);

      expect(result.issues.filter((i) => i.type === 'numerical_mismatch' && i.message.includes('ITT'))).toHaveLength(0);
    });

    it('should detect ITP mismatch', () => {
      const report = buildFullReport() + '\nITP: 90 giorni di invalidità temporanea parziale.';
      const result = validateReport(report, 5, contextWithCalc);

      expect(result.issues.some((i) =>
        i.type === 'numerical_mismatch' && i.message.includes('ITP'),
      )).toBe(true);
    });

    it('should detect ricovero days mismatch', () => {
      const report = buildFullReport() + '\nGiorni di ricovero: 25 giorni.';
      const result = validateReport(report, 5, contextWithCalc);

      expect(result.issues.some((i) =>
        i.type === 'numerical_mismatch' && i.message.includes('ricovero'),
      )).toBe(true);
    });

    it('should not run when no calculations provided', () => {
      const ctx: ReportValidationContext = { events: [] };
      const report = buildFullReport() + '\nITT: 999 giorni.';
      const result = validateReport(report, 5, ctx);

      expect(result.issues.filter((i) => i.type === 'numerical_mismatch')).toHaveLength(0);
    });

    it('should match alternative ITT phrasing', () => {
      const report = buildFullReport() + '\ninvalidità temporanea totale: 100 giorni.';
      const result = validateReport(report, 5, contextWithCalc);

      expect(result.issues.some((i) =>
        i.type === 'numerical_mismatch' && i.message.includes('ITT'),
      )).toBe(true);
    });
  });

  describe('event references removed', () => {
    it('should not check for [Ev.N] references (removed from report format)', () => {
      const report = buildFullReport() + '\nCome da [Ev.0] il paziente.';
      const result = validateReport(report, 5);
      // invalid_event_ref check removed — reports now cite by document type, author, date
      expect(result.issues.filter((i) => i.type === 'invalid_event_ref')).toHaveLength(0);
    });
  });

  describe('duplicate content', () => {
    it('should detect large duplicated blocks', () => {
      const block = Array(60).fill('parola duplicata ripetuta nel testo del report').join(' ');
      const report = buildFullReport() + `\n${block}\nAltra sezione\n${block}`;
      const result = validateReport(report, 5);

      expect(result.issues.some((i) => i.type === 'duplicate_content')).toBe(true);
    });

    it('should not flag short reports (too few words for meaningful duplicate)', () => {
      const report = buildFullReport();
      const result = validateReport(report, 5);

      expect(result.issues.filter((i) => i.type === 'duplicate_content')).toHaveLength(0);
    });

    it('should report only one duplicate issue to avoid noise', () => {
      const block1 = Array(60).fill('blocco uno duplicato nel testo').join(' ');
      const block2 = Array(60).fill('blocco due duplicato nel testo').join(' ');
      const report = buildFullReport() + `\n${block1}\n${block2}\n${block1}\n${block2}`;
      const result = validateReport(report, 5);

      const dupIssues = result.issues.filter((i) => i.type === 'duplicate_content');
      expect(dupIssues).toHaveLength(1);
    });

    it('should mark 3+ repeats as error', () => {
      const block = Array(60).fill('contenuto triplicato nel report medico legale').join(' ');
      const report = buildFullReport() + `\n${block}\nSezione A\n${block}\nSezione B\n${block}`;
      const result = validateReport(report, 5);

      const dupIssue = result.issues.find((i) => i.type === 'duplicate_content');
      expect(dupIssue?.severity).toBe('error');
    });
  });

  describe('combined issues', () => {
    it('should detect multiple issues simultaneously', () => {
      const report = `## Riassunto del caso
Breve. 01/01/1900.`;
      const result = validateReport(report, 5);

      expect(result.valid).toBe(false);
      // Should have: too_short, missing sections, sentinel date
      const types = result.issues.map((i) => i.type);
      expect(types).toContain('too_short');
      expect(types).toContain('missing_section');
      expect(types).toContain('sentinel_date_leak');
    });
  });

  describe('truncated_response type', () => {
    it('should accept truncated_response as a valid ReportIssue type', () => {
      // truncated_response is added externally by synthesis-service when finishReason='length'
      // This test validates the type is part of the ReportIssue union
      const issue: ReportIssue = {
        type: 'truncated_response',
        severity: 'error',
        message: 'LLM response was truncated',
      };
      expect(issue.type).toBe('truncated_response');
      expect(issue.severity).toBe('error');
    });
  });

  describe('backward compatibility', () => {
    it('should work without context (3rd arg optional)', () => {
      const report = buildFullReport();
      const result = validateReport(report, 5);

      expect(result.valid).toBe(true);
    });

    it('should work with context providing additional checks', () => {
      const context: ReportValidationContext = {
        events: [
          { orderNumber: 1, eventDate: '2024-01-15' },
          { orderNumber: 2, eventDate: '2024-02-15' },
          { orderNumber: 3, eventDate: '2024-03-15' },
          { orderNumber: 4, eventDate: '2024-04-15' },
          { orderNumber: 5, eventDate: '2024-05-15' },
        ],
      };
      const report = buildFullReport();
      const result = validateReport(report, 5, context);

      expect(result.valid).toBe(true);
    });
  });
});
