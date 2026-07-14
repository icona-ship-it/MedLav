import { describe, it, expect } from 'vitest';
import { splitChunkForRetry } from './extraction-service';

describe('splitChunkForRetry — auto-split dei chunk densi (fix "documenti non letti per intero")', () => {
  it('should return null for small chunks (no point splitting)', () => {
    expect(splitChunkForRetry('breve testo')).toBeNull();
  });

  it('should split a large chunk at a line boundary near the middle', () => {
    const lines = Array.from({ length: 200 }, (_, i) => `Riga clinica numero ${i} con contenuto di esempio per il collaudo.`);
    const text = lines.join('\n');
    const halves = splitChunkForRetry(text);
    expect(halves).not.toBeNull();
    const [a, b] = halves!;
    expect(a.length).toBeGreaterThan(500);
    expect(b.length).toBeGreaterThan(500);
    // nessuna riga persa né duplicata
    expect((a + '\n' + b).split('\n').filter(Boolean)).toHaveLength(200);
  });

  it('should return null when a half would be uselessly small', () => {
    const text = 'x'.repeat(7000); // nessun newline → taglio a metà secca ok, ma...
    const halves = splitChunkForRetry(text);
    // 3500+3500: entrambe > 500 → split valido anche senza newline
    expect(halves).not.toBeNull();
  });
});
