import { describe, it, expect } from 'vitest';
import { collectAttestedDays, discardUnattestedEventDate, emptyHeaderData, HEADER_JSON_SCHEMA, HeaderDataSchema } from './header-schema';
describe('discardUnattestedEventDate — data dell\'evento solo se attestata (gate gold 2026-09-04)', () => {
  const base = (dataEvento: string | null) => ({
    ...emptyHeaderData(),
    oggetto: { ...emptyHeaderData().oggetto, eventoIndice: 'Sinistro stradale', dataEvento },
  });
  const days = collectAttestedDays(
    [{ eventDate: '2024-11-13' }, { eventDate: '2024-11-14' }, { eventDate: '1900-01-01' }],
    { dataSinistro: null },
  );

  it('annulla una data inventata a dieci anni dai fatti; conserva quella attestata (anche ±2 giorni)', () => {
    expect(discardUnattestedEventDate(base('14/11/2014'), days).oggetto.dataEvento).toBeNull();
    expect(discardUnattestedEventDate(base('13/11/2024'), days).oggetto.dataEvento).toBe('13/11/2024');
    expect(discardUnattestedEventDate(base('12.11.2024'), days).oggetto.dataEvento).toBe('12.11.2024');
  });

  it('la data sinistro del perito attesta da sola; senza date note non tocca nulla', () => {
    const withSinistro = collectAttestedDays([], { dataSinistro: '2025-02-10' });
    expect(discardUnattestedEventDate(base('10/02/2025'), withSinistro).oggetto.dataEvento).toBe('10/02/2025');
    expect(discardUnattestedEventDate(base('10/02/2025'), new Set()).oggetto.dataEvento).toBe('10/02/2025');
    expect(discardUnattestedEventDate(base(null), days).oggetto.dataEvento).toBeNull();
  });
});

describe('HEADER_JSON_SCHEMA — rigido e coerente con lo zod', () => {
  it('un oggetto tutto-null conforme allo schema passa la validazione zod; lo schema è strict senza campi extra', () => {
    const def = (HEADER_JSON_SCHEMA as { jsonSchema: { strict: boolean; schemaDefinition: Record<string, unknown> } }).jsonSchema;
    expect(def.strict).toBe(true);
    const root = def.schemaDefinition as { required: string[]; additionalProperties: boolean; properties: Record<string, { required?: string[]; properties?: Record<string, unknown> }> };
    expect(root.additionalProperties).toBe(false);
    expect(root.required.sort()).toEqual(Object.keys(root.properties).sort());
    const nulls = (fields: string[]) => Object.fromEntries(fields.map((f) => [f, null]));
    const sample = {
      perito: null,
      paziente: nulls(root.properties.paziente!.required!),
      oggetto: nulls(root.properties.oggetto!.required!),
      dataVisitaMedicoLegale: null,
      soggettoRichiedente: null,
      giudiziale: null,
    };
    expect(HeaderDataSchema.safeParse(sample).success).toBe(true);
  });
});
