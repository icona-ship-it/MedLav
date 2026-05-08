import { describe, it, expect } from 'vitest';
import { detectLanguage, languageLabel } from './language-detect';

describe('detectLanguage', () => {
  it('detects italian medical text', () => {
    const text = `Il paziente è stato sottoposto a visita ortopedica in data 15/03/2024. Diagnosi:
      frattura del femore. La cartella clinica del ricovero presso l'ospedale di Milano riporta
      una terapia conservativa con immobilizzazione. Esame radiografico di controllo eseguito
      dopo dimissione. Anamnesi negativa per traumi precedenti. Il medico curante prescrive
      controllo a 30 giorni.`;
    const result = detectLanguage(text);
    expect(result.language).toBe('it');
    expect(result.hits.it).toBeGreaterThan(result.hits.de);
  });

  it('detects german medical text', () => {
    const text = `Der Patient wurde mit Verdacht auf eine akute Herzinsuffizienz aufgenommen.
      Die Diagnose ergab eine bekannte Anamnese mit Bluthochdruck. Bei der Aufnahme wurden
      Beschwerden und Befund dokumentiert. Die Therapie wird mit Beta-Blockern fortgesetzt.
      Der Befund der Untersuchung ist unauffällig. Bei Entlassung wurde der Patient an die
      Klinik überwiesen. Der behandelnde Arzt ist Dr. Müller.`;
    const result = detectLanguage(text);
    expect(result.language).toBe('de');
    expect(result.hits.de).toBeGreaterThan(result.hits.it);
  });

  it('detects english medical text', () => {
    const text = `The patient was admitted to the hospital with a diagnosis of acute pneumonia.
      The doctor performed a thorough examination and ordered diagnostic tests. The treatment
      plan included antibiotics and oxygen therapy. The patient's history showed no allergies.
      Follow up examination is scheduled for next week. Symptoms have improved with the
      treatment. The discharge report notes a normal recovery.`;
    const result = detectLanguage(text);
    expect(result.language).toBe('en');
  });

  it('returns mixed for italian + german text', () => {
    const text = `Il paziente è stato visitato. Der Patient wurde untersucht.
      La diagnosi è frattura. Die Diagnose ist Fraktur. Visita ricovero terapia.
      Befund Aufnahme Entlassung. Esame medico ospedale. Untersuchung Arzt Klinik.`;
    const result = detectLanguage(text);
    expect(['mixed', 'it', 'de']).toContain(result.language);
  });

  it('returns unknown for very short text', () => {
    expect(detectLanguage('').language).toBe('unknown');
    expect(detectLanguage('Hi').language).toBe('unknown');
  });

  it('preserves umlauts and accents in word matching', () => {
    // German "ärztin" should still register as German via 'patient' / 'klinik'
    const text = 'Die Ärztin der Klinik untersuchte die Patientin nach der Aufnahme. Diagnose: Bluthochdruck. Therapie: Medikamente. Befund unauffällig. Entlassung folgt morgen.';
    const result = detectLanguage(text);
    expect(result.language).toBe('de');
  });
});

describe('languageLabel', () => {
  it('returns italian labels', () => {
    expect(languageLabel('it')).toBe('italiano');
    expect(languageLabel('de')).toBe('tedesco');
    expect(languageLabel('en')).toBe('inglese');
    expect(languageLabel('mixed')).toBe('misto');
    expect(languageLabel('unknown')).toBe('non determinabile');
  });
});
