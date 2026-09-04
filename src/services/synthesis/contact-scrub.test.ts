import { describe, it, expect } from 'vitest';
import { scrubContactDetails } from './contact-scrub';

describe('scrubContactDetails — recapiti di terzi nella trascrizione (gate gold 2026-09-04)', () => {
  it('sostituisce numeri di telefono fissi e mobili ed email, anche dentro le «...»', () => {
    const text = '«Contattare la figlia al 347 1234567 o allo 045.8123456; email figlia.demo@esempio.it»';
    const out = scrubContactDetails(text);
    expect(out).not.toContain('347 1234567');
    expect(out).not.toContain('045.8123456');
    expect(out).not.toContain('figlia.demo@esempio.it');
    expect(out).toContain('[recapito omesso]');
    expect(out.startsWith('«')).toBe(true);
    expect(out.endsWith('»')).toBe(true);
  });

  it('non tocca dosaggi, date, valori di laboratorio, orari e codici brevi', () => {
    const text = 'Paracetamolo 1000 mg x 3/die; 300 mg; PA 120/80; il 10/02/2026 alle 09:15; Hb 12.3 g/dl; INR 1.05; 0.5 mg; frattura C5-C6; codice PS 000123';
    expect(scrubContactDetails(text)).toBe(text);
  });

  it('è idempotente e gestisce il vuoto', () => {
    expect(scrubContactDetails('')).toBe('');
    const once = scrubContactDetails('tel. +39 340 1234567');
    expect(scrubContactDetails(once)).toBe(once);
  });
});
