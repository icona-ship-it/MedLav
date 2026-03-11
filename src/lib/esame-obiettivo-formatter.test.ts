import { describe, it, expect } from 'vitest';
import { formatEsameObiettivo, type DistrictData, type GeneralInfo } from './esame-obiettivo-formatter';

const makeDistrict = (overrides: Partial<DistrictData> = {}): DistrictData => ({
  id: 'test',
  label: 'Test District',
  examined: false,
  findings: '',
  ...overrides,
});

describe('formatEsameObiettivo', () => {
  it('should handle no districts examined and no general info', () => {
    const result = formatEsameObiettivo([makeDistrict()]);
    expect(result).toContain('All\'esame obiettivo');
  });

  it('should include general info when provided', () => {
    const generalInfo: GeneralInfo = {
      altezza: '175',
      peso: '80',
      deambulazione: 'Autonoma',
      condizioni: 'Buone',
    };
    const result = formatEsameObiettivo([], generalInfo);
    expect(result).toContain('altezza 175 cm');
    expect(result).toContain('peso 80 kg');
    expect(result).toContain('Deambulazione: Autonoma');
    expect(result).toContain('Condizioni generali: Buone');
  });

  it('should format examined districts with findings', () => {
    const districts = [
      makeDistrict({ id: 'torace', label: 'Torace', examined: true, findings: 'Nella norma' }),
      makeDistrict({ id: 'addome', label: 'Addome', examined: false, findings: '' }),
    ];
    const result = formatEsameObiettivo(districts);
    expect(result).toContain('**Torace**: Nella norma');
    expect(result).not.toContain('**Addome**');
  });

  it('should list non-examined districts when some are examined', () => {
    const districts = [
      makeDistrict({ id: 'torace', label: 'Torace', examined: true, findings: 'OK' }),
      makeDistrict({ id: 'addome', label: 'Addome', examined: false }),
      makeDistrict({ id: 'bacino', label: 'Bacino', examined: false }),
    ];
    const result = formatEsameObiettivo(districts);
    expect(result).toContain('Distretti non esaminati: addome, bacino');
  });

  it('should handle all districts examined', () => {
    const districts = [
      makeDistrict({ id: 'torace', label: 'Torace', examined: true, findings: 'Nella norma' }),
      makeDistrict({ id: 'addome', label: 'Addome', examined: true, findings: 'Trattabile' }),
    ];
    const result = formatEsameObiettivo(districts);
    expect(result).toContain('**Torace**: Nella norma');
    expect(result).toContain('**Addome**: Trattabile');
    expect(result).not.toContain('Distretti non esaminati');
  });

  it('should skip examined districts with empty findings', () => {
    const districts = [
      makeDistrict({ id: 'torace', label: 'Torace', examined: true, findings: '' }),
      makeDistrict({ id: 'addome', label: 'Addome', examined: true, findings: 'Trattabile' }),
    ];
    const result = formatEsameObiettivo(districts);
    expect(result).not.toContain('**Torace**');
    expect(result).toContain('**Addome**: Trattabile');
  });
});
