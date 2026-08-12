import { describe, it, expect } from 'vitest';
import { anonymizeText, detectPii } from './anonymizer';

describe('anonymizer', () => {
  describe('anonymizeText', () => {
    it('should replace Italian codice fiscale', () => {
      const result = anonymizeText({
        text: 'Il paziente RSSMRA80A01H501Z si è presentato in data 01.01.2024',
      });
      expect(result.anonymizedText).not.toContain('RSSMRA80A01H501Z');
      expect(result.anonymizedText).toMatch(/\[CF_\d+\]/);
      expect(result.replacementCount).toBeGreaterThan(0);
    });

    it('should replace Italian phone numbers', () => {
      const result = anonymizeText({
        text: 'Contattare il paziente al +39 333 123 4567 o allo 02 1234567',
      });
      expect(result.anonymizedText).not.toContain('333 123 4567');
      expect(result.anonymizedText).toMatch(/\[TELEFONO_\d+\]/);
    });

    it('should replace email addresses', () => {
      const result = anonymizeText({
        text: 'Email: mario.rossi@email.com per comunicazioni',
      });
      expect(result.anonymizedText).not.toContain('mario.rossi@email.com');
      expect(result.anonymizedText).toMatch(/\[EMAIL_\d+\]/);
    });

    it('should replace professional title + name patterns', () => {
      const result = anonymizeText({
        text: 'Il Dott. Mario Rossi ha visitato la paziente. La Prof.ssa Anna Bianchi ha refertato.',
      });
      expect(result.anonymizedText).not.toContain('Mario Rossi');
      expect(result.anonymizedText).not.toContain('Anna Bianchi');
    });

    it('should replace names from perizia metadata', () => {
      const result = anonymizeText({
        text: 'Il sig. Giovanni Verdi (parte ricorrente) vs ASST Spedali Civili di Brescia (parte resistente)',
        periziaMetadata: {
          parteRicorrente: 'Giovanni Verdi',
          parteResistente: 'ASST Spedali Civili di Brescia',
        },
      });
      expect(result.anonymizedText).not.toContain('Giovanni Verdi');
      expect(result.anonymizedText).not.toContain('ASST Spedali Civili di Brescia');
      // New anonymizer uses [PERSONA_N] or metadata-specific placeholders
      expect(result.replacementCount).toBeGreaterThan(0);
    });

    it('should return replacement count and list', () => {
      const result = anonymizeText({
        text: 'CF: RSSMRA80A01H501Z, email: test@test.com',
      });
      expect(result.replacementCount).toBeGreaterThanOrEqual(2);
      expect(result.replacements.length).toBeGreaterThanOrEqual(2);
      expect(result.replacements[0].type).toBeDefined();
    });

    it('should not modify text without PII', () => {
      const text = 'Il paziente presenta frattura del femore prossimale destro.';
      const result = anonymizeText({ text });
      expect(result.anonymizedText).toBe(text);
      expect(result.replacementCount).toBe(0);
    });

    it('should handle empty text', () => {
      const result = anonymizeText({ text: '' });
      expect(result.anonymizedText).toBe('');
      expect(result.replacementCount).toBe(0);
    });

    it('should replace CTU name from metadata', () => {
      const result = anonymizeText({
        text: 'Il CTU Dott. Nicola Pigaiani ha effettuato le operazioni peritali',
        periziaMetadata: {
          ctuName: 'Dott. Nicola Pigaiani',
        },
      });
      expect(result.anonymizedText).not.toContain('Nicola Pigaiani');
      // New anonymizer may use [CTU] or [PERSONA_N] depending on detection order
      expect(result.replacementCount).toBeGreaterThan(0);
    });
  });

  describe('detectPii — enhanced patterns', () => {
    it('should detect hospital/facility names', () => {
      const result = detectPii({
        text: 'Il paziente è stato ricoverato presso Ospedale San Raffaele per intervento chirurgico.',
      });
      const hospitalMatches = result.matches.filter((m) => m.category === 'struttura');
      expect(hospitalMatches.length).toBeGreaterThan(0);
      expect(hospitalMatches[0].original).toContain('Ospedale San Raffaele');
    });

    it('should detect ASST facility names', () => {
      const result = detectPii({
        text: 'Trasferito presso ASST Spedali Civili di Brescia per ulteriori accertamenti.',
      });
      const facilityMatches = result.matches.filter((m) => m.category === 'struttura');
      expect(facilityMatches.length).toBeGreaterThan(0);
      expect(facilityMatches[0].original).toContain('ASST Spedali Civili');
    });

    it('should detect RG court reference numbers', () => {
      const result = detectPii({
        text: 'Nel procedimento R.G. n. 12345/2024 il giudice ha disposto CTU.',
      });
      const rgMatches = result.matches.filter((m) => m.category === 'riferimento_giudiziario');
      expect(rgMatches.length).toBe(1);
      expect(rgMatches[0].original).toContain('R.G.');
      expect(rgMatches[0].original).toContain('12345/2024');
    });

    it('should detect RG numbers in short form', () => {
      const result = detectPii({
        text: 'RG 54321/24 — causa civile.',
      });
      const rgMatches = result.matches.filter((m) => m.category === 'riferimento_giudiziario');
      expect(rgMatches.length).toBe(1);
      expect(rgMatches[0].original).toContain('54321/24');
    });

    it('should detect names preceded by context words', () => {
      const result = detectPii({
        text: 'La paziente Maria Bianchi è stata sottoposta a visita medico-legale.',
      });
      const nameMatches = result.matches.filter((m) => m.category === 'nome');
      expect(nameMatches.length).toBeGreaterThan(0);
      expect(nameMatches.some((m) => m.original.includes('Maria Bianchi'))).toBe(true);
    });

    it('should detect names after sig./signora', () => {
      const result = detectPii({
        text: 'Il sig. Marco Neri ha presentato ricorso. La signora Laura Verdi era presente.',
      });
      const nameMatches = result.matches.filter((m) => m.category === 'nome');
      expect(nameMatches.length).toBeGreaterThanOrEqual(2);
    });

    it('should detect patronymic names', () => {
      const result = detectPii({
        text: 'Il periziando, figlio di Giuseppe Verdi, è nato il 01/01/1980.',
      });
      const nameMatches = result.matches.filter((m) => m.category === 'nome');
      expect(nameMatches.some((m) => m.original.includes('Giuseppe Verdi'))).toBe(true);
    });

    it('should detect patronymic with nato da', () => {
      const result = detectPii({
        text: 'Il periziando, nato da Anna Rossi, è stato visitato.',
      });
      const nameMatches = result.matches.filter((m) => m.category === 'nome');
      expect(nameMatches.some((m) => m.original.includes('Anna Rossi'))).toBe(true);
    });

    it('should anonymize hospital names in full text', () => {
      const result = anonymizeText({
        text: 'Ricoverato presso Clinica Santa Maria per accertamenti diagnostici.',
      });
      expect(result.anonymizedText).not.toContain('Clinica Santa Maria');
      expect(result.anonymizedText).toMatch(/\[STRUTTURA_\d+\]/);
    });

    it('should anonymize RG numbers in full text', () => {
      const result = anonymizeText({
        text: 'Procedimento R.G. n. 99999/2023 presso il Tribunale.',
      });
      expect(result.anonymizedText).not.toContain('99999/2023');
      expect(result.anonymizedText).toMatch(/\[RIF_GIUD_\d+\]/);
    });
  });

  describe('GDPR gaps (fix HIGH anonimizzazione)', () => {
    it('redige le date ISO yyyy-mm-dd, non solo dd/mm/yyyy', () => {
      const result = anonymizeText({ text: 'Visita del 2024-03-15 e controllo del 15/03/2024.' });
      expect(result.anonymizedText).not.toContain('2024-03-15');
      expect(result.anonymizedText).not.toContain('15/03/2024');
    });

    it('redige un nome metadata in forma narrativa E il cognome isolato successivo', () => {
      const result = anonymizeText({
        text: 'Il periziando Mario Rossi e stato visitato. Successivamente Rossi ha riferito dolore.',
        periziaMetadata: { patientFullName: 'Mario Rossi' } as unknown as import('@/types').PeriziaMetadata,
      });
      expect(result.anonymizedText).not.toContain('Mario Rossi');
      expect(result.anonymizedText).not.toContain('Rossi');
    });

    it('NON corrompe le immagini base64 embedded (nessun regex numerico dentro il data-URI)', () => {
      const b64 = 'data:image/png;base64,iVBORw0KGgo3471234567AAAA1234567890shapeddigits==';
      const result = anonymizeText({ text: `Referto diagnostico. ![Fig](${b64}) Fine referto.` });
      expect(result.anonymizedText).toContain(b64);
    });

    it('NON over-redige una parola comune in minuscolo che coincide col cognome (Costa=costola)', () => {
      const result = anonymizeText({
        text: 'Paziente Costa, visitato. Frattura della costa VII a sinistra.',
        periziaMetadata: { patientFullName: 'Mario Costa' } as unknown as import('@/types').PeriziaMetadata,
      });
      expect(result.anonymizedText).toContain('della costa VII'); // la PAROLA clinica preservata
      expect(result.anonymizedText).not.toMatch(/\bCosta\b/); // il NOME (Capitalizzato) redatto
    });

    it('redige un indirizzo con "via" minuscolo e connettore (audit 2026-08-11, E-1)', () => {
      const result = anonymizeText({ text: 'Residente in via degli Esempi 12, Cittàdemo.' });
      expect(result.anonymizedText).not.toContain('via degli Esempi 12');
      expect(result.anonymizedText).not.toContain('degli Esempi');
    });

    it('NON scambia per indirizzo una frase con un tipo-via seguito da minuscola ("strada facendo")', () => {
      const result = anonymizeText({ text: 'Percorrendo la strada facendo attenzione al traffico.' });
      expect(result.anonymizedText).toContain('strada facendo');
    });
  });

  describe('nomi solo-OCR (fix beta 2026-07-20)', () => {
    it('should redact an ALL-CAPS patient name after an anagraphic header with colon', () => {
      const result = anonymizeText({ text: 'Paziente: DEMPROVA Testina. Ricovero ordinario, decorso regolare.' });

      expect(result.anonymizedText).not.toContain('DEMPROVA');
      expect(result.anonymizedText).not.toContain('Testina');
    });

    it('should redact a CAPS surname plus name preceding nato-il', () => {
      const result = anonymizeText({ text: 'DEMPROVA Testina Nato/a il 15/05/1985, giungeva in Pronto Soccorso.' });

      expect(result.anonymizedText).not.toContain('DEMPROVA');
      expect(result.anonymizedText).not.toContain('Testina');
    });

    it('should redact every other occurrence of a detected name even without trigger words', () => {
      const text = 'Paziente: DEMPROVA Testina. Alla dimissione Demprova Testina deambulava; risultando invece DEMPROVA Testina.';

      const result = anonymizeText({ text });

      expect(result.anonymizedText).not.toMatch(/demprova/i);
    });

    it('should redact the reversed order occurrence of a two-token detected name', () => {
      const text = 'Paziente: DEMPROVA Testina. In calce: Testina Demprova.';

      const result = anonymizeText({ text });

      expect(result.anonymizedText).not.toMatch(/demprova/i);
      expect(result.anonymizedText).not.toMatch(/testina/i);
    });

    it('should keep clinical ALL-CAPS phrasing without colon intact', () => {
      const text = 'Il paziente VIGILE COLLABORANTE riferisce dolore al ginocchio destro.';

      const result = anonymizeText({ text });

      expect(result.anonymizedText).toContain('VIGILE COLLABORANTE');
    });

    it('should use the same placeholder for case variants of the same detected name', () => {
      const text = 'Paziente: DEMPROVA Testina. Successivamente Demprova Testina veniva dimessa.';

      const result = anonymizeText({ text });

      const placeholders = new Set(
        result.replacements.filter((r) => r.type === 'nome').map((r) => r.replacement),
      );
      expect(placeholders.size).toBe(1);
    });
  });
});
