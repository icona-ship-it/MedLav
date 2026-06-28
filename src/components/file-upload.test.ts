import { describe, it, expect } from 'vitest';
import { isOsJunkFile, fileSignature, partitionNewFiles } from './file-upload';

type F = { name: string; size: number; lastModified: number };
const f = (name: string, size: number, lastModified: number): F => ({ name, size, lastModified });

describe('file-upload — isOsJunkFile', () => {
  it('scarta la vera spazzatura OS', () => {
    expect(isOsJunkFile('.DS_Store')).toBe(true);
    expect(isOsJunkFile('Thumbs.db')).toBe(true);
    expect(isOsJunkFile('desktop.ini')).toBe(true);
    expect(isOsJunkFile('._Relazione.pdf')).toBe(true); // AppleDouble resource fork
  });
  it('NON scarta un documento valido col nome che inizia per punto', () => {
    expect(isOsJunkFile('.report.pdf')).toBe(false); // prima veniva perso in silenzio
    expect(isOsJunkFile('referto.pdf')).toBe(false);
  });
});

describe('file-upload — partitionNewFiles (dedup selezione)', () => {
  it('considera DOPPIONE solo nome+dimensione+data identici', () => {
    const { unique, duplicates } = partitionNewFiles<F>([], [
      f('scan.pdf', 1000, 111),
      f('scan.pdf', 1000, 111), // identico → doppione
    ]);
    expect(unique).toHaveLength(1);
    expect(duplicates).toHaveLength(1);
  });

  it('FIX: due file DIVERSI con stesso nome+dimensione (data diversa) passano entrambi', () => {
    const { unique, duplicates } = partitionNewFiles<F>([], [
      f('documento.pdf', 2048, 100),
      f('documento.pdf', 2048, 200), // stessa name+size ma data diversa → file diverso
    ]);
    expect(unique).toHaveLength(2); // prima ne sarebbe sparito 1 in silenzio
    expect(duplicates).toHaveLength(0);
  });

  it('deduplica anche rispetto ai file già presenti', () => {
    const existing = [f('a.pdf', 10, 1)];
    const { unique, duplicates } = partitionNewFiles<F>(existing, [
      f('a.pdf', 10, 1), // già presente
      f('b.pdf', 20, 2),
    ]);
    expect(unique.map((x) => x.name)).toEqual(['b.pdf']);
    expect(duplicates.map((x) => x.name)).toEqual(['a.pdf']);
  });

  it('fileSignature distingue per nome, dimensione e data', () => {
    expect(fileSignature(f('x', 1, 1))).toBe(fileSignature(f('x', 1, 1)));
    expect(fileSignature(f('x', 1, 1))).not.toBe(fileSignature(f('x', 1, 2)));
    expect(fileSignature(f('x', 1, 1))).not.toBe(fileSignature(f('y', 1, 1)));
  });
});
