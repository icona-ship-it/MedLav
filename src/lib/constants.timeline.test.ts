import { describe, it, expect } from 'vitest';
import { isClinicalTimelineEvent } from './constants';

describe('isClinicalTimelineEvent — i certificati MEDICI stanno nella cronistoria clinica (2026-09-21)', () => {
  it('visita/esame/terapia sì; spesa e documento amministrativo no', () => {
    expect(isClinicalTimelineEvent({ event_type: 'visita' })).toBe(true);
    expect(isClinicalTimelineEvent({ event_type: 'terapia' })).toBe(true);
    expect(isClinicalTimelineEvent({ event_type: 'spesa_medica', title: 'Fattura' })).toBe(false);
    expect(isClinicalTimelineEvent({ event_type: 'documento_amministrativo', title: 'Sollecito' })).toBe(false);
  });
  it('certificato con prognosi/guarigione/postumi sì; certificato amministrativo (idoneità, INPS senza clinica) no', () => {
    expect(isClinicalTimelineEvent({ event_type: 'certificato', title: 'Certificato medico', description: 'Prognosi: giorni 40 s.c.' })).toBe(true);
    expect(isClinicalTimelineEvent({ event_type: 'certificato', title: 'Certificato definitivo: guarigione con postumi' })).toBe(true);
    expect(isClinicalTimelineEvent({ event_type: 'certificato', title: 'Attestazione di partecipazione al corso' })).toBe(false);
    expect(isClinicalTimelineEvent({ event_type: 'certificato', title: null, description: null })).toBe(false);
  });
});
