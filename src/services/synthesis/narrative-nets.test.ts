import { describe, it, expect } from 'vitest';
import { findUnattestedDates, unwrapGuillemets, sanitizeAnamnesiPast, collectCurrentDays, collectCurrentLesions } from './narrative-nets';
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
