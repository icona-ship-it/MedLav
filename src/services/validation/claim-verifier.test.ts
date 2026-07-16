import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Mock } from 'vitest';

vi.mock('@/lib/mistral/client', () => ({
  streamMistralChat: vi.fn(),
  MISTRAL_MODELS: { MISTRAL_MEDIUM: 'mistral-medium-latest', MISTRAL_LARGE: 'mistral-large-2512' },
  DETERMINISTIC_SEED: 42,
  TIMEOUT_DEFAULT: 60000,
  assertNotTruncated: vi.fn(),
}));

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { verifySectionClaims, parseClaimVerdicts, isClaimGroundedInSection } from './claim-verifier';
import { streamMistralChat } from '@/lib/mistral/client';

const mockStreamChat = streamMistralChat as Mock;
const emptyUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };

const EVENTS = [
  {
    orderNumber: 1,
    eventDate: '2024-03-12',
    title: 'Accesso PS',
    description: 'Trauma distorsivo ginocchio destro dopo caduta accidentale',
    sourceText: 'trauma distorsivo ginocchio dx',
  },
];

const LONG_SECTION = 'Il periziando accedeva al Pronto Soccorso in data 12.03.2024 a seguito di caduta accidentale, '
  + 'riportando trauma distorsivo del ginocchio destro. Seguiva percorso riabilitativo con fisioterapia '
  + 'per sei settimane e controlli ortopedici seriati fino alla stabilizzazione del quadro clinico.';

describe('claim-verifier — verifySectionClaims', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should skip the LLM entirely for short sections', async () => {
    const result = await verifySectionClaims({
      sectionId: 'epicrisi',
      sectionTitle: 'Epicrisi',
      sectionContent: 'Troppo corta.',
      events: EVENTS,
    });
    expect(result.verdicts).toEqual([]);
    expect(mockStreamChat).not.toHaveBeenCalled();
  });

  it('should skip the LLM when there are no events to verify against', async () => {
    const result = await verifySectionClaims({
      sectionId: 'epicrisi',
      sectionTitle: 'Epicrisi',
      sectionContent: LONG_SECTION,
      events: [],
    });
    expect(result.verdicts).toEqual([]);
    expect(mockStreamChat).not.toHaveBeenCalled();
  });

  it('should call the MEDIUM judge (modello diverso dal generatore) and return verdicts', async () => {
    mockStreamChat.mockResolvedValue({
      content: JSON.stringify({
        claims: [
          { claim: 'Accesso PS il 12.03.2024', verdict: 'supportato', motivo: 'Evento 1' },
          { claim: 'Fisioterapia per sei settimane', verdict: 'non_supportato', motivo: 'Nessun evento la attesta' },
        ],
      }),
      usage: emptyUsage,
      finishReason: 'stop',
    });

    const result = await verifySectionClaims({
      sectionId: 'epicrisi',
      sectionTitle: 'Epicrisi',
      sectionContent: LONG_SECTION,
      events: EVENTS,
    });

    expect(mockStreamChat).toHaveBeenCalledTimes(1);
    const callArgs = mockStreamChat.mock.calls[0][0];
    expect(callArgs.model).toBe('mistral-medium-latest');
    expect(callArgs.responseFormat?.type).toBe('json_schema');
    expect(result.verdicts).toHaveLength(2);
    expect(result.verdicts[1].verdict).toBe('non_supportato');
  });

  it('should pass the events digest (fonte di verità) to the judge', async () => {
    mockStreamChat.mockResolvedValue({
      content: JSON.stringify({ claims: [] }),
      usage: emptyUsage,
      finishReason: 'stop',
    });

    await verifySectionClaims({
      sectionId: 'anamnesi',
      sectionTitle: 'Anamnesi',
      sectionContent: LONG_SECTION,
      events: EVENTS,
    });

    const userMessage = mockStreamChat.mock.calls[0][0].messages[1].content as string;
    expect(userMessage).toContain('trauma distorsivo ginocchio dx');
    expect(userMessage).toContain('2024-03-12');
  });
});

