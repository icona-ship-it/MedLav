import { describe, it, expect } from 'vitest';

import {
  SELETTIVITA_POLICY,
  classifyDistillCategory,
  isExcludableByPolicy,
  distillDocSanitariaEvents,
} from './selettivita-policy';

/**
 * Distillazione v2 (default = comportamento osservato nei 3 gold Lavini,
 * founding doc: "se mancano le risposte, default = gold, provvisorio").
 * Le categorie sono a euristica di CONTENUTO: questi tipi vivono dentro
 * cartella_clinica e non hanno un documentType/eventType dedicato.
 */

function makeEvent(overrides?: Record<string, unknown>) {
  return {
    eventType: 'terapia',
    sourceType: 'cartella_clinica',
    title: 'Evento clinico',
    description: 'Descrizione generica.',
    sourceText: null as string | null,
    diagnosis: null as string | null,
    discrepancyNote: null as string | null,
    ...overrides,
  };
}

describe('classifyDistillCategory', () => {
  it('should classify daily therapy-administration logs as log_terapia', () => {
    expect(classifyDistillCategory(makeEvent({
      title: 'Somministrazione terapia',
      description: 'Foglio unico di terapia: paracetamolo 1g ore 8-16-24.',
    }))).toBe('log_terapia');
  });

  it('should classify nursing diary entries as diario_infermieristico', () => {
    expect(classifyDistillCategory(makeEvent({
      title: 'Diario infermieristico',
      description: 'Consegne infermieristiche del turno notte.',
    }))).toBe('diario_infermieristico');
  });

  it('should classify anesthesia chart / OR checklist as cartella_anestesiologica', () => {
    expect(classifyDistillCategory(makeEvent({
      title: 'Valutazione anestesiologica',
      description: 'Scheda anestesiologica: ASA 2, checklist di sala operatoria compilata.',
    }))).toBe('cartella_anestesiologica');
  });

  it('should classify assessment scales as scala_valutazione', () => {
    expect(classifyDistillCategory(makeEvent({
      title: 'Scala di Braden',
      description: 'Punteggio Braden 18, rischio cadute Conley 3.',
    }))).toBe('scala_valutazione');
    expect(classifyDistillCategory(makeEvent({
      title: 'Valutazione SVAMA',
      description: 'Scheda SVAMA compilata in ingresso.',
    }))).toBe('scala_valutazione');
  });

  it('should classify transfusion records as trasfusione', () => {
    expect(classifyDistillCategory(makeEvent({
      title: 'Trasfusione emazie',
      description: 'Sacca di emazie concentrate, prove crociate compatibili.',
    }))).toBe('trasfusione');
  });

  it('should return null for ordinary clinical events (referti, visite, interventi)', () => {
    expect(classifyDistillCategory(makeEvent({
      title: 'Referto RX bacino',
      description: 'Frattura composta del ramo ileo-ischio-pubico destro.',
    }))).toBeNull();
    expect(classifyDistillCategory(makeEvent({
      title: 'Visita ortopedica di controllo',
      description: 'Buon consolidamento, prosegue FKT.',
    }))).toBeNull();
  });
});

describe('isExcludableByPolicy', () => {
  it('should exclude an omitted-category event of routine (T2/T3)', () => {
    expect(isExcludableByPolicy(makeEvent({
      title: 'Somministrazione terapia',
      description: 'Foglio unico di terapia, schema giornaliero.',
    }))).toBe(true);
  });

  it('should NEVER exclude a T1 load-bearing event (diagnosi documentata) — mai perdere un fatto', () => {
    expect(isExcludableByPolicy(makeEvent({
      title: 'Diario infermieristico',
      description: 'Consegne infermieristiche.',
      diagnosis: 'Trombosi venosa profonda arto inferiore sinistro',
    }))).toBe(false);
  });

  it('should NEVER exclude an event with discordant sources', () => {
    expect(isExcludableByPolicy(makeEvent({
      title: 'Trasfusione emazie',
      description: 'Sacca di emazie, prove crociate.',
      discrepancyNote: 'DISCORDANTE: data non coerente tra i documenti',
    }))).toBe(false);
  });

  it('should not exclude unclassified events', () => {
    expect(isExcludableByPolicy(makeEvent({
      title: 'Referto RM ginocchio',
      description: 'Lesione del menisco mediale.',
    }))).toBe(false);
  });
});

describe('distillDocSanitariaEvents', () => {
  it('should partition kept vs omitted with per-category stats', () => {
    const events = [
      makeEvent({ title: 'Referto RX', description: 'Frattura composta.' }),
      makeEvent({ title: 'Somministrazione terapia', description: 'Foglio unico di terapia.' }),
      makeEvent({ title: 'Diario infermieristico', description: 'Consegne del turno.' }),
      makeEvent({ title: 'Scala di Barthel', description: 'Punteggio 85.' }),
    ];
    const { kept, stats } = distillDocSanitariaEvents(events);
    expect(kept).toHaveLength(1);
    expect(kept[0].title).toBe('Referto RX');
    expect(stats.total).toBe(4);
    expect(stats.omitted).toBe(3);
    expect(stats.byCategory['log_terapia']).toBe(1);
    expect(stats.byCategory['diario_infermieristico']).toBe(1);
    expect(stats.byCategory['scala_valutazione']).toBe(1);
  });

  it('should keep everything when nothing matches (no silent loss)', () => {
    const events = [
      makeEvent({ title: 'Verbale operatorio', description: 'Riduzione e sintesi.' }),
      makeEvent({ title: 'Lettera di dimissione', description: 'Decorso regolare.' }),
    ];
    const { kept, stats } = distillDocSanitariaEvents(events);
    expect(kept).toHaveLength(2);
    expect(stats.omitted).toBe(0);
  });
});

describe('SELETTIVITA_POLICY (config default = gold osservato)', () => {
  it('should map every gold-omitted category to "ometti"', () => {
    expect(SELETTIVITA_POLICY.log_terapia).toBe('ometti');
    expect(SELETTIVITA_POLICY.diario_infermieristico).toBe('ometti');
    expect(SELETTIVITA_POLICY.cartella_anestesiologica).toBe('ometti');
    expect(SELETTIVITA_POLICY.scala_valutazione).toBe('ometti');
    expect(SELETTIVITA_POLICY.trasfusione).toBe('ometti');
  });
});
