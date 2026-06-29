import { describe, it, expect } from 'vitest';
import { isLabTestEvent, isExcludableLabEvent, isExcludableNoiseEvent, computeRelevanceTier } from './event-relevance';

describe('isLabTestEvent — riconosce la forma REALE della pipeline', () => {
  // La pipeline (extract-events.ts) normalizza "laboratorio"/"ematochimico" a
  // eventType 'esame' + sourceType 'esame_ematochimico'. Il bug originale controllava
  // SOLO eventType → falliva su TUTTI i lab reali. Questo test lo blinda.
  it('lab reale {eventType: "esame", sourceType: "esame_ematochimico"} → true', () => {
    expect(isLabTestEvent({ eventType: 'esame', sourceType: 'esame_ematochimico' })).toBe(true);
  });

  it('forma sintetica {eventType: "esame_ematochimico"} → true (fallback difensivo)', () => {
    expect(isLabTestEvent({ eventType: 'esame_ematochimico' })).toBe(true);
  });

  it('NON-lab: visita / esame strumentale / diagnosi → false', () => {
    expect(isLabTestEvent({ eventType: 'visita', sourceType: 'referto_controllo' })).toBe(false);
    expect(isLabTestEvent({ eventType: 'esame', sourceType: 'esame_strumentale' })).toBe(false);
    expect(isLabTestEvent({ eventType: 'diagnosi', sourceType: 'cartella_clinica' })).toBe(false);
  });
});

describe('isExcludableLabEvent — esclude SOLO i lab di routine, tiene i T1 load-bearing', () => {
  const labRoutine = { eventType: 'esame', sourceType: 'esame_ematochimico', diagnosis: null };
  const labLoadBearing = { eventType: 'esame', sourceType: 'esame_ematochimico', diagnosis: 'sospetta TVP' };

  it('lab di routine (no diagnosi) → T3 → escludibile (true)', () => {
    expect(computeRelevanceTier(labRoutine)).toBe('T3');
    expect(isExcludableLabEvent(labRoutine)).toBe(true);
  });

  it('lab T1 load-bearing (con diagnosi, es. D-dimero→TVP) → NON escludibile (false) — mai perdere un fatto', () => {
    expect(computeRelevanceTier(labLoadBearing)).toBe('T1');
    expect(isExcludableLabEvent(labLoadBearing)).toBe(false);
  });

  it('lab con fonte DISCORDANTE → T1 → NON escludibile', () => {
    const labDiscordante = { eventType: 'esame', sourceType: 'esame_ematochimico', discrepancyNote: 'DISCORDANTE: due referti contrastanti' };
    expect(isExcludableLabEvent(labDiscordante)).toBe(false);
  });

  it('rispetta relevanceTier precomputato se presente', () => {
    // Anche senza diagnosi, se il consolidatore ha già marcato T1, NON va escluso.
    expect(isExcludableLabEvent({ eventType: 'esame', sourceType: 'esame_ematochimico', relevanceTier: 'T1' })).toBe(false);
    expect(isExcludableLabEvent({ eventType: 'esame', sourceType: 'esame_ematochimico', relevanceTier: 'T3' })).toBe(true);
  });

  it('un NON-lab non è mai escludibile (anche se T3)', () => {
    expect(isExcludableLabEvent({ eventType: 'prescrizione', sourceType: 'referto_controllo' })).toBe(false);
  });
});

describe('isExcludableNoiseEvent — distillazione RC: consensi/amministrativi, mai i T1', () => {
  it('esclude un consenso informato (rumore che il gold omette)', () => {
    expect(isExcludableNoiseEvent({ eventType: 'consenso', sourceType: 'cartella_clinica' })).toBe(true);
  });

  it('esclude un documento amministrativo', () => {
    expect(isExcludableNoiseEvent({ eventType: 'documento_amministrativo', sourceType: 'altro' })).toBe(true);
  });

  it('NON esclude un consenso LOAD-BEARING (con diagnosi documentata → T1, mai perdere un fatto)', () => {
    expect(isExcludableNoiseEvent({ eventType: 'consenso', sourceType: 'cartella_clinica', diagnosis: 'frattura esposta' })).toBe(false);
  });

  it('NON esclude un consenso con fonte DISCORDANTE (T1)', () => {
    expect(isExcludableNoiseEvent({ eventType: 'consenso', sourceType: 'cartella_clinica', discrepancyNote: 'DISCORDANTE: ...' })).toBe(false);
  });

  it('NON tocca i tipi clinici (referto, visita, intervento, esame strumentale)', () => {
    expect(isExcludableNoiseEvent({ eventType: 'referto', sourceType: 'referto_controllo' })).toBe(false);
    expect(isExcludableNoiseEvent({ eventType: 'intervento', sourceType: 'cartella_clinica' })).toBe(false);
    expect(isExcludableNoiseEvent({ eventType: 'esame', sourceType: 'esame_strumentale' })).toBe(false);
    expect(isExcludableNoiseEvent({ eventType: 'terapia', sourceType: 'cartella_clinica' })).toBe(false); // terapia → decisione Lavini, non qui
  });
});
