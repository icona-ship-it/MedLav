import { describe, it, expect } from 'vitest';
import {
  applyTemporalSanityFlags,
  buildHandwrittenPageSet,
  capEventsFromHandwrittenPages,
  FUTURE_DATE_CONFIDENCE_CAP,
  HANDWRITTEN_PAGE_CONFIDENCE_CAP,
} from './event-sanity';

function makeEvent(overrides: Partial<Parameters<typeof applyTemporalSanityFlags>[0][number]> = {}) {
  return {
    eventDate: '2026-05-13',
    title: 'Visita ortopedica',
    description: 'Visita eseguita, gesso confezionato.',
    confidence: 90,
    requiresVerification: false,
    reliabilityNotes: null,
    sourcePages: [1],
    ...overrides,
  };
}

const OPTS = { todayIso: '2026-07-20', incidentIso: '2026-05-11' };

describe('event-sanity — date impossibili e appuntamenti (CASO-2026-028, beta 2026-07-20)', () => {
  it('evento con data FUTURA → cap 40 + requiresVerification (il "controllo del 10.07" mai avvenuto)', () => {
    const { events, flaggedCount } = applyTemporalSanityFlags(
      [makeEvent({ eventDate: '2026-10-07', title: 'Controllo clinico-radiografico', description: 'Controllo a 30 giorni.' })],
      OPTS,
    );
    expect(flaggedCount).toBe(1);
    expect(events[0].confidence).toBeLessThanOrEqual(FUTURE_DATE_CONFIDENCE_CAP);
    expect(events[0].requiresVerification).toBe(true);
    expect(events[0].reliabilityNotes).toContain('Data futura');
  });

  it('guarigione/esiti PRIMA del sinistro → nota NEUTRA di verifica, SENZA cap (audit: può essere preesistenza legittima)', () => {
    const { events } = applyTemporalSanityFlags(
      [makeEvent({
        eventDate: '2026-01-08',
        title: 'Visita di controllo in esiti di frattura',
        description: 'Controllo in esiti consolidati. La frattura è clinicamente guarita.',
      })],
      OPTS,
    );
    // Flag sì (il manoscritto 08.07→08.01 del caso beta), ma nessun cap e
    // wording neutro: un certificato di guarigione di un infortunio PRECEDENTE
    // (stato anteriore) è un fatto vero e legalmente rilevante.
    expect(events[0].requiresVerification).toBe(true);
    expect(events[0].confidence).toBe(90);
    expect(events[0].reliabilityNotes).toContain('preesistenza');
    expect(events[0].reliabilityNotes).not.toContain('probabile data mal letta (documento manoscritto?)');
  });

  it('appuntamento citato solo in CODA alla descrizione (dimissione reale) → NON flaggato', () => {
    const { flaggedCount } = applyTemporalSanityFlags(
      [makeEvent({
        title: 'Dimissione',
        description: 'Paziente in buone condizioni. Prosecuzione tutore per due settimane. Si consiglia inoltre controllo ortopedico programmato a 30 giorni presso ambulatorio.',
      })],
      OPTS,
    );
    expect(flaggedCount).toBe(0);
  });

  it('evento PRE-sinistro SENZA semantica di guarigione (preesistenza legittima) → NON flaggato', () => {
    const { events, flaggedCount } = applyTemporalSanityFlags(
      [makeEvent({ eventDate: '2026-03-03', title: 'Artroscopia caviglia', description: 'Intervento in anamnesi.' })],
      OPTS,
    );
    expect(flaggedCount).toBe(0);
    expect(events[0].requiresVerification).toBe(false);
    expect(events[0].confidence).toBe(90);
  });

  it('senza incidentIso il check guarigione-pre-sinistro non scatta (mai falsi allarmi)', () => {
    const { flaggedCount } = applyTemporalSanityFlags(
      [makeEvent({ eventDate: '2026-01-08', description: 'La frattura è clinicamente guarita.' })],
      { todayIso: '2026-07-20' },
    );
    expect(flaggedCount).toBe(0);
  });

  it('testo "programmato" senza marcatori di esecuzione → nota appuntamento, SENZA cap', () => {
    const { events } = applyTemporalSanityFlags(
      [makeEvent({ eventDate: '2026-05-20', title: 'Controllo clinico-radiologico', description: 'Programmato controllo a 7-10 giorni per rinnovo medicazione.' })],
      OPTS,
    );
    expect(events[0].requiresVerification).toBe(true);
    expect(events[0].reliabilityNotes).toContain('PROGRAMMATO');
    expect(events[0].confidence).toBe(90); // la data può essere giusta: niente cap
  });

  it('visita "programmata" MA eseguita (marcatori di esecuzione) → NON flaggata', () => {
    const { flaggedCount } = applyTemporalSanityFlags(
      [makeEvent({ description: 'Controllo programmato eseguito in data odierna, gesso rimosso, rx visionati.' })],
      OPTS,
    );
    expect(flaggedCount).toBe(0);
  });

  it('data sentinella/malformata → mai flag temporali', () => {
    const { flaggedCount } = applyTemporalSanityFlags(
      [makeEvent({ eventDate: '1900-01-01' }), makeEvent({ eventDate: 'boh' })],
      OPTS,
    );
    expect(flaggedCount).toBe(0);
  });

  it('idempotente: doppia applicazione non duplica la nota', () => {
    const once = applyTemporalSanityFlags([makeEvent({ eventDate: '2026-10-07' })], OPTS).events;
    const twice = applyTemporalSanityFlags(once, OPTS).events;
    const occurrences = (twice[0].reliabilityNotes ?? '').split('Data futura').length - 1;
    expect(occurrences).toBe(1);
  });
});

