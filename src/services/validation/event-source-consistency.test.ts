import { describe, it, expect } from 'vitest';
import { checkEventSourceConsistency } from './event-source-consistency';

describe('checkEventSourceConsistency — RECALL (errori veri → flag)', () => {
  it('lateralità invertita: evento "destra", fonte "sinistra"', () => {
    const r = checkEventSourceConsistency({
      title: 'Frattura caviglia destra',
      description: 'Frattura della caviglia destra post trauma',
      source_text: 'Riscontrata frattura della caviglia sinistra',
    });
    expect(r.flagged).toBe(true);
    expect(r.reason).toMatch(/lateralità/i);
  });

  it('lateralità invertita simmetrica: evento "sinistra", fonte "destra"', () => {
    const r = checkEventSourceConsistency({
      title: 'Lesione ginocchio sinistro',
      description: '',
      source_text: 'lesione meniscale ginocchio destro',
    });
    expect(r.flagged).toBe(true);
  });

  it('lateralità abbreviata: evento "destra", fonte "sx"', () => {
    const r = checkEventSourceConsistency({
      title: 'trauma spalla destra',
      description: '',
      source_text: 'trauma contusivo spalla sx',
    });
    expect(r.flagged).toBe(true);
  });

  it('opposto privativo: evento "composta", fonte "scomposta"', () => {
    const r = checkEventSourceConsistency({
      title: 'Frattura composta del radio',
      description: 'frattura composta del radio distale',
      source_text: 'frattura scomposta del radio distale destro',
    });
    expect(r.flagged).toBe(true);
    expect(r.reason).toMatch(/opposto/i);
  });

  it('opposto per prefisso-antonimo: evento "ipertensione", fonte "ipotensione"', () => {
    const r = checkEventSourceConsistency({
      title: 'Ipertensione arteriosa',
      description: 'riscontro di ipertensione',
      source_text: 'episodio di ipotensione arteriosa',
    });
    expect(r.flagged).toBe(true);
  });

  it('opposto ab/ad: evento "abduttore", fonte "adduttore"', () => {
    const r = checkEventSourceConsistency({
      title: 'Lesione muscolo abduttore',
      description: '',
      source_text: 'interessamento del muscolo adduttore',
    });
    expect(r.flagged).toBe(true);
  });
});

describe('checkEventSourceConsistency — PRECISION (coerente → NIENTE flag)', () => {
  it('lateralità coerente: entrambe "destra"', () => {
    const r = checkEventSourceConsistency({
      title: 'Frattura caviglia destra',
      description: 'frattura caviglia destra',
      source_text: 'frattura della caviglia destra',
    });
    expect(r.flagged).toBe(false);
  });

  it('lateralità coerente con abbreviazione: "destra" vs "dx"', () => {
    const r = checkEventSourceConsistency({
      title: 'trauma caviglia destra',
      description: '',
      source_text: 'trauma tibio-tarsica dx',
    });
    expect(r.flagged).toBe(false);
  });

  it('fonte AMBIGUA (cita entrambi i lati) → niente flag', () => {
    const r = checkEventSourceConsistency({
      title: 'dolore ginocchio destro',
      description: '',
      source_text: 'controllo bilaterale: ginocchio destro dolente, ginocchio sinistro nella norma',
    });
    expect(r.flagged).toBe(false);
  });

  it('fonte SENZA lateralità → non verificabile, niente flag', () => {
    const r = checkEventSourceConsistency({
      title: 'trauma caviglia destra',
      description: '',
      source_text: 'trauma contusivo della caviglia, senza lesioni ossee',
    });
    expect(r.flagged).toBe(false);
  });

  it('parafrasi legittima senza opposti → niente flag', () => {
    const r = checkEventSourceConsistency({
      title: 'Dimissione con diagnosi di trauma distorsivo',
      description: 'Il paziente viene dimesso con diagnosi di trauma distorsivo tibio-tarsico destro',
      source_text: 'DIAGNOSI: TRAUMA DISTORSIVO T-T DX. DIMISSIONE a domicilio.',
    });
    expect(r.flagged).toBe(false);
  });

  it('source_text vuoto → niente flag (mai inventare dubbi)', () => {
    const r = checkEventSourceConsistency({ title: 'Frattura destra', description: '', source_text: '' });
    expect(r.flagged).toBe(false);
  });

  it('CASO "airbag" (OCR fedele-ma-assurdo) NON è compito di Rete A: lateralità coerente → niente flag qui', () => {
    // La citazione mescolata è compito della Rete B (plausibilità clinica).
    // Rete A non deve sovra-flaggare: la lateralità "destra" combacia.
    const r = checkEventSourceConsistency({
      title: 'Accesso PS per trauma contusivo-distorsivo caviglia destra',
      description: 'Accesso in Pronto Soccorso per trauma alla caviglia destra',
      source_text: 'RIFERISCE TRAUMA CONTUSIVO DEGLI AIRBAG. ... CAVIGLIA DESTRA.',
    });
    expect(r.flagged).toBe(false);
  });

  it('NIENTE falso positivo su prefisso privativo generico (decorso/corso, anticorpi/corpi) — trovato dall\'avversariale', () => {
    expect(checkEventSourceConsistency({
      title: 'buon decorso clinico', description: 'decorso post-operatorio regolare',
      source_text: 'nel corso della degenza nessuna complicanza',
    }).flagged).toBe(false);
    expect(checkEventSourceConsistency({
      title: 'presenza di anticorpi', description: '',
      source_text: 'ricerca corpi estranei negativa',
    }).flagged).toBe(false);
  });

  it('parola breve non genera falsi opposti (filtro ≥5 char)', () => {
    // "sede" vs "ede" non deve scattare (privativo 's'), entrambe sotto/vicino soglia.
    const r = checkEventSourceConsistency({
      title: 'intervento presso altra sede',
      description: 'eseguito presso altra sede',
      source_text: 'intervento eseguito in sede ospedaliera',
    });
    expect(r.flagged).toBe(false);
  });
});

describe('checkEventSourceConsistency — INVARIANTE', () => {
  it('un evento identico alla propria fonte non è MAI flaggato', () => {
    const texts = [
      'frattura composta del radio distale destro',
      'trauma distorsivo tibio-tarsico sinistro',
      'ipertensione arteriosa in terapia',
      'lesione del legamento crociato anteriore',
    ];
    for (const t of texts) {
      expect(checkEventSourceConsistency({ title: t, description: t, source_text: t }).flagged).toBe(false);
    }
  });
});
