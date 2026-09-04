import { describe, it, expect } from 'vitest';
import type { ConsolidatedEvent } from '../consolidation/event-consolidator';
import { checkSelectiveCoverage, stripAttiIndex } from './selective-coverage';
import { buildAttiIndex } from '../synthesis/section-generator';

function ev(partial: Partial<ConsolidatedEvent>): ConsolidatedEvent {
  return {
    eventDate: '2024-03-12',
    datePrecision: 'giorno',
    eventType: 'visita',
    title: 'Evento',
    description: '',
    sourceType: 'referto',
    diagnosis: null,
    doctor: null,
    facility: null,
    confidence: 90,
    requiresVerification: false,
    reliabilityNotes: null,
    sourceText: '',
    sourcePages: [1],
    orderNumber: 1,
    documentId: 'd1',
    discrepancyNote: null,
    temporalScope: 'corrente',
    ...partial,
  };
}

describe('checkSelectiveCoverage', () => {
  it('reports no missing when every T1 event date appears in the narrative', () => {
    const events = [
      ev({ eventType: 'intervento', eventDate: '2024-03-12' }),
      ev({ eventType: 'diagnosi', eventDate: '2024-04-01' }),
    ];
    const content = 'In data 12.03.2024 intervento; il 01.04.2024 la diagnosi definitiva.';
    const res = checkSelectiveCoverage(content, events);
    expect(res.t1Total).toBe(2);
    expect(res.missing).toHaveLength(0);
  });

  it('flags a T1 event whose date is absent from the narrative', () => {
    const events = [
      ev({ eventType: 'intervento', eventDate: '2024-03-12' }),
      ev({ eventType: 'ricovero', eventDate: '2024-05-20', description: 'ricovero in chirurgia' }),
    ];
    const content = 'In data 12.03.2024 intervento chirurgico.'; // 20.05.2024 missing
    const res = checkSelectiveCoverage(content, events);
    expect(res.t1Total).toBe(2);
    expect(res.missing).toHaveLength(1);
    expect(res.missing[0].eventDate).toBe('2024-05-20');
  });

  it('ignores routine T2/T3 events (selective is allowed to paraphrase them)', () => {
    const events = [
      ev({ eventType: 'visita', eventDate: '2024-06-01' }), // T2
      ev({ eventType: 'terapia', eventDate: '2024-06-02' }), // T2
    ];
    const content = 'Controlli ambulatoriali nei mesi successivi.'; // no dates
    const res = checkSelectiveCoverage(content, events);
    expect(res.t1Total).toBe(0);
    expect(res.missing).toHaveLength(0);
  });

  it('does not flag sentinel-dated events (no real date to look for)', () => {
    const events = [ev({ eventType: 'diagnosi', eventDate: '1900-01-01' })];
    const content = 'Narrazione senza quella data.';
    const res = checkSelectiveCoverage(content, events);
    expect(res.missing).toHaveLength(0);
  });

  it('does NOT flag a month-precision T1 event narrated imprecisely (no fabricated day to match)', () => {
    // Stored as 2024-03-01 with datePrecision 'mese'; the narrative writes
    // "nel marzo 2024" (no day "1") — must not raise a spurious omission banner.
    const events = [ev({ eventType: 'diagnosi', eventDate: '2024-03-01', datePrecision: 'mese', diagnosis: 'frattura' })];
    const content = 'Nel marzo 2024 viene posta la diagnosi di frattura.';
    const res = checkSelectiveCoverage(content, events);
    expect(res.missing).toHaveLength(0);
  });

  it('does NOT flag a giorno-precision ricovero narrated as a date range', () => {
    // Ricovero (T1) stored 2024-03-12, narrated "dal 12 al 20 marzo 2024".
    const events = [ev({ eventType: 'ricovero', eventDate: '2024-03-12', datePrecision: 'giorno' })];
    const content = 'Ricovero in chirurgia dal 12 al 20 marzo 2024.';
    const res = checkSelectiveCoverage(content, events);
    expect(res.missing).toHaveLength(0);
  });

  it('treats a discordant event as T1 even if its type is routine', () => {
    const events = [
      ev({ eventType: 'visita', eventDate: '2024-07-07', discrepancyNote: 'DISCORDANTE: diagnosi divergenti' }),
    ];
    const content = 'Nessuna menzione.';
    const res = checkSelectiveCoverage(content, events);
    expect(res.t1Total).toBe(1);
    expect(res.missing).toHaveLength(1);
  });

  // Regressione (panel review #3/#5): su casi voluminosi la narrazione è
  // preceduta dall'indice analitico deterministico, che elenca OGNI data. Senza
  // strip, la rete anti-omissione non scatta mai. Deve invece misurare la sola
  // narrazione.
  it('still flags an omitted T1 even when the deterministic atti-index lists its date', () => {
    const events = [
      ev({ eventType: 'intervento', eventDate: '2024-03-12' }),
      ev({ eventType: 'ricovero', eventDate: '2024-05-20', description: 'ricovero in chirurgia' }),
    ];
    // L'indice elenca ENTRAMBE le date; la narrazione cita solo la prima.
    const content = `${buildAttiIndex(events)}\n\nIn data 12.03.2024 intervento chirurgico.`;
    const res = checkSelectiveCoverage(content, events);
    expect(res.t1Total).toBe(2);
    expect(res.missing).toHaveLength(1);
    expect(res.missing[0].eventDate).toBe('2024-05-20');
  });

  it('still passes when the narrative below the atti-index covers every T1', () => {
    const events = [
      ev({ eventType: 'intervento', eventDate: '2024-03-12' }),
      ev({ eventType: 'ricovero', eventDate: '2024-05-20' }),
    ];
    const content = `${buildAttiIndex(events)}\n\nIl 12.03.2024 l'intervento; il 20.05.2024 il ricovero.`;
    const res = checkSelectiveCoverage(content, events);
    expect(res.missing).toHaveLength(0);
  });
});