describe('event-sanity — temporalScope derivato (collaudo 2026-09-04: referto esploso in 12 eventi)', () => {
  it('data FUTURA rispetto all\'elaborazione → temporalScope forzato a "programmato" anche se il LLM dice corrente', () => {
    const { events } = applyTemporalSanityFlags(
      [makeEvent({ eventDate: '2026-10-07', title: 'Controllo clinico', temporalScope: 'corrente' })],
      OPTS,
    );
    expect(events[0].temporalScope).toBe('programmato');
  });

  it('testo "programmato" senza marcatori di esecuzione → SOLO nota, lo scope del LLM resta (un "ricovero programmato" elettivo è avvenuto)', () => {
    const { events } = applyTemporalSanityFlags(
      [makeEvent({ eventDate: '2024-05-10', title: 'Ricovero programmato per artroprotesi anca sinistra', description: 'Ingresso in reparto in regime di ricovero programmato per intervento.', temporalScope: 'corrente' })],
      OPTS,
    );
    expect(events[0].temporalScope).toBe('corrente');
    expect(events[0].reliabilityNotes).toContain('PROGRAMMATO');
  });

  it('un "retrospettivo" con data futura (anno anamnestico mal letto) resta retrospettivo: cap + nota, niente "programmato"', () => {
    const { events } = applyTemporalSanityFlags(
      [makeEvent({ eventDate: '2029-01-01', title: 'Pregressa meniscectomia', description: 'Riferita in anamnesi.', temporalScope: 'retrospettivo' })],
      OPTS,
    );
    expect(events[0].temporalScope).toBe('retrospettivo');
    expect(events[0].confidence).toBeLessThanOrEqual(FUTURE_DATE_CONFIDENCE_CAP);
  });

  it('visita "programmata" MA eseguita → resta "corrente" (mai declassare un atto avvenuto)', () => {
    const { events } = applyTemporalSanityFlags(
      [makeEvent({ eventDate: '2026-06-10', title: 'Visita programmata eseguita', description: 'Visita di controllo programmata, eseguita regolarmente.', temporalScope: 'corrente' })],
      OPTS,
    );
    expect(events[0].temporalScope).toBe('corrente');
  });

  it('un "retrospettivo" dichiarato dal LLM resta tale (la sanity non lo tocca)', () => {
    const { events } = applyTemporalSanityFlags(
      [makeEvent({ eventDate: '2019-03-01', title: 'Pregressa meniscectomia', description: 'Riferita in anamnesi.', temporalScope: 'retrospettivo' })],
      OPTS,
    );
    expect(events[0].temporalScope).toBe('retrospettivo');
  });

  it('evento senza campo (righe/percorsi legacy) → non inventa lo scope se non ci sono segnali', () => {
    const { events } = applyTemporalSanityFlags([makeEvent({ eventDate: '2026-06-10' })], OPTS);
    expect(events[0].temporalScope).toBeUndefined();
  });
});

describe('event-sanity — pagine manoscritte', () => {
  it('buildHandwrittenPageSet: yes/partial dentro, null fuori', () => {
    const set = buildHandwrittenPageSet([
      { page_number: 1, has_handwriting: 'yes' },
      { page_number: 2, has_handwriting: 'partial' },
      { page_number: 3, has_handwriting: null },
    ]);
    expect([...set].sort()).toEqual([1, 2]);
  });

  it('evento da pagina manoscritta → cap 55 + nota "verificare sull\'originale"', () => {
    const { events, flaggedCount } = capEventsFromHandwrittenPages(
      [makeEvent({ sourcePages: [3, 4], confidence: 92 })],
      new Set([4]),
    );
    expect(flaggedCount).toBe(1);
    expect(events[0].confidence).toBeLessThanOrEqual(HANDWRITTEN_PAGE_CONFIDENCE_CAP);
    expect(events[0].requiresVerification).toBe(true);
    expect(events[0].reliabilityNotes).toContain('manoscritta');
  });

  it('evento da pagine stampate → intatto', () => {
    const { events, flaggedCount } = capEventsFromHandwrittenPages(
      [makeEvent({ sourcePages: [1] })],
      new Set([4]),
    );
    expect(flaggedCount).toBe(0);
    expect(events[0].confidence).toBe(90);
  });

  it('confidenza già più bassa del cap → non viene alzata', () => {
    const { events } = capEventsFromHandwrittenPages(
      [makeEvent({ sourcePages: [4], confidence: 30 })],
      new Set([4]),
    );
    expect(events[0].confidence).toBe(30);
  });
});
