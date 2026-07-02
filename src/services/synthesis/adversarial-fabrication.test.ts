/**
 * Adversarial regression suite.
 *
 * **Goal**: catch the specific failure modes that produced the Regnoto
 * incident (CASO-2026-147) and make sure they cannot recur silently. Each
 * test simulates a high-risk input shape and asserts that either the
 * generated artifact is safe (no fabrication) or the validator blocks it.
 *
 * Tests target three layers:
 * 1. Header schema/template (deterministic) — pure functions, always exercised.
 * 2. Header coherence + fabrication-signature validators — reject Regnoto-style outputs.
 * 3. Citation hard enforcement — rejects bulk-fabricated quotes.
 */

import { describe, it, expect } from 'vitest';
import { HeaderDataSchema, parseHeaderData, type HeaderData } from './header-schema';
import { renderHeaderMarkdown } from './header-template';
import { validateReport, getBlockingIssues } from './report-validator';

// ── Header schema / template — deterministic anti-fabrication ───────

describe('adversarial: header schema + template', () => {
  it('1) Regnoto regression — schema accepts patient name, all other fields null', () => {
    // The exact input shape that triggered the original bug: empty perizia
    // metadata except for patient name extracted from events. The schema +
    // template MUST render the real name with [da compilare] placeholders
    // for everything else — never invent.
    const data: HeaderData = {
      perito: null,
      paziente: {
        nome: 'REGNOTO VALERIA',
        dataNascita: '11/08/1962',
        luogoNascita: 'Verona',
        residenza: null,
        codiceFiscale: null,
        telefono: null,
      },
      oggetto: {
        eventoIndice: 'caduta accidentale',
        dataEvento: '13/12/2025',
        lesione: 'frattura del collo femorale sinistro',
        struttura: 'Ospedale Borgo Trento',
        ambito: 'rc_civile',
      },
      dataVisitaMedicoLegale: null,
      soggettoRichiedente: null,
      giudiziale: null,
    };

    const md = renderHeaderMarkdown(data);

    expect(md).toContain('REGNOTO VALERIA');
    expect(md).toContain('11/08/1962');
    // Benchmark gold 2026-06-10: la riga-scopo della carta intestata
    // stragiudiziale è "Al fine di valutare le lesioni patite in occasione di
    // [EVENTO] occorso in data [DATA] in ambito ..." — lesione e struttura non
    // compaiono nell'intestazione (vivono nelle sezioni cliniche del report).
    expect(md).toContain('in occasione di caduta accidentale');
    expect(md).toContain('occorso in data 13/12/2025');
    // Fabricated values from the original bug must NOT be present
    expect(md).not.toContain('Mario Bianchi');
    expect(md).not.toContain('Niguarda');
    expect(md).not.toContain('Marco Rossi');
    // Missing fields must be marked as TBD, not invented
    expect(md).toContain('[da compilare dal perito]');
  });

  it('2) Empty everything — render must not invent anything', () => {
    const data: HeaderData = {
      perito: null,
      paziente: {
        nome: null,
        dataNascita: null,
        luogoNascita: null,
        residenza: null,
        codiceFiscale: null,
        telefono: null,
      },
      oggetto: {
        eventoIndice: null,
        dataEvento: null,
        lesione: null,
        struttura: null,
        ambito: null,
      },
      dataVisitaMedicoLegale: null,
      soggettoRichiedente: null,
      giudiziale: null,
    };

    const md = renderHeaderMarkdown(data);

    // Multiple [da compilare] markers — every nullable field surfaces it
    const tbdCount = (md.match(/\[da compilare dal perito\]/g) ?? []).length;
    expect(tbdCount).toBeGreaterThanOrEqual(3);
    // Must not contain any plausible-but-fake value
    expect(md).not.toMatch(/\b[A-Z][a-z]+ [A-Z][a-z]+,? nat/i); // no "Nome Cognome, nato"
  });

  it('3) parseHeaderData rejects malformed JSON safely', () => {
    const result = parseHeaderData('this is not json');
    expect(result.error).not.toBeNull();
    expect(result.data).toBeNull();
  });

  it('4) parseHeaderData rejects schema-invalid JSON', () => {
    const result = parseHeaderData(JSON.stringify({ wrong: 'shape' }));
    expect(result.error).not.toBeNull();
    expect(result.data).toBeNull();
  });

  it('5) parseHeaderData accepts valid all-null shape (refusal output)', () => {
    const empty = {
      perito: null,
      paziente: {
        nome: null, dataNascita: null, luogoNascita: null,
        residenza: null, codiceFiscale: null, telefono: null,
      },
      oggetto: {
        eventoIndice: null, dataEvento: null, lesione: null,
        struttura: null, ambito: null,
      },
      dataVisitaMedicoLegale: null,
      soggettoRichiedente: null,
      giudiziale: null,
    };
    const result = parseHeaderData(JSON.stringify(empty));
    expect(result.error).toBeNull();
    expect(result.data).toBeDefined();
  });

  it('6) HeaderDataSchema rejects unexpected ambito values', () => {
    const bad = {
      perito: null,
      paziente: {
        nome: null, dataNascita: null, luogoNascita: null,
        residenza: null, codiceFiscale: null, telefono: null,
      },
      oggetto: {
        eventoIndice: null, dataEvento: null, lesione: null,
        struttura: null, ambito: 'invented_ambito',
      },
      dataVisitaMedicoLegale: null,
      soggettoRichiedente: null,
      giudiziale: null,
    };
    const result = HeaderDataSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });
});

