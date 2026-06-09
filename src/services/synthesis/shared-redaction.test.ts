import { describe, it, expect } from 'vitest';
import { redactMaterializedDocSanitariaForPublic, redactEventsForPublic } from './shared-redaction';
import { DETERMINISTIC_MARKERS } from '../calculations/deterministic-tables';

describe('redactMaterializedDocSanitariaForPublic (GDPR)', () => {
  it('strips a MATERIALIZED (AI-variant) documentazione sanitaria body', () => {
    const synthesis = [
      '## Documentazione Sanitaria',
      '',
      'In data 12.03.2024 il Dott. Rossi presso Ospedale San Luca rileva «frattura composta del radio».',
      '',
      '## Conclusioni',
      '',
      'Testo conclusioni.',
    ].join('\n');

    const out = redactMaterializedDocSanitariaForPublic(synthesis);

    // No verbatim clinical content / names survive on the public surface.
    expect(out).not.toContain('Dott. Rossi');
    expect(out).not.toContain('Ospedale San Luca');
    expect(out).not.toContain('frattura composta del radio');
    expect(out).toContain('consultabile nella perizia completa');
    // Other sections are untouched.
    expect(out).toContain('Testo conclusioni.');
  });

  it('leaves the DETERMINISTIC placeholder (sentinel) untouched — expand handles it', () => {
    const synthesis = [
      '## Documentazione Sanitaria',
      '',
      `Di seguito la documentazione.\n\n${DETERMINISTIC_MARKERS.DOC_SANITARIA}`,
      '',
      '## Conclusioni',
      '',
      'X.',
    ].join('\n');

    const out = redactMaterializedDocSanitariaForPublic(synthesis);
    expect(out).toContain(DETERMINISTIC_MARKERS.DOC_SANITARIA);
  });

  it('is a no-op when there is no documentazione sanitaria section', () => {
    const synthesis = '## Conclusioni\n\nSolo conclusioni, nessuna doc sanitaria.';
    expect(redactMaterializedDocSanitariaForPublic(synthesis)).toBe(synthesis);
  });

  it('handles empty/missing synthesis', () => {
    expect(redactMaterializedDocSanitariaForPublic('')).toBe('');
  });

  // Regressione GDPR (audit 2026-06-09): un heading `## ` interno alla narrazione
  // AI materializzata NON deve interrompere la redazione lasciando esposto il
  // testo clinico successivo.
  it('redige TUTTO il corpo anche con un heading ## spurio dentro la narrazione AI', () => {
    const synthesis = [
      '## Documentazione Sanitaria',
      '',
      'In data 12.03.2024 il Dott. Rossi rileva «frattura composta del radio».',
      '',
      '## Referto Radiologico',
      '',
      'Dott. Bianchi presso Ospedale San Luca: «frattura scomposta omero dx», prognosi 40 gg.',
      '',
      '## Conclusioni',
      '',
      'Testo conclusioni.',
    ].join('\n');

    const out = redactMaterializedDocSanitariaForPublic(synthesis);

    expect(out).not.toContain('Dott. Rossi');
    expect(out).not.toContain('frattura composta del radio');
    // Il contenuto DOPO l'heading spurio interno deve sparire anch'esso.
    expect(out).not.toContain('Dott. Bianchi');
    expect(out).not.toContain('Ospedale San Luca');
    expect(out).not.toContain('frattura scomposta omero dx');
    expect(out).not.toContain('Referto Radiologico');
    expect(out).toContain('consultabile nella perizia completa');
    // La sezione canonica successiva resta intatta.
    expect(out).toContain('Testo conclusioni.');
  });

  it('redige entrambi i blocchi quando la doc-sanitaria compare con due heading distinti', () => {
    const synthesis = [
      '## Dati della Documentazione Sanitaria',
      '',
      'Dott. Verdi: «lussazione spalla sx».',
      '',
      '## Documentazione Sanitaria',
      '',
      'Dott. Neri presso Clinica Sant\'Anna: «trauma cranico commotivo».',
      '',
      '## Conclusioni',
      '',
      'Fine.',
    ].join('\n');

    const out = redactMaterializedDocSanitariaForPublic(synthesis);

    expect(out).not.toContain('Dott. Verdi');
    expect(out).not.toContain('lussazione spalla sx');
    expect(out).not.toContain('Dott. Neri');
    expect(out).not.toContain('trauma cranico commotivo');
    expect(out).toContain('consultabile nella perizia completa');
    expect(out).toContain('Fine.');
  });
});

describe('redactEventsForPublic (GDPR Art.9 — tab Eventi/cronologia link pubblico)', () => {
  it('rimuove diagnosi/medico/struttura/descrizione, mantiene data/tipo/titolo/ordine', () => {
    const events = [
      {
        id: '1', order_number: 1, title: 'Ricovero', event_date: '2024-03-12', event_type: 'ricovero',
        description: 'Paziente con frattura scomposta dell\'omero', diagnosis: 'Frattura omero dx',
        doctor: 'Dott. Rossi', facility: 'Ospedale San Luca',
      },
    ];
    const out = redactEventsForPublic(events);

    expect(out[0].description).toBe('');
    expect(out[0].diagnosis).toBeNull();
    expect(out[0].doctor).toBeNull();
    expect(out[0].facility).toBeNull();
    // Struttura della timeline preservata.
    expect(out[0].title).toBe('Ricovero');
    expect(out[0].event_date).toBe('2024-03-12');
    expect(out[0].event_type).toBe('ricovero');
    expect(out[0].order_number).toBe(1);
    // Immutabilità: l'oggetto originale non viene mutato.
    expect(events[0].doctor).toBe('Dott. Rossi');
  });

  it('gestisce un array vuoto', () => {
    expect(redactEventsForPublic([])).toEqual([]);
  });
});
