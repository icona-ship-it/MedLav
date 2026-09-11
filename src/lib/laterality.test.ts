import { describe, it, expect } from 'vitest';
import { detectSides, haveOppositeSides, mixOppositeSides, uniqueSide } from './laterality';

describe('laterality — riconoscimento dei lati nel testo clinico', () => {
  it('should read abbreviated and full forms, with or without period', () => {
    expect(uniqueSide('RX polso dx')).toBe('dx');
    expect(uniqueSide('RX polso DX in due proiezioni')).toBe('dx');
    expect(uniqueSide('Frattura piatto tibiale destro')).toBe('dx');
    expect(uniqueSide('ginocchio dex.')).toBe('dx');
    expect(uniqueSide('RX polso sx')).toBe('sx');
    expect(uniqueSide('spalla sn.')).toBe('sx');
    expect(uniqueSide('polso sin.')).toBe('sx');
    expect(uniqueSide('Osteosintesi femore sinistro con chiodo')).toBe('sx');
  });

  it('should not read «sin da/dal» (preposizione) or single letters as a side', () => {
    expect(uniqueSide('dolore presente sin dalla nascita')).toBeNull();
    expect(uniqueSide('sin dall\'inizio del ricovero')).toBeNull();
    expect(uniqueSide('ginocchio D')).toBeNull();
    expect(uniqueSide('parametri S')).toBeNull();
    expect(uniqueSide('sindrome del tunnel carpale')).toBeNull();
    expect(uniqueSide('dexametasone 4 mg')).toBeNull();
  });

  it('should treat bilateral or both-sides text as non-unique', () => {
    expect(uniqueSide('gonartrosi bilaterale')).toBeNull();
    expect(uniqueSide('RX ginocchio dx e sx')).toBeNull();
    expect(detectSides('RX ginocchio dx e sx').size).toBe(2);
  });

  it('haveOppositeSides is true only for univocal opposite sides', () => {
    expect(haveOppositeSides('RX polso dx', 'RX polso sx')).toBe(true);
    expect(haveOppositeSides('RX polso destro', 'RX polso SINISTRO')).toBe(true);
    expect(haveOppositeSides('RX polso dx', 'RX polso dx controllo')).toBe(false);
    expect(haveOppositeSides('RX polso', 'RX polso sx')).toBe(false);
    expect(haveOppositeSides('RX bilaterale', 'RX polso sx')).toBe(false);
    expect(haveOppositeSides(null, 'sx')).toBe(false);
  });

  it('mixOppositeSides detects a dx and an sx among several titles', () => {
    expect(mixOppositeSides(['RX polso dx', 'RX polso dx controllo', 'RX polso sx'])).toBe(true);
    expect(mixOppositeSides(['RX torace', 'RX bacino', 'RX polso dx'])).toBe(false);
  });
});