// ── Validator: header fabrication signature & coherence ─────────────

describe('adversarial: report validator — header checks', () => {
  // Build a minimal "fake-but-shaped" report for tests. We bypass length
  // requirements with filler text so we can isolate the header check.
  function makeReport(headerBlock: string, body = ''): string {
    const filler = Array.from({ length: 110 }, (_, i) => `Paragrafo ${i + 1}.`).join(' ');
    const docSan = '\n\n## Dati della Documentazione Sanitaria\n' + filler;
    const epicrisi = '\n\n## Epicrisi\n' + filler;
    return `${headerBlock}${docSan}${epicrisi}\n\n${body}`;
  }

  it('7) Regnoto fabrication signature is detected and blocks save', () => {
    const fabricatedHeader = `## VALUTAZIONE MEDICO-LEGALE STRAGIUDIZIALE

### Dati del professionista incaricato
Dott. Marco Rossi, Medico Chirurgo — Specialista in Medicina Legale
Iscrizione albo: 12345

### Dati del periziando
**Nome e cognome**: Mario Bianchi
**Data di nascita**: 15/03/1978 (Milano)
**Residenza**: Via Roma 10, 20121 Milano
**Codice fiscale**: BNCMRA78C15F205Z
**Telefono**: 333 1234567

### Oggetto dell'incarico
Valutazione relativa a frattura tibia/perone presso Ospedale Niguarda del 5 maggio 2023.`;

    const result = validateReport(makeReport(fabricatedHeader), 0, {
      events: [],
    });

    const fabSig = result.issues.find((i) => i.type === 'header_fabrication_signature');
    expect(fabSig).toBeDefined();
    expect(fabSig?.severity).toBe('error');
    expect(result.valid).toBe(false);
  });

  it('8) Header mismatch with metadata is flagged as error', () => {
    // Metadata says "Tribunale di Brescia", header says "Tribunale di Roma"
    const wrongTribunaleHeader = `## Intestazione

**Tribunale**: Tribunale di Roma
**N. R.G.**: 12345/2025`;

    const result = validateReport(makeReport(wrongTribunaleHeader), 0, {
      events: [],
      periziaMetadata: {
        tribunale: 'Tribunale di Brescia',
      },
    });

    const mismatch = result.issues.find((i) => i.type === 'header_mismatch');
    expect(mismatch).toBeDefined();
    expect(mismatch?.severity).toBe('error');
    expect(result.valid).toBe(false);
  });

  it('9) Header that matches metadata passes coherence check', () => {
    const okHeader = `## Intestazione

**Tribunale**: Tribunale di Brescia, Sezione Centrale Civile
**N. R.G.**: 12345/2025
**Giudice**: Dott. Mario Verdi`;

    const result = validateReport(makeReport(okHeader), 0, {
      events: [],
      periziaMetadata: {
        tribunale: 'Tribunale di Brescia',
        numeroRG: '12345/2025',
        giudice: 'Dott. Mario Verdi',
      },
    });

    const mismatch = result.issues.find((i) => i.type === 'header_mismatch');
    expect(mismatch).toBeUndefined();
  });

  it('10) Bulk-fabricated citations (>50% unverified) → warning VISIBILE ma NON bloccante (decisione 2026-06-02)', () => {
    // Create a report with 4 long quoted strings, none of which exist in OCR.
    const fabricatedQuotes = `## Dati della Documentazione Sanitaria
Dalla cartella si rileva: "questa frase fittizia non è presente nei documenti originali del caso reale". Il decorso è descritto come "una seconda frase totalmente inventata che non potrebbe essere trovata nell'OCR fornito". La diagnosi: "terza citazione fabbricata che è scollegata dalla documentazione". Si conclude con: "quarta citazione fabbricata altrettanto inesistente nel materiale documentale fornito".`;

    const filler = Array.from({ length: 110 }, (_, i) => `Paragrafo ${i + 1}.`).join(' ');
    const fullReport = `## Intestazione\nTest\n\n${fabricatedQuotes}\n\n## Epicrisi\n${filler}`;

    const result = validateReport(fullReport, 0, {
      events: [],
      ocrText: [{
        documentId: 'd1',
        pages: [{ ocrText: 'Testo OCR completamente diverso, non contiene nessuna delle frasi virgolettate del report.' }],
      }],
    });

    // Le citazioni non verificate sono SEGNALATE (visibili al perito)...
    const citationIssues = result.issues.filter((i) => i.type === 'unverified_citation');
    expect(citationIssues.length).toBeGreaterThan(0);
    // ...ma SOLO come warning: mai 'error', mai bloccanti (fiducia di default, controllo a richiesta).
    expect(citationIssues.every((i) => i.severity === 'warning')).toBe(true);
    expect(getBlockingIssues(result).some((i) => i.type === 'unverified_citation')).toBe(false);
  });
});
