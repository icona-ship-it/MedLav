import { describe, it, expect } from 'vitest';
import { NonRetriableError } from 'inngest';
import { shouldAbortStaleRun, isStaleRunAbort, STALE_RUN_MESSAGE } from './stale-run-guard';

describe('shouldAbortStaleRun — lo zombie si uccide da solo al confine di step', () => {
  it('should abort when il caso è stato annullato (idle) — il caso zombie CASO-2026-235', () => {
    expect(shouldAbortStaleRun('idle', true)).toBe(true);
  });

  it('should abort when il caso è in errore (auto-fail dello stuck-monitor con run ancora vivo)', () => {
    expect(shouldAbortStaleRun('errore', true)).toBe(true);
  });

  it('should abort when il caso risulta già completato (doppio run)', () => {
    expect(shouldAbortStaleRun('completato', true)).toBe(true);
  });

  it('should abort when la riga del caso non esiste più (eliminato, erasure Art.17)', () => {
    expect(shouldAbortStaleRun(null, false)).toBe(true);
    expect(shouldAbortStaleRun(undefined, false)).toBe(true);
  });

  it('should NOT abort durante la lavorazione attiva', () => {
    expect(shouldAbortStaleRun('elaborazione', true)).toBe(false);
    expect(shouldAbortStaleRun('generazione_report', true)).toBe(false);
  });

  it('should NOT abort su stage sconosciuto o mancante con riga presente (fail-open: mai uccidere un run sano)', () => {
    expect(shouldAbortStaleRun(null, true)).toBe(false);
    expect(shouldAbortStaleRun(undefined, true)).toBe(false);
    expect(shouldAbortStaleRun('stage_futuro_ignoto', true)).toBe(false);
  });
});

describe('isStaleRunAbort — i catch di degradazione devono RILANCIARE, non inghiottire', () => {
  it('should riconoscere l\'errore del guard', () => {
    expect(isStaleRunAbort(new NonRetriableError(`${STALE_RUN_MESSAGE} (stage=idle)`))).toBe(true);
  });

  it('should NOT riconoscere errori normali di sezione/estrazione', () => {
    expect(isStaleRunAbort(new Error('timeout fetch failed'))).toBe(false);
    expect(isStaleRunAbort('stringa')).toBe(false);
    expect(isStaleRunAbort(undefined)).toBe(false);
  });
});
