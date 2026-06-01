import { describe, it, expect } from 'vitest';
import { generateTimelineHtml, type TimelineHtmlEvent } from './timeline-html-export';

function ev(overrides: Partial<TimelineHtmlEvent>): TimelineHtmlEvent {
  return {
    order_number: 1,
    event_date: '2025-10-22',
    event_type: 'esame',
    title: 'RX polso destro',
    description: 'Frattura del radio distale.',
    source_type: 'esame_strumentale',
    doctor: null,
    facility: null,
    ...overrides,
  };
}

describe('generateTimelineHtml — documento scritto (non tabella)', () => {
  it('renders prose blocks, not a data table', () => {
    const html = generateTimelineHtml({ caseCode: 'C1', patientInitials: 'M.R.', events: [ev({})] });
    expect(html).toContain('class="event-block"');
    expect(html).toContain('class="event-head"');
    expect(html).not.toContain('timeline-table');
    expect(html).not.toContain('<th');
  });

  it('shows "data — tipo", title and description per event', () => {
    const html = generateTimelineHtml({ caseCode: 'C1', patientInitials: null, events: [ev({})] });
    expect(html).toContain('&mdash; Esame'); // data — tipo
    expect(html).toContain('RX polso destro');
    expect(html).toContain('Frattura del radio distale.');
  });

  it('excludes events the perito marked out of the chronology', () => {
    const html = generateTimelineHtml({
      caseCode: 'C1',
      patientInitials: null,
      events: [
        ev({ title: 'Visita inclusa', is_relevant_for_chronology: true }),
        ev({ title: 'Prescrizione esclusa', event_type: 'prescrizione', is_relevant_for_chronology: false }),
      ],
    });
    expect(html).toContain('Visita inclusa');
    expect(html).not.toContain('Prescrizione esclusa');
  });

  it('includes events by default when the flag is absent (never auto-hide)', () => {
    const html = generateTimelineHtml({ caseCode: 'C1', patientInitials: null, events: [ev({ title: 'Senza flag' })] });
    expect(html).toContain('Senza flag');
  });

  it('drops sentinel-dated (undated) events from the chronology', () => {
    const html = generateTimelineHtml({
      caseCode: 'C1',
      patientInitials: null,
      events: [ev({ title: 'EventoDatato' }), ev({ title: 'EventoSenzaData', event_date: '1900-01-01' })],
    });
    expect(html).toContain('EventoDatato');
    expect(html).not.toContain('EventoSenzaData');
  });

  it('renders diagnosis but NO internal "DA VERIFICARE" flag (documento professionale)', () => {
    const html = generateTimelineHtml({
      caseCode: 'C1',
      patientInitials: null,
      events: [ev({ diagnosis: 'Frattura di Colles', requires_verification: true })],
    });
    expect(html).toContain('Frattura di Colles');
    expect(html).toContain('event-diag');
    expect(html).not.toContain('DA VERIFICARE'); // flag interno di lavoro, non nel documento finale
  });

  it('shows an empty-state message when no events qualify', () => {
    const html = generateTimelineHtml({ caseCode: 'C1', patientInitials: null, events: [] });
    expect(html).toContain('Nessun evento estratto.');
  });
});
