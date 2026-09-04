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

  // Benchmark gold passaniti (2026-06-10): il perito elimina SEMPRE il tipo
  // evento, le etichette FONTE e il meta-block di testa. Restano: data+titolo
  // in testa, descrizione, attribuzione "Dr. — Struttura", watermark e footer.
  it('shows "data — titolo" in testa e la descrizione (niente tipo evento)', () => {
    const html = generateTimelineHtml({ caseCode: 'C1', patientInitials: null, events: [ev({})] });
    expect(html).toContain('RX polso destro');
    expect(html).toContain('Frattura del radio distale.');
    expect(html).not.toContain('&mdash; Esame'); // tipo evento eliminato dal perito
  });

  it('niente titolo grande né meta-block (Caso/Paziente/Modulo/Numero eventi) — GDPR + gold', () => {
    const html = generateTimelineHtml({
      caseCode: 'C1', patientInitials: 'M.R.', events: [ev({})], moduleName: 'Cronistoria',
    });
    expect(html).not.toContain('<h1>');
    expect(html).not.toContain('Paziente:');
    expect(html).not.toContain('Modulo:');
    expect(html).not.toContain('Numero eventi:');
    expect(html).not.toContain('header-info');
    // Watermark RISERVATO e footer LegMed mantenuti (il perito li conserva)
    expect(html).toContain('RISERVATO');
    expect(html).toContain('Generato con LegMed');
  });

  it('riga meta senza etichetta FONTE: resta "Dr. — Struttura"', () => {
    const html = generateTimelineHtml({
      caseCode: 'C1', patientInitials: null,
      events: [ev({ doctor: 'Mario Esempi', facility: 'UOC Ortopedia, Ospedale X' })],
    });
    expect(html).toContain('Dr. Mario Esempi');
    expect(html).toContain('UOC Ortopedia, Ospedale X');
    expect(html).not.toContain('Esame Strumentale'); // etichetta FONTE eliminata
    expect(html).not.toContain('FONTE');
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

  // Feedback beta 2026-07-20: un documento = UN blocco con intestazione
  // (tipo + data), non tante intestazioni indipendenti per ogni evento.
  it('raggruppa gli eventi per documento con intestazione-blocco (tipo classificato, mai nomi file)', () => {
    const html = generateTimelineHtml({
      caseCode: 'C1',
      patientInitials: null,
      events: [
        ev({ title: 'Accesso PS', document_id: 'doc-ps' }),
        ev({ title: 'Dimissione PS', document_id: 'doc-ps' }),
        ev({ title: 'Controllo ortopedico', document_id: 'doc-visita', event_date: '2024-04-01' }),
      ],
      documents: [
        { id: 'doc-ps', documentType: 'cartella_clinica' },
        { id: 'doc-visita', documentType: 'referto_specialistico' },
      ],
    });
    const groups = html.match(/<h2 class="doc-group-head">/g) ?? [];
    expect(groups).toHaveLength(2);
    expect(html).toContain('Cartella Clinica');
    // gli eventi dello stesso documento stanno nello stesso blocco
    expect(html.indexOf('Accesso PS')).toBeLessThan(html.indexOf('Dimissione PS'));
  });
});

describe('generateTimelineHtml — ambito temporale (feedback medici 2026-08-19 Mail 2: referto di 3 pagine)', () => {
  const referto = () => generateTimelineHtml({
    caseCode: 'C2',
    patientInitials: null,
    events: [
      ev({ order_number: 1, title: 'Riscontro nodulo mammario', event_date: '2026-02-27', document_id: 'ref', temporal_scope: 'retrospettivo' }),
      ev({ order_number: 2, title: 'Mastectomia', event_date: '2026-04-14', document_id: 'ref', temporal_scope: 'retrospettivo' }),
      ev({ order_number: 3, title: 'Visita oncologica', event_date: '2026-05-22', document_id: 'ref', temporal_scope: 'corrente', facility: 'UOC Oncologia Cittàdemo' }),
      ev({ order_number: 4, title: 'Scintigrafia ossea programmata', event_date: '2026-06-18', document_id: 'ref', temporal_scope: 'programmato' }),
    ],
    documents: [{ id: 'ref', documentType: 'referto_specialistico' }],
  });

  it('intestazione del blocco con la sola data della visita', () => {
    const html = referto();
    expect(html).toContain('in data 22.05.2026');
    expect(html).not.toContain('dal 27.02.2026');
  });

  it('la visita viene PRIMA dei sotto-elenchi; anamnesi e programmato sotto le rispettive etichette; nessun evento perso', () => {
    const html = referto();
    const iVisita = html.indexOf('Visita oncologica');
    const iAnamnesi = html.indexOf('Riferito nel documento (anamnesi / storia clinica)');
    const iProgrammato = html.indexOf('Programmato / previsto nel documento');
    expect(iVisita).toBeGreaterThan(-1);
    expect(iAnamnesi).toBeGreaterThan(iVisita);
    expect(iProgrammato).toBeGreaterThan(iAnamnesi);
    expect(html.indexOf('Riscontro nodulo mammario')).toBeGreaterThan(iAnamnesi);
    expect(html.indexOf('Scintigrafia ossea programmata')).toBeGreaterThan(iProgrammato);
    expect(html).toContain('Mastectomia');
  });

  it('senza eventi retrospettivi/programmati non compaiono etichette di sotto-elenco (righe legacy invariate)', () => {
    const html = generateTimelineHtml({
      caseCode: 'C3', patientInitials: null,
      events: [ev({ title: 'Accesso PS', document_id: 'doc-ps' })],
      documents: [{ id: 'doc-ps', documentType: 'cartella_clinica' }],
    });
    expect(html).not.toContain('Riferito nel documento');
    expect(html).not.toContain('Programmato / previsto');
  });
});

