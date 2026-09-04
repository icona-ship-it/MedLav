import { describe, it, expect } from 'vitest';
import { isAnalysisOlderThanBuild, formatBuildLabel, PIPELINE_CHANGED_AT } from './build-info';

/**
 * Versione visibile (ciclo di consegna 2026-09-04): il medico non poteva
 * distinguere "non è cambiato nulla" da "devo rielaborare" — i casi già
 * elaborati mostrano i dati della build con cui sono stati prodotti.
 */
describe('build-info', () => {
  it('analisi avviata PRIMA della build corrente → da rielaborare', () => {
    expect(isAnalysisOlderThanBuild('2026-08-14T10:00:00.000Z', '2026-09-04T09:00:00.000Z')).toBe(true);
  });

  it('analisi avviata DOPO la build corrente → aggiornata', () => {
    expect(isAnalysisOlderThanBuild('2026-09-04T10:00:00.000Z', '2026-09-04T09:00:00.000Z')).toBe(false);
  });

  it('dati mancanti o malformati → mai un falso avviso', () => {
    expect(isAnalysisOlderThanBuild(undefined, '2026-09-04T09:00:00.000Z')).toBe(false);
    expect(isAnalysisOlderThanBuild('2026-08-14T10:00:00.000Z', null)).toBe(false);
    expect(isAnalysisOlderThanBuild('non-una-data', '2026-09-04T09:00:00.000Z')).toBe(false);
    expect(isAnalysisOlderThanBuild('2026-08-14T10:00:00.000Z', '')).toBe(false);
  });

  it('default: confronta con la data dell\'ultimo cambio pipeline (non con la build), così un deploy di sola UI non chiede di rielaborare', () => {
    expect(Number.isFinite(Date.parse(PIPELINE_CHANGED_AT))).toBe(true);
    expect(isAnalysisOlderThanBuild('2026-08-14T10:00:00.000Z')).toBe(true);
    expect(isAnalysisOlderThanBuild('2099-01-01T00:00:00.000Z')).toBe(false);
  });

  it('etichetta di build: sha corto + data italiana; senza sha → "sviluppo"', () => {
    expect(formatBuildLabel('ed239c0abcdef1234567', '2026-09-04T09:00:00.000Z')).toBe('ed239c0 · 04.09.2026');
    expect(formatBuildLabel(undefined, undefined)).toBe('sviluppo');
  });
});
