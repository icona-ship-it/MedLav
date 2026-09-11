import { describe, it, expect } from 'vitest';
import { findUnattestedDates, unwrapGuillemets, sanitizeAnamnesiPast, collectCurrentDays, collectCurrentLesions, sanitizeAnamnesiDominance, stripUndocumentedAnamnesiLines, compactSourceClauses, stripNarrativeDob, flagEvaluativeSentences } from './narrative-nets';
import { collectAttestedDays } from './header-schema';

describe('findUnattestedDates — date nel testo senza riscontro', () => {
  const attested = collectAttestedDays([{ eventDate: '2025-01-23' }, { eventDate: '2024-11-13' }], { dataSinistro: null });
  it('segnala la data inventata, non quelle attestate, non i placeholder', () => {
    const text = 'RX del 07.01.2025 e visita del 23/01/2025; sinistro del 13.11.2024; [DATA] da compilare; controllo 7.1.2025 di nuovo.';
    expect(findUnattestedDates(text, attested)).toEqual(['07.01.2025']);
  });
  it('vuoto senza date attestate o senza testo', () => {
    expect(findUnattestedDates('RX del 07.01.2025', new Set())).toEqual([]);
    expect(findUnattestedDates('', attested)).toEqual([]);
  });
});

describe('unwrapGuillemets — epicrisi senza citazioni', () => {
  it('toglie le «...» lasciando il testo', () => {
    expect(unwrapGuillemets('Alla RM «lesione del menisco mediale» e poi «ok».')).toBe('Alla RM lesione del menisco mediale e poi ok.');
    expect(unwrapGuillemets('senza citazioni')).toBe('senza citazioni');
  });
});

describe('sanitizeAnamnesiPast — mai le lesioni dell\'evento indice come pregresse', () => {
  const current = collectCurrentDays([
    { eventDate: '2025-09-13', temporalScope: 'corrente' },
    { eventDate: '2019-01-01', temporalScope: 'retrospettivo' },
  ]);
  it('sostituisce la riga se cita una data corrente; lascia le pregresse vere', () => {
    const bad = 'Paziente destrimane\nIn passato: frattura del radio (13.09.2025), RM del 13/09/2025.\nPeso: Kg 70';
    const r = sanitizeAnamnesiPast(bad, current);
    expect(r.replaced).toBe(true);
    expect(r.text).toContain('In passato: nulla di rilevante documentato.');
    expect(r.text).not.toContain('13.09.2025');
    expect(r.text).toContain('Peso: Kg 70');
    const good = 'In passato: frattura clavicola sinistra (2019).';
    expect(sanitizeAnamnesiPast(good, current)).toEqual({ text: good, replaced: false });
  });
  it('toglie solo le voci con data corrente e tiene le pregresse vere', () => {
    const mixed = 'In passato: ipertensione arteriosa, colecistectomia (2002), frattura del radio (13.09.2025), diabete tipo 2.';
    const r = sanitizeAnamnesiPast(mixed, current);
    expect(r.replaced).toBe(true);
    expect(r.text).toBe('In passato: ipertensione arteriosa, colecistectomia (2002), diabete tipo 2.');
  });
  it('riga con grassetto o elenco', () => {
    const r = sanitizeAnamnesiPast('- **In passato:** intervento del 13.09.2025', current);
    expect(r.text).toBe('- **In passato:** nulla di rilevante documentato.');
  });
});

describe('sanitizeAnamnesiPast — etichette equivalenti e lesioni senza data (verifica 2026-09-06)', () => {
  const current = collectCurrentDays([{ eventDate: '2025-09-13', temporalScope: 'corrente' }]);
  const lesions = collectCurrentLesions([
    { diagnosis: 'Frattura composta dell\'epifisi distale del radio destro', title: 'RX polso', temporalScope: 'corrente' },
    { diagnosis: 'Pregressa frattura clavicola sinistra', temporalScope: 'retrospettivo' },
  ]);
  it('toglie la lesione dell\'evento anche senza data e sotto "Patologie pregresse"', () => {
    const r = sanitizeAnamnesiPast('Patologie pregresse: ipertensione, frattura composta dell\'epifisi distale del radio destro, diabete.', current, lesions);
    expect(r.replaced).toBe(true);
    expect(r.text).toBe('Patologie pregresse: ipertensione, diabete.');
  });
  it('non tocca la pregressa vera (retrospettiva) né date con trattino non correnti', () => {
    const line = 'In passato: pregressa frattura clavicola sinistra (2019), visita del 10-01-2020.';
    expect(sanitizeAnamnesiPast(line, current, lesions)).toEqual({ text: line, replaced: false });
  });
});

