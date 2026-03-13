import { describe, it, expect } from 'vitest';
import { validateReport } from './report-validator';

function buildFullReport(overrides?: { events?: number }): string {
  const eventCount = overrides?.events ?? 5;
  const eventRefs = Array.from({ length: eventCount }, (_, i) =>
    `In data 15.0${i + 1}.2024 il paziente veniva sottoposto a visita presso la struttura ospedaliera ove veniva riscontrata una condizione clinica meritevole di approfondimento diagnostico e terapeutico come da documentazione in atti [Ev.${i + 1}].`,
  ).join('\n');

  return `## Riassunto del caso
Il paziente M.R. si presentava presso il Pronto Soccorso del Presidio Ospedaliero per dolore al ginocchio destro
insorto a seguito di trauma contusivo. La documentazione analizzata comprende referti specialistici ortopedici,
esami strumentali di imaging, cartella clinica del ricovero ordinario e lettere di dimissione ospedaliera.
Si procede alla ricostruzione cronologica della vicenda clinica e alla valutazione medico-legale del caso
con particolare attenzione ai profili di responsabilità professionale sanitaria e al nesso causale tra
la condotta dei sanitari e il danno biologico permanente residuato al paziente.

## Cronologia medico-legale
${eventRefs}

## Elementi di rilievo medico-legale
Si rileva un ritardo diagnostico significativo nella gestione del paziente. La condotta clinica appare censurabile
sotto il profilo della diligenza professionale per le ragioni ampiamente esposte nella cronologia medico-legale.
In particolare si osserva che il paziente non veniva sottoposto tempestivamente agli accertamenti diagnostici
indicati dalle linee guida di settore, con conseguente ritardo nella diagnosi e nel trattamento della patologia.
Il nesso di causalità tra la condotta omissiva e il danno biologico permanente appare configurabile con
ragionevole certezza medico-legale sulla base del criterio del più probabile che non.

## Conclusioni
A parere di questo CTU, alla luce di quanto sopra esposto e dedotto, il nesso causale appare configurabile
con ragionevole certezza medico-legale tra la condotta omissiva dei sanitari e il danno biologico permanente
stimato nella misura del 15% secondo i criteri tabellari vigenti. I periodi di invalidità temporanea
risultano congruenti con il decorso clinico documentato.`;
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

    it('should return valid even with warnings present', () => {
      const report = buildFullReport() + '\nIn data 01/01/1900 si segnala...';
      const result = validateReport(report, 5);

      expect(result.valid).toBe(true);
      expect(result.issues.some((i) => i.type === 'sentinel_date_leak')).toBe(true);
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
      const shortReport = '## Riassunto del caso\nBreve.\n## Cronologia medico-legale\nEvento.\n## Elementi di rilievo\nNulla.';
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
    it('should detect missing cronologia', () => {
      const report = `## Riassunto del caso
${Array(100).fill('parola').join(' ')}

## Elementi di rilievo
${Array(100).fill('parola').join(' ')}`;
      const result = validateReport(report, 0);

      expect(result.issues.some((i) =>
        i.type === 'missing_section' && i.message.includes('Cronologia'),
      )).toBe(true);
    });

    it('should detect missing riassunto', () => {
      const report = `## Cronologia medico-legale
${Array(100).fill('parola').join(' ')}

## Elementi di rilievo
${Array(100).fill('parola').join(' ')}`;
      const result = validateReport(report, 0);

      expect(result.issues.some((i) =>
        i.type === 'missing_section' && i.message.includes('Riassunto'),
      )).toBe(true);
    });

    it('should detect missing elementi di rilievo', () => {
      const report = `## Riassunto del caso
${Array(100).fill('parola').join(' ')}

## Cronologia medico-legale
${Array(100).fill('parola').join(' ')}`;
      const result = validateReport(report, 0);

      expect(result.issues.some((i) =>
        i.type === 'missing_section' && i.message.includes('Elementi'),
      )).toBe(true);
    });

    it('should accept alternative section names like "considerazioni medico"', () => {
      const report = `## Riassunto del caso
${Array(100).fill('parola').join(' ')}

## Cronologia medico-legale
${Array(100).fill('parola').join(' ')}

## Considerazioni medico-legali
${Array(100).fill('parola').join(' ')}`;
      const result = validateReport(report, 0);

      expect(result.issues.filter((i) => i.type === 'missing_section')).toHaveLength(0);
    });

    it('should accept "valutazione di merito" as elementi variant', () => {
      const report = `## Riassunto del caso
${Array(100).fill('parola').join(' ')}

## Cronologia medico-legale
${Array(100).fill('parola').join(' ')}

## Valutazione di merito
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
    it('should report 100% coverage when all events referenced', () => {
      const report = buildFullReport({ events: 3 });
      const result = validateReport(report, 3);

      expect(result.eventCoverage).toBe(100);
      expect(result.issues.filter((i) => i.type === 'low_event_coverage')).toHaveLength(0);
    });

    it('should warn when less than 50% of events referenced', () => {
      const report = buildFullReport({ events: 2 });
      const result = validateReport(report, 10);

      expect(result.eventCoverage).toBe(20);
      expect(result.issues.some((i) =>
        i.type === 'low_event_coverage' && i.message.includes('20%'),
      )).toBe(true);
    });

    it('should count unique event references only', () => {
      const report = buildFullReport({ events: 3 }) + '\nRipeto [Ev.1] e [Ev.2] e [Ev.1].';
      const result = validateReport(report, 3);

      // Still 3 unique: Ev.1, Ev.2, Ev.3
      expect(result.eventCoverage).toBe(100);
    });

    it('should return 100% coverage when eventCount is 0', () => {
      const report = buildFullReport({ events: 0 });
      const result = validateReport(report, 0);

      expect(result.eventCoverage).toBe(100);
    });

    it('should report 0% when no events are referenced', () => {
      const report = `## Riassunto del caso
${Array(100).fill('parola').join(' ')}

## Cronologia medico-legale
${Array(100).fill('parola').join(' ')}

## Elementi di rilievo
${Array(100).fill('parola').join(' ')}`;
      const result = validateReport(report, 10);

      expect(result.eventCoverage).toBe(0);
      expect(result.issues.some((i) => i.type === 'low_event_coverage')).toBe(true);
    });
  });

  describe('combined issues', () => {
    it('should detect multiple issues simultaneously', () => {
      const report = `## Riassunto del caso
Breve. 01/01/1900.`;
      const result = validateReport(report, 5);

      expect(result.valid).toBe(false);
      // Should have: too_short, missing cronologia, missing elementi, sentinel, low coverage
      const types = result.issues.map((i) => i.type);
      expect(types).toContain('too_short');
      expect(types).toContain('missing_section');
      expect(types).toContain('sentinel_date_leak');
      expect(types).toContain('low_event_coverage');
    });
  });
});
