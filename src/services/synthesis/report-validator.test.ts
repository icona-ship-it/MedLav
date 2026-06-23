import { describe, it, expect } from 'vitest';
import {
  validateReport,
  getBlockingIssues,
  partitionBlockingIssues,
  NON_OVERRIDABLE_ERROR_TYPES,
  formatIssuesForLog,
} from './report-validator';
import type { ReportValidationContext, ReportIssue } from './report-validator';

function buildFullReport(overrides?: { events?: number }): string {
  const eventCount = overrides?.events ?? 5;
  const eventLines = Array.from({ length: eventCount }, (_, i) =>
    `In data 15.0${i + 1}.2024 il paziente veniva sottoposto a visita specialistica ortopedica presso la struttura ospedaliera ove veniva riscontrata una condizione clinica meritevole di approfondimento diagnostico e terapeutico specifico come da documentazione medica in atti. Il sanitario procedeva alla valutazione clinica completa con esame obiettivo articolare e funzionale, rilevando limitazione della mobilita articolare e dolore alla palpazione della regione interessata dalla lesione traumatica pregressa.`,
  ).join('\n');

  // Audit P1-VAL-001: MIN_WORD_COUNT raised to 1000. Added distinct padding blocks
  // to both Epicrisi and Conclusioni so the fixture stays above the threshold without
  // triggering duplicate_content (each block is unique text, different from the rest).
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
L'anamnesi remota non riporta comorbidita rilevanti mentre l'anamnesi prossima evidenzia un meccanismo lesivo
indiretto con prevalente interessamento delle strutture capsulari e legamentose dell'arto inferiore destro.
Gli accertamenti strumentali eseguiti nelle fasi acute e subacute hanno consentito una stadiazione morfologica
precisa della lesione, con documentazione fotografica intraoperatoria conservata nella cartella clinica prodotta.
Il programma fisioterapico domiciliare ha previsto sedute ambulatoriali con progressione graduale del carico
articolare e recupero funzionale monitorato mediante visite ambulatoriali mensili di controllo specialistico.
L'iter terapeutico complessivamente osservato risulta conforme alle indicazioni delle linee guida ortopediche
nazionali per il trattamento conservativo e chirurgico delle lesioni traumatiche dell'apparato locomotore.

## Conclusioni
Alla luce di quanto sopra esposto e sulla base della documentazione sanitaria esaminata, dalla disamina degli atti
risultano i seguenti elementi rilevanti ai fini della valutazione medico-legale del caso in oggetto.
I periodi di invalidita temporanea totale e parziale risultano congruenti con il decorso clinico documentato e
con la tipologia delle lesioni riportate. Le risultanze degli accertamenti diagnostici strumentali confermano
la presenza di esiti permanenti compatibili con il meccanismo lesivo riferito.
Il danno biologico permanente e stimato nella misura del 15% secondo i criteri tabellari vigenti, tenuto conto
degli esiti clinici documentati e della compromissione funzionale residua accertata in sede di ultimo controllo.
Si rileva la sussistenza del nesso di causalita tra il fatto traumatico ed i postumi documentati, non emergendo
elementi capaci di interrompere la catena eziopatogenetica che lega l'evento alla menomazione permanente residua.
La personalizzazione del danno biologico tiene conto delle specifiche ripercussioni sulla qualita della vita del
periziando, con particolare riguardo alle attivita realizzatrici e alle abitudini precedenti il fatto lesivo.
I criteri valutativi applicati seguono la metodologia propria della medicina legale italiana, con riferimento
alle tabelle del Tribunale competente e ai barèmes internazionali adottati per analoghe fattispecie cliniche.
La documentazione fotografica intraoperatoria corredata alla cartella clinica mostra il corretto posizionamento
dei mezzi di sintesi utilizzati durante l'atto chirurgico, compatibile con la tecnica standard raccomandata.
Le schede infermieristiche compilate durante la degenza non riportano eventi avversi di rilievo né complicanze
maggiori riconducibili a deviazioni dal percorso terapeutico ordinariamente seguito nei casi analoghi.
I referti ecografici successivi alla dimissione confermano il progressivo riassorbimento del versamento articolare
e la regolare ripresa della vascolarizzazione dei tessuti molli coinvolti dall'evento traumatico originario.
Il piano di reinserimento lavorativo concordato con il medico competente prevede il rientro graduale alle
mansioni ordinarie con limitazioni temporanee per le attivita che comportano sollevamento di carichi pesanti.
La valutazione ergonomica della postazione di lavoro effettuata dal datore di lavoro ha consentito di adottare
accorgimenti organizzativi utili a ridurre il carico biomeccanico sull'arto inferiore interessato dalla lesione.
La disamina delle tabelle posturali evidenzia una compromissione funzionale di grado lieve, compatibile con il
quadro clinico obiettivato in sede di visita peritale ambulatoriale eseguita alla presenza del periziando stesso.
La relazione del fisiatra curante attesta il regolare prosieguo del trattamento riabilitativo con indicazione di
mantenere una attivita motoria controllata, tale da favorire il consolidamento dei risultati funzionali raggiunti.
La valutazione del dolore cronico residuo tiene conto delle scale algometriche somministrate in sede di controllo,
con rilevazione di punteggi moderati in occasione di sforzi intensi o di specifici movimenti di carico assiale.
L'analisi delle spese mediche documentate evidenzia una congruenza complessiva con la natura e l'entita della
lesione traumatica accertata, non emergendo voci incongrue rispetto alle tariffe medie di mercato applicate
dalle strutture sanitarie della provincia di residenza del periziando nel periodo di riferimento temporale.`;
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

    it('treats a deliberately short report (150-500 words) as a non-blocking warning', () => {
      // ~225 words — sotto la soglia consigliata (500) ma sopra il minimo assoluto.
      const body = 'Il paziente e stato valutato e i dati clinici risultano coerenti con la documentazione esaminata. '.repeat(15);
      const report = `## Intestazione\n${body}\n## Considerazioni Medico-Legali\n${body.slice(0, 0)}`;
      const result = validateReport(report, 0);
      const tooShort = result.issues.find((i) => i.type === 'too_short');
      expect(tooShort?.severity).toBe('warning');
      expect(getBlockingIssues(result).some((i) => i.type === 'too_short')).toBe(false);
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

  describe('sentinel name leak — Antoniazzi il_fatto example', () => {
    it('should flag the Antoniazzi narrative example tokens if copied verbatim', () => {
      const report = buildFullReport() + '\nMentre attraversava la strada davanti alla Scuola Cangrande in Corso Porta Nuova veniva investita da un motociclo delle Poste.';
      const result = validateReport(report, 5);

      const leaks = result.issues.filter((i) => i.type === 'sentinel_name_leak');
      expect(leaks.length).toBeGreaterThanOrEqual(1);
      expect(leaks.some((i) => i.message.includes('Antoniazzi'))).toBe(true);
    });

    it('should not flag a clean report', () => {
      const result = validateReport(buildFullReport(), 5);
      expect(result.issues.filter((i) => i.type === 'sentinel_name_leak')).toHaveLength(0);
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

  describe('citazioni non verificate — sempre warning, mai bloccanti (2026-06-02)', () => {
    it('non blocca il report anche con oltre il 50% di citazioni assenti dall\'OCR', () => {
      const report = buildFullReport() +
        '\n"Citazione inventata numero uno che non esiste affatto nei documenti originali"' +
        '\n"Seconda citazione inventata totalmente assente dal testo OCR di riferimento"' +
        '\n"Terza frase fabbricata che non compare da nessuna parte nella documentazione"' +
        '\n"Quarta citazione del tutto inventata e non riscontrabile nei referti acquisiti"';
      const context: ReportValidationContext = {
        events: [],
        ocrText: [{ documentId: 'd1', pages: [{ ocrText: 'Testo OCR reale privo delle citazioni indicate.' }] }],
      };
      const result = validateReport(report, 5, context);
      const citationIssues = result.issues.filter((i) => i.type === 'unverified_citation');
      expect(citationIssues.length).toBeGreaterThan(0); // segnalate (visibili)
      expect(citationIssues.every((i) => i.severity === 'warning')).toBe(true); // ma solo warning
      expect(getBlockingIssues(result).some((i) => i.type === 'unverified_citation')).toBe(false); // mai bloccanti
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

  // ── A3: blocking validator ──────────────────────────────────────────

  describe('A3 — low event coverage', () => {
    // buildFullReport contains dates 15.01–15.05.2024. Passing events with
    // dates that never appear in the report drives coverage to 0%.
    const grossFailureContext: ReportValidationContext = {
      events: [
        { orderNumber: 1, eventDate: '2099-01-15' },
        { orderNumber: 2, eventDate: '2099-02-15' },
        { orderNumber: 3, eventDate: '2099-03-15' },
        { orderNumber: 4, eventDate: '2099-04-15' },
        { orderNumber: 5, eventDate: '2099-05-15' },
        { orderNumber: 6, eventDate: '2099-06-15' },
      ],
    };

    it('should HARD-BLOCK on gross failure (near-zero coverage with enough events)', () => {
      const report = buildFullReport();
      const result = validateReport(report, 6, grossFailureContext);

      const coverageIssues = result.issues.filter((i) => i.type === 'low_event_coverage');
      expect(coverageIssues).toHaveLength(1);
      expect(coverageIssues[0].severity).toBe('error');
      expect(result.eventCoverage).toBeLessThan(10);
      expect(result.valid).toBe(false);
    });

    it('should only WARN (not block) when too few dated events to trust the proxy', () => {
      // 4 events at 0% coverage — below the 5-event floor → warning, not block.
      const context: ReportValidationContext = {
        events: [
          { orderNumber: 1, eventDate: '2099-01-15' },
          { orderNumber: 2, eventDate: '2099-02-15' },
          { orderNumber: 3, eventDate: '2099-03-15' },
          { orderNumber: 4, eventDate: '2099-04-15' },
        ],
      };
      const result = validateReport(buildFullReport(), 4, context);
      const coverageIssues = result.issues.filter((i) => i.type === 'low_event_coverage');
      expect(coverageIssues).toHaveLength(1);
      expect(coverageIssues[0].severity).toBe('warning');
      // valid stays true (no blocking error from coverage)
      expect(result.issues.filter((i) => i.severity === 'error' && i.type === 'low_event_coverage')).toHaveLength(0);
    });

    it('should WARN (not block) in the 10-30% soft band', () => {
      // 5 events, ~20% covered: 1 of 5 dates present in the report.
      // buildFullReport contains 15.01.2024; the rest (2099) are absent → 1/5 = 20%.
      const context: ReportValidationContext = {
        events: [
          { orderNumber: 1, eventDate: '2024-01-15' },
          { orderNumber: 2, eventDate: '2099-02-15' },
          { orderNumber: 3, eventDate: '2099-03-15' },
          { orderNumber: 4, eventDate: '2099-04-15' },
          { orderNumber: 5, eventDate: '2099-05-15' },
        ],
      };
      const result = validateReport(buildFullReport(), 5, context);
      const coverageIssues = result.issues.filter((i) => i.type === 'low_event_coverage');
      expect(coverageIssues).toHaveLength(1);
      expect(coverageIssues[0].severity).toBe('warning');
      expect(result.eventCoverage).toBeGreaterThanOrEqual(10);
      expect(result.eventCoverage).toBeLessThan(30);
    });

    it('should not flag coverage when events are well represented', () => {
      const context: ReportValidationContext = {
        events: [
          { orderNumber: 1, eventDate: '2024-01-15' },
          { orderNumber: 2, eventDate: '2024-02-15' },
          { orderNumber: 3, eventDate: '2024-03-15' },
          { orderNumber: 4, eventDate: '2024-04-15' },
          { orderNumber: 5, eventDate: '2024-05-15' },
        ],
      };
      const result = validateReport(buildFullReport(), 5, context);
      expect(result.issues.filter((i) => i.type === 'low_event_coverage')).toHaveLength(0);
      expect(result.valid).toBe(true);
    });
  });

  describe('A3 — role-mandatory sections', () => {
    const baseEvents = [
      { orderNumber: 1, eventDate: '2024-01-15' },
      { orderNumber: 2, eventDate: '2024-02-15' },
      { orderNumber: 3, eventDate: '2024-03-15' },
      { orderNumber: 4, eventDate: '2024-04-15' },
      { orderNumber: 5, eventDate: '2024-05-15' },
    ];

    it('should pass when all required sections are present with content', () => {
      const context: ReportValidationContext = {
        events: baseEvents,
        requiredSectionTitles: ['Dati della Documentazione Sanitaria', 'Epicrisi', 'Conclusioni'],
      };
      const result = validateReport(buildFullReport(), 5, context);
      expect(result.issues.filter((i) => i.type === 'missing_section')).toHaveLength(0);
      expect(result.valid).toBe(true);
    });

    it('should block when a role-mandatory section is absent', () => {
      const context: ReportValidationContext = {
        events: baseEvents,
        requiredSectionTitles: ['Considerazioni Medico-Legali'],
      };
      const result = validateReport(buildFullReport(), 5, context);
      const missing = result.issues.filter((i) => i.type === 'missing_section');
      expect(missing.length).toBeGreaterThanOrEqual(1);
      expect(missing[0].severity).toBe('error');
      expect(missing[0].message).toContain('Considerazioni Medico-Legali');
      expect(result.valid).toBe(false);
    });

    it('should block when a required section heading exists but is empty', () => {
      const padding = Array.from({ length: 120 }, (_, i) => `parola${i}`).join(' ');
      const report = `## Dati della Documentazione Sanitaria
In data 15.01.2024 il paziente veniva visitato. ${padding}

## Visita Clinica

## Epicrisi
${padding}`;
      const context: ReportValidationContext = {
        events: baseEvents,
        requiredSectionTitles: ['Visita Clinica'],
      };
      const result = validateReport(report, 5, context);
      const missing = result.issues.filter((i) => i.type === 'missing_section');
      expect(missing.some((m) => m.message.includes('vuota') && m.message.includes('Visita Clinica'))).toBe(true);
      expect(result.valid).toBe(false);
    });

    it('should not run the required-section check when titles are not provided', () => {
      const context: ReportValidationContext = { events: baseEvents };
      const result = validateReport(buildFullReport(), 5, context);
      // Only the generic REQUIRED_SECTIONS check runs (both present here)
      expect(result.issues.filter((i) => i.type === 'missing_section')).toHaveLength(0);
    });

    // Post-audit regression: a section whose CONTENT starts with its own sub-heading
    // (the rendered intestazione begins with "### Dati del professionista …") was
    // wrongly reported empty because body-extraction stopped at the first '#'.
    // That would have blocked EVERY sectional report.
    // Distinct-word padding: long enough to clear MIN_WORD_COUNT and varied so it
    // never trips duplicate_content.
    const pad = (n: number, p: string) => Array.from({ length: n }, (_, i) => `${p}${i}`).join(' ');

    it('does NOT flag a section whose content starts with a ### sub-heading', () => {
      const report = `## Intestazione

### Dati del professionista incaricato
Dott.ssa Anna Belli — Medico legale, Specialista in Medicina Legale

### Dati del periziando
**Nome e cognome**: M.R.

## Dati della Documentazione Sanitaria
In data 15.03.2024 il paziente veniva visitato. ${pad(300, 'clin')}

## Epicrisi
${pad(300, 'epi')}`;
      const context: ReportValidationContext = {
        events: baseEvents,
        requiredSectionTitles: ['Intestazione', 'Dati della Documentazione Sanitaria', 'Epicrisi'],
      };
      const result = validateReport(report, 5, context);
      expect(result.issues.filter((i) => i.type === 'missing_section')).toHaveLength(0);
      expect(result.valid).toBe(true);
    });

    it('still flags a TRULY empty section (heading immediately followed by next section)', () => {
      const report = `## Intestazione

## Dati della Documentazione Sanitaria
In data 15.03.2024. ${pad(300, 'clin')}

## Epicrisi
${pad(300, 'epi')}`;
      const context: ReportValidationContext = {
        events: baseEvents,
        requiredSectionTitles: ['Intestazione'],
      };
      const result = validateReport(report, 5, context);
      expect(result.issues.some((i) => i.type === 'missing_section' && i.message.includes('vuota'))).toBe(true);
      expect(result.valid).toBe(false);
    });
  });

  describe('A3 — coverage counts extended Italian prose dates (post-audit)', () => {
    const pad = (n: number, p: string) => Array.from({ length: n }, (_, i) => `${p}${i}`).join(' ');
    it('does not block a narrative report that writes dates in prose', () => {
      // 6 events; report cites every date ONLY in extended Italian prose.
      const report = `## Dati della Documentazione Sanitaria
Il 15 gennaio 2024 visita iniziale. Il 20 febbraio 2024 controllo. Il 5 marzo 2024 esame.
Il 10 aprile 2024 intervento. Il 18 maggio 2024 dimissione. Il 25 giugno 2024 follow-up. ${pad(300, 'clin')}

## Epicrisi
${pad(300, 'epi')}`;
      const context: ReportValidationContext = {
        events: [
          { orderNumber: 1, eventDate: '2024-01-15' },
          { orderNumber: 2, eventDate: '2024-02-20' },
          { orderNumber: 3, eventDate: '2024-03-05' },
          { orderNumber: 4, eventDate: '2024-04-10' },
          { orderNumber: 5, eventDate: '2024-05-18' },
          { orderNumber: 6, eventDate: '2024-06-25' },
        ],
      };
      const result = validateReport(report, 6, context);
      expect(result.eventCoverage).toBeGreaterThanOrEqual(80);
      expect(result.issues.filter((i) => i.type === 'low_event_coverage')).toHaveLength(0);
    });
  });

  describe('A3 — getBlockingIssues policy', () => {
    it('should return blocking errors for a report with a sentinel date', () => {
      const report = buildFullReport().replace('In data 15.01.2024', 'In data 01/01/1900');
      const validation = validateReport(report, 5);
      const blocking = getBlockingIssues(validation);
      expect(blocking.some((i) => i.type === 'sentinel_date_leak')).toBe(true);
      expect(blocking.every((i) => i.severity === 'error')).toBe(true);
    });

    it('should return no blocking issues for a clean report', () => {
      const validation = validateReport(buildFullReport(), 5);
      expect(getBlockingIssues(validation)).toHaveLength(0);
    });

    it('should exclude non-blocking error types (duplicate_content) from blocking set', () => {
      // Three identical 60-word blocks → duplicate_content error (3+ repeats),
      // which is intentionally NOT in the blocking policy.
      const block = Array.from({ length: 60 }, (_, i) => `termine${i % 7}clinico`).join(' ');
      const report = `## Dati della Documentazione Sanitaria
${block}
${block}
${block}

## Epicrisi
${block}`;
      const validation = validateReport(report, 5);
      const dup = validation.issues.filter((i) => i.type === 'duplicate_content');
      expect(dup.length).toBeGreaterThanOrEqual(1);
      expect(getBlockingIssues(validation).some((i) => i.type === 'duplicate_content')).toBe(false);
    });
  });
});

describe('partitionBlockingIssues — manual unlock whitelist (Sprint 2.4-A2)', () => {
  function validationWith(issues: ReportIssue[]) {
    return { valid: false, issues, eventCoverage: 100 };
  }

  it('should classify quality blockers (sentinel_date_leak, header_mismatch) as overridable', () => {
    const validation = validationWith([
      { type: 'sentinel_date_leak', severity: 'error', message: 'sentinel 1900' },
      { type: 'header_mismatch', severity: 'error', message: 'tribunale mismatch' },
    ]);
    const { overridable, nonOverridable } = partitionBlockingIssues(validation);
    expect(overridable.map((i) => i.type).sort()).toEqual(['header_mismatch', 'sentinel_date_leak']);
    expect(nonOverridable).toHaveLength(0);
  });

  it('should NEVER allow overriding header_fabrication_signature (GDPR/fabrication leak)', () => {
    const validation = validationWith([
      { type: 'header_fabrication_signature', severity: 'error', message: 'Regnoto regression' },
      { type: 'low_event_coverage', severity: 'error', message: 'coverage 5%' },
    ]);
    const { overridable, nonOverridable } = partitionBlockingIssues(validation);
    expect(nonOverridable.map((i) => i.type)).toEqual(['header_fabrication_signature']);
    expect(overridable.map((i) => i.type)).toEqual(['low_event_coverage']);
  });

  it('should keep the non-overridable whitelist explicit (name leak + fabrication signature)', () => {
    expect(NON_OVERRIDABLE_ERROR_TYPES.has('sentinel_name_leak')).toBe(true);
    expect(NON_OVERRIDABLE_ERROR_TYPES.has('header_fabrication_signature')).toBe(true);
    // Quality gates stay overridable — the unlock would be useless otherwise.
    expect(NON_OVERRIDABLE_ERROR_TYPES.has('sentinel_date_leak')).toBe(false);
    expect(NON_OVERRIDABLE_ERROR_TYPES.has('missing_section')).toBe(false);
    expect(NON_OVERRIDABLE_ERROR_TYPES.has('too_short')).toBe(false);
  });

  it('should return empty partitions for a clean validation', () => {
    const { overridable, nonOverridable } = partitionBlockingIssues(validationWith([]));
    expect(overridable).toHaveLength(0);
    expect(nonOverridable).toHaveLength(0);
  });
});

describe('checkRequiredSections — aliasing heading intestazione (fix CRITICAL Parere)', () => {
  // Report parere realistico: contiene "La Documentazione Medica Prodotta" e
  // "Conclusioni" (soddisfa REQUIRED_SECTIONS), così la sola variabile è l'heading
  // intestazione aliasato. NB: REQUIRED_SECTIONS NON blocca il parere (il catalogo
  // parere ha quelle due sezioni); l'unico blocco era checkRequiredSections.
  const PARERE_DOC = 'Si e esaminata la documentazione sanitaria in atti relativa al periziando, comprensiva di referti, cartelle e accertamenti strumentali prodotti dalle parti.';
  const PARERE_CONCL = 'Conclusioni: sussiste nesso causale tra la condotta sanitaria contestata e il danno lamentato dal periziando, con i profili di responsabilita esposti.';

  it('NON segnala missing_section quando l\'intestazione è resa come "## PARERE PRO VERITATE"', () => {
    const report = `## PARERE PRO VERITATE\n\nIl sottoscritto perito redige il presente parere su incarico della parte committente.\n\n## La Documentazione Medica Prodotta\n\n${PARERE_DOC}\n\n## Conclusioni\n\n${PARERE_CONCL}`;
    const result = validateReport(report, 0, { requiredSectionTitles: ['Intestazione'], events: [] });
    expect(result.issues.filter((i) => i.type === 'missing_section')).toHaveLength(0);
  });

  it('segnala ancora missing_section quando l\'intestazione è davvero assente', () => {
    const report = `## La Documentazione Medica Prodotta\n\n${PARERE_DOC}\n\n## Conclusioni\n\n${PARERE_CONCL}`;
    const result = validateReport(report, 0, { requiredSectionTitles: ['Intestazione'], events: [] });
    expect(result.issues.some((i) => i.type === 'missing_section' && /intestazione/i.test(i.message))).toBe(true);
  });
});

describe('formatIssuesForLog — GDPR-safe (solo tipo+conteggio, mai il message clinico)', () => {
  it('riassume per tipo+conteggio e NON include il message (può citare testo clinico)', () => {
    const issues: ReportIssue[] = [
      { type: 'unverified_citation', severity: 'warning', message: 'Quoted text not found in OCR: "Mario Rossi, diagnosi di neoplasia maligna..."' },
      { type: 'unverified_citation', severity: 'warning', message: 'Quoted text not found in OCR: "frattura scomposta del femore..."' },
      { type: 'duplicate_content', severity: 'error', message: 'Duplicate block (2x): "il paziente Bianchi presentava..."' },
    ];
    const out = formatIssuesForLog(issues);
    expect(out).toBe('unverified_citation×2, duplicate_content×1');
    expect(out).not.toContain('Mario Rossi');
    expect(out).not.toContain('neoplasia');
    expect(out).not.toContain('femore');
    expect(out).not.toContain('Bianchi');
  });

  it('ritorna "none" per lista vuota', () => {
    expect(formatIssuesForLog([])).toBe('none');
  });
});