// Panel giri 9-11 (casi B e C): «In passato: nulla di rilevante documentato.» seguito
// dall'elenco stesso delle comorbilità, perché la clausola di fonte («come da cartella
// clinica del 16.07.2023») portava la data del sinistro e la voce veniva scartata.
describe('sanitizeAnamnesiPast — clausola di fonte ed elenco puntato', () => {
  const days = collectCurrentDays([{ eventDate: '2023-07-16', temporalScope: 'corrente' }]);
  it('la data nella clausola di fonte non rende «indice» una comorbilità pregressa', () => {
    const text = 'In passato: cardiopatia ischemica, come da cartella clinica del 16.07.2023; ipotiroidismo in trattamento, come da cartella clinica del 16.07.2023.';
    const out = sanitizeAnamnesiPast(text, days, ['frattura del femore']);
    expect(out.replaced).toBe(false);
    expect(out.text).toBe(text);
  });
  it('quando la riga si svuota ma sotto c\'è l\'elenco puntato, resta l\'etichetta senza «nulla di rilevante»', () => {
    const text = 'In passato: frattura del femore del 16.07.2023.\n- Cardiopatia ischemica, riferita in anamnesi, come da cartella clinica del 16.07.2023.\n- Ipotiroidismo.';
    const out = sanitizeAnamnesiPast(text, days, ['frattura del femore']);
    expect(out.replaced).toBe(true);
    expect(out.text.split('\n')[0]).toBe('In passato:');
    expect(out.text).not.toContain('nulla di rilevante');
    expect(out.text).toContain('- Cardiopatia ischemica');
  });
  it('senza elenco sotto, la riga svuotata dice «nulla di rilevante documentato»', () => {
    const out = sanitizeAnamnesiPast('In passato: frattura del femore del 16.07.2023.\n\nPeso: 70 kg', days, ['frattura del femore']);
    expect(out.text).toContain('In passato: nulla di rilevante documentato.');
  });
});

describe('reti aggiuntive Anamnesi/Fatto/Epicrisi (Fase 1 audit 2026-09-10)', () => {
  it('sanitizeAnamnesiDominance: dominanza non attestata → segnaposto; attestata → invariata', () => {
    const text = 'Paziente: la perizianda, destrimane (come da cartella clinica del 13.09.2025).\nIn passato: nulla di rilevante documentato.';
    const out = sanitizeAnamnesiDominance(text, [{ title: 'Accesso in PS', description: 'trauma gomito destro', sourceText: 'gomito dx' }]);
    expect(out.replaced).toBe(true);
    expect(out.text).toContain('[destrimane/mancino: da rilevare in visita]');
    expect(out.text).not.toContain('destrimane (come da');
    expect(out.text).toContain('In passato: nulla di rilevante documentato.');
    const ok = sanitizeAnamnesiDominance(text, [{ title: 'Visita', description: 'Paziente destrimane', sourceText: null }]);
    expect(ok.replaced).toBe(false);
  });

  it('stripUndocumentedAnamnesiLines: via le righe «non documentata» con parentetica; restano i dati', () => {
    const text = 'Peso: [da compilare dal perito]\nTerapia cronica: non documentata.\nTerapia attuale: non documentata (la prescrizione di FANS per 4-5 giorni non è terapia cronica).\nAnamnesi familiare: non documentata.\nAltezza: 165 cm';
    const out = stripUndocumentedAnamnesiLines(text);
    expect(out.removed).toBe(4);
    expect(out.text.trim()).toBe('Altezza: 165 cm');
  });

  it('compactSourceClauses: 15 «come da …» diventano una riga «Fonti: …» con le fonti uniche', () => {
    const text = [
      '- Lansoprazolo 30 mg (1 compressa al giorno), come da lettera del medico di medicina generale del 16.07.2023.',
      '- Furosemide 25 mg (2 compresse al giorno), come da lettera del medico di medicina generale del 16.07.2023 e cartella clinica del 16.07.2023.',
      '- Cardiopatia ischemica, riferita in anamnesi, come da cartella clinica del 16.07.2023.',
    ].join('\n');
    const out = compactSourceClauses(text);
    expect(out.text).not.toContain('come da');
    expect(out.text).toContain('- Lansoprazolo 30 mg (1 compressa al giorno).');
    expect(out.text).toContain('- Furosemide 25 mg (2 compresse al giorno).');
    expect(out.text).toMatch(/Fonti: .*lettera del medico di medicina generale del 16\.07\.2023/);
    expect(out.sources.length).toBeGreaterThanOrEqual(2);
    expect(out.sources.length).toBeLessThanOrEqual(3);
  });

  it('stripNarrativeDob: «nata il 24/02/1931» e «nato a Cittàdemo il 10.03.1990» via dalle narrative', () => {
    expect(stripNarrativeDob('la sig.ra Demprova Maria, nata il 24/02/1931, in data 16/07/2023 veniva investita')).toBe('la sig.ra Demprova Maria, in data 16/07/2023 veniva investita');
    expect(stripNarrativeDob('il sig. Carlo Demprova, nato a Cittàdemo il 10.03.1990, riferisce')).toBe('il sig. Carlo Demprova, riferisce');
  });

  it('flagEvaluativeSentences: la frase di nesso del modello diventa un segnaposto del perito, i fatti restano', () => {
    const text = 'In data 22.08.2023 veniva ricoverata per deiscenza della ferita. Gli esiti includono la deiscenza, verosimilmente correlata al quadro clinico di base. Dimessa il 12.09.2023.';
    const out = flagEvaluativeSentences(text);
    expect(out.flagged).toBe(1);
    expect(out.text).toContain('In data 22.08.2023 veniva ricoverata per deiscenza della ferita.');
    expect(out.text).toContain('*[Da valutare dal perito — giudizio scritto dal modello, non un fatto documentato: «Gli esiti includono la deiscenza, verosimilmente correlata al quadro clinico di base.»]*');
    expect(out.text).toContain('Dimessa il 12.09.2023.');
    expect(flagEvaluativeSentences(out.text).flagged).toBe(0);
  });
});
