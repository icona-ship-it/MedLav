import { describe, it, expect } from 'vitest';
import { collectAttestedDays, discardUnattestedEventDate, emptyHeaderData } from './header-schema';
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