describe('stripAttiIndex', () => {
  it('removes the leading deterministic index block, keeping the narrative', () => {
    const events = [
      ev({ eventType: 'intervento', eventDate: '2024-03-12' }),
      ev({ eventType: 'ricovero', eventDate: '2024-05-20' }),
    ];
    const narrative = 'In data 12.03.2024 intervento chirurgico.';
    const stripped = stripAttiIndex(`${buildAttiIndex(events)}\n\n${narrative}`);
    expect(stripped.trim()).toBe(narrative);
    expect(stripped).not.toContain('Elenco analitico');
    expect(stripped).not.toContain('20.05.2024'); // la data viveva solo nell'indice
  });

  it('is a no-op when there is no leading index (single-section regen)', () => {
    const content = 'In data 12.03.2024 intervento chirurgico.';
    expect(stripAttiIndex(content)).toBe(content);
  });

  // Drift guard: se buildAttiIndex cambia intestazione, stripAttiIndex smette di
  // funzionare → questo test fallisce e ci avvisa.
  it('buildAttiIndex output starts with the prefix stripAttiIndex looks for', () => {
    const idx = buildAttiIndex([ev({ eventType: 'visita', eventDate: '2024-03-12' })]);
    expect(stripAttiIndex(`${idx}\n\nNARRAZIONE`).trim()).toBe('NARRAZIONE');
  });
});

describe('checkSelectiveCoverage — lab T1 load-bearing NON soppresso (fix panel 2026-06-24: mai perdere un fatto)', () => {
  it('un lab T1 (forma REALE: eventType esame + sourceType esame_ematochimico + diagnosi) assente dalla narrativa È segnalato come omesso', () => {
    // Forma REALE prodotta dalla pipeline (extract-events: "laboratorio"→eventType 'esame',
    // sourceType 'esame_ematochimico'). Un lab con diagnosi load-bearing (es. D-dimero→TVP)
    // è T1 e NON va soppresso: se l'LLM lo omette dalla doc-sanitaria, il perito va avvisato.
    const events = [ev({ eventType: 'esame', sourceType: 'esame_ematochimico', diagnosis: 'sospetta TVP', eventDate: '2024-05-01' })];
    const res = checkSelectiveCoverage('Narrazione clinica senza la data del prelievo.', events);
    expect(res.t1Total).toBe(1);
    expect(res.missing).toHaveLength(1);
  });

  it('un evento clinico NON-lab resta coperto/omesso normalmente', () => {
    const events = [ev({ eventType: 'diagnosi', eventDate: '2024-05-02' })];
    const res = checkSelectiveCoverage('Narrazione senza la data.', events);
    expect(res.t1Total).toBe(1);
    expect(res.missing).toHaveLength(1);
  });
});