describe('generateTimelineHtml — senza-data nei sotto-elenchi e date per precisione (collaudo foto vere 2026-09-04)', () => {
  it('un follow-up PROGRAMMATO senza data compare nel sotto-elenco come "s.d."; un corrente senza data resta escluso', () => {
    const html = generateTimelineHtml({
      caseCode: 'C4', patientInitials: null,
      events: [
        ev({ order_number: 1, title: 'Visita oncologica', event_date: '2026-05-22', document_id: 'ref', temporal_scope: 'corrente' }),
        ev({ order_number: 2, title: 'Visita ginecologica basale (programmata)', event_date: '1900-01-01', document_id: 'ref', temporal_scope: 'programmato' }),
        ev({ order_number: 3, title: 'EventoCorrenteSenzaData', event_date: '1900-01-01', document_id: 'ref' }),
      ],
      documents: [{ id: 'ref', documentType: 'referto_specialistico' }],
    });
    expect(html).toContain('Visita ginecologica basale (programmata)');
    expect(html).toContain('s.d. &mdash; Visita ginecologica');
    expect(html).not.toContain('EventoCorrenteSenzaData');
    expect(html).toContain('in data 22.05.2026');
  });

  it('una menzione anamnestica anno-only si stampa "2019", mai "01.01.2019"', () => {
    const html = generateTimelineHtml({
      caseCode: 'C5', patientInitials: null,
      events: [
        ev({ order_number: 1, title: 'Visita', event_date: '2026-05-22', document_id: 'ref', temporal_scope: 'corrente' }),
        ev({ order_number: 2, title: 'Pregressa meniscectomia', event_date: '2019-01-01', date_precision: 'anno', document_id: 'ref', temporal_scope: 'retrospettivo' }),
      ],
      documents: [{ id: 'ref', documentType: 'referto_specialistico' }],
    });
    expect(html).toContain('2019 &mdash; Pregressa meniscectomia');
    expect(html).not.toContain('01.01.2019');
  });
});

describe('generateTimelineHtml — trascrizione per documento e appendice di verifica (2026-09-04)', () => {
  it('rende le due sezioni quando fornite, dopo la cronologia; assenti se vuote', () => {
    const base = { caseCode: 'C6', patientInitials: null, events: [ev({ title: 'Visita', document_id: 'ref' })], documents: [{ id: 'ref', documentType: 'referto_specialistico' }] };
    const withSections = generateTimelineHtml({
      ...base,
      transcriptionMarkdown: '**Referto Specialistico, UOC Demo in data 22.05.2026:**\n\n«Visita oncologica di controllo»',
      verificationAppendixMarkdown: '**Documenti**\n- Documenti ricevuti: 1',
    });
    expect(withSections).toContain('Trascrizione dei documenti');
    expect(withSections).toContain('Appendice di verifica');
    expect(withSections).toContain('Documenti ricevuti: 1');
    expect(withSections.indexOf('Trascrizione dei documenti')).toBeGreaterThan(withSections.indexOf('class="timeline"'));
    const without = generateTimelineHtml({ ...base, transcriptionMarkdown: '', verificationAppendixMarkdown: null });
    expect(without).not.toContain('Trascrizione dei documenti');
    expect(without).not.toContain('Appendice di verifica');
  });
});