describe('claim-verifier — parseClaimVerdicts (difensivo)', () => {
  it('should return [] on invalid JSON without throwing', () => {
    expect(parseClaimVerdicts('non-json {')).toEqual([]);
  });

  it('should drop entries with unknown verdicts or empty claims', () => {
    const content = JSON.stringify({
      claims: [
        { claim: 'ok', verdict: 'supportato', motivo: 'x' },
        { claim: 'strano', verdict: 'forse', motivo: 'x' },
        { claim: '', verdict: 'non_supportato', motivo: 'x' },
        'garbage',
      ],
    });
    const verdicts = parseClaimVerdicts(content);
    expect(verdicts).toHaveLength(1);
    expect(verdicts[0].claim).toBe('ok');
  });

  it('should truncate over-long claim strings', () => {
    const content = JSON.stringify({
      claims: [{ claim: 'x'.repeat(1000), verdict: 'non_supportato', motivo: 'y'.repeat(1000) }],
    });
    const verdicts = parseClaimVerdicts(content);
    expect(verdicts[0].claim.length).toBeLessThanOrEqual(300);
    expect(verdicts[0].motivo.length).toBeLessThanOrEqual(300);
  });
});

describe('claim-verifier — filtro placeholder (rumore visto sul primo run reale)', () => {
  it('should drop findings on report placeholders like [da compilare dal perito]', () => {
    const content = JSON.stringify({
      claims: [
        { claim: 'Peso: Kg [da compilare dal perito]', verdict: 'non_verificabile', motivo: 'placeholder' },
        { claim: 'Terapia attuale: [Inserire in base alla valutazione]', verdict: 'non_verificabile', motivo: 'placeholder' },
        { claim: 'La RM è del 12/09/2025', verdict: 'non_supportato', motivo: 'data documentata 13/09' },
      ],
    });
    const verdicts = parseClaimVerdicts(content);
    expect(verdicts).toHaveLength(1);
    expect(verdicts[0].claim).toContain('RM');
  });
});

describe('claim-verifier — ancoraggio dei claim alla sezione (fabbricazioni del judge, caso 224 v2)', () => {
  const anamnesiTelegrafica = `Paziente: la minore A.B., nata l'11.07.2013, sesso femminile.
In passato: [da compilare dal perito] (nessuna patologia pregressa documentata).
Terapia attuale: FANS per 4-5 giorni «come da consulenza ortopedica del 13.09.2025».`;

  it('SCARTA un claim fabbricato che non ha alcun riscontro nel testo della sezione', () => {
    expect(isClaimGroundedInSection('La paziente è stata ricoverata per 3 giorni in ospedale.', anamnesiTelegrafica)).toBe(false);
    expect(isClaimGroundedInSection('Il codice triage assegnato al PS era giallo.', anamnesiTelegrafica)).toBe(false);
    expect(isClaimGroundedInSection('La paziente ha eseguito una TAC del gomito destro.', anamnesiTelegrafica)).toBe(false);
  });

  it('TIENE un claim realmente estratto dal testo (anche con lievi flessioni)', () => {
    expect(isClaimGroundedInSection('La paziente assume FANS per 4-5 giorni come da consulenza ortopedica.', anamnesiTelegrafica)).toBe(true);
  });

  it('TIENE un claim parafrasato che condivide le parole-contenuto della sezione', () => {
    const fatto = 'La paziente veniva investita da un motociclo mentre attraversava le strisce pedonali in data 12.09.2025 e riportava frattura composta dell\'olecrano destro.';
    expect(isClaimGroundedInSection('La paziente ha riportato una frattura composta dell\'olecrano destro dopo essere stata investita da un motociclo.', fatto)).toBe(true);
  });

  it('claim senza parole-contenuto → tenuto (conservativo, non giudicabile)', () => {
    expect(isClaimGroundedInSection('Sì. No. Ok.', anamnesiTelegrafica)).toBe(true);
  });
});
