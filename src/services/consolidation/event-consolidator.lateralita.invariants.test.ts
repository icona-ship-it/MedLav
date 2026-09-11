import { describe, it, expect } from 'vitest';
import { consolidateEvents, isDuplicateOfExisting, isSimilarEvent } from './event-consolidator';
import type { ExtractedEvent } from '../extraction/extraction-schemas';

/**
 * INVARIANTI LATERALITÀ — consolidamento (audit 2026-09-10).
 *
 * Due eventi identici TRANNE la lateralità (dx/sx, destro/sinistro) sono due
 * atti clinici distinti (trauma bilaterale: RX polso dx E RX polso sx lo stesso
 * giorno). Il consolidamento non deve MAI fonderli né dichiararli "fonti
 * concordi": perdere un lato è l'errore silenzioso più grave in una perizia.
 * Percorso reale: process-case → consolidate-events → consolidateEvents().
 * Fixture interamente fittizie.
 */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const pick = <T,>(r: () => number, a: readonly T[]): T => a[Math.floor(r() * a.length)]!;

function ev(o: Partial<ExtractedEvent>): ExtractedEvent {
  return {
    eventDate: '2026-02-10', datePrecision: 'giorno', eventType: 'esame_strumentale', title: 'x', description: 'Esame eseguito in urgenza.',
    sourceType: 'cartella_clinica', diagnosis: null, doctor: null, facility: null, confidence: 90, requiresVerification: false,
    reliabilityNotes: null, sourceText: 'testo fonte fittizio', sourcePages: [1], temporalScope: 'corrente', ...o,
  };
}

const SIDE_RE = /\b(dx|sx|sn|ds|destr[oaie]|sinistr[oaie])\b/gi;
const sideOf = (w: string): 'dx' | 'sx' => /^(dx|ds|destr)/i.test(w) ? 'dx' : 'sx';
const sidesIn = (s: string): string => (s.match(SIDE_RE) ?? []).map(sideOf).join(',');

describe('invarianti lateralità — dedup intra-documento', () => {
  // Classe coperta (audit 2026-09-10): dedup intra-documento fonde "RX polso dx" e "RX polso sx" (token ≤3 char scartati dal tokenizer)
  it('due esami dello stesso giorno identici tranne dx/sx nello stesso documento restano DUE eventi', () => {
    const out = consolidateEvents([{ documentId: 'ps', events: [ev({ title: 'RX polso dx' }), ev({ title: 'RX polso sx' })] }]);
    expect(out.map((e) => e.title).sort()).toEqual(['RX polso dx', 'RX polso sx']);
  });

  // Classe coperta (audit 2026-09-10): titoli lunghi con destro/sinistro superano la soglia 0.7 di similarità e si fondono
  it('titoli lunghi che differiscono solo per destro/sinistro non si fondono', () => {
    const out = consolidateEvents([{ documentId: 'ps', events: [
      ev({ title: 'RX ginocchio destro in due proiezioni sotto carico' }),
      ev({ title: 'RX ginocchio sinistro in due proiezioni sotto carico' }),
    ] }]);
    expect(out).toHaveLength(2);
    expect(sidesIn(out.map((e) => e.title).join(' ')).split(',').sort()).toEqual(['dx', 'sx']);
  });

  // isSimilarEvent resta cieco al lato DI PROPOSITO (serve alla rilevazione delle
  // discordanze cross-documento); la guardia sta nei punti di FUSIONE.
  it('isDuplicateOfExisting: un nuovo evento con lato opposto a uno esistente NON è un duplicato', () => {
    const existing = consolidateEvents([{ documentId: 'ps', events: [ev({ title: 'RX polso dx' })] }]);
    expect(isDuplicateOfExisting(ev({ title: 'RX polso sx' }), existing)).toBe(false);
    expect(isDuplicateOfExisting(ev({ title: 'RX polso dx' }), existing)).toBe(true);
    expect(isSimilarEvent(ev({ title: 'RX polso dx' }), ev({ title: 'RX polso sx' }))).toBe(true);
  });

  // Classe coperta (audit 2026-09-10): fuzz — coppie identiche tranne il lato vengono fuse (perdita di un lato)
  it('fuzz (seme fisso, 600 coppie): quando due eventi differiscono SOLO per il lato, sopravvivono entrambi', () => {
    const r = mulberry32(20260910);
    const TEMPLATES = ['RX {district} {side}', 'RX {district} {side} in due proiezioni', 'ECO {district} {side} con doppler', 'Osteosintesi {district} {side} con placca e viti', 'TC {district} {side} senza mezzo di contrasto', 'Visita ortopedica di controllo {district} {side}'];
    const DISTRICTS = ['polso', 'ginocchio', 'spalla', 'caviglia', 'gomito', 'anca'];
    const SIDES = [['dx', 'sx'], ['destro', 'sinistro'], ['destra', 'sinistra'], ['DX', 'SX'], ['ds', 'sn']] as const;
    const TYPES = ['esame_strumentale', 'esame', 'intervento', 'visita'];
    let lost = 0; const examples: string[] = [];
    for (let i = 0; i < 600; i++) {
      const t = pick(r, TEMPLATES); const d = pick(r, DISTRICTS); const [a, b] = pick(r, SIDES); const type = pick(r, TYPES);
      const mk = (side: string) => t.replace('{district}', d).replace('{side}', side);
      const out = consolidateEvents([{ documentId: 'doc', events: [
        ev({ eventType: type, title: mk(a), confidence: 80 + Math.floor(r() * 20) }),
        ev({ eventType: type, title: mk(b), confidence: 80 + Math.floor(r() * 20) }),
      ] }]);
      if (out.length !== 2) { lost++; if (examples.length < 3) examples.push(`${mk(a)} | ${mk(b)} → ${out.map((e) => e.title).join(' / ')}`); }
    }
    expect(lost, `lati persi in ${lost}/600 coppie, es.: ${examples.join(' ;; ')}`).toBe(0);
  });
});

describe('invarianti lateralità — discrepanze cross-documento', () => {
  // Classe coperta (audit 2026-09-10): lati opposti in due documenti annotati come "fonti concordi"
  it('"RX polso dx" in un documento e "RX polso sx" in un altro non sono mai "fonti concordi"', () => {
    const out = consolidateEvents([
      { documentId: 'ps', events: [ev({ title: 'RX polso dx' })] },
      { documentId: 'radiologia', events: [ev({ title: 'RX polso sx' })] },
    ]);
    expect(out).toHaveLength(2);
    for (const e of out) expect(e.discrepancyNote ?? '').not.toContain('fonti concordi');
    expect(out.some((e) => (e.discrepancyNote ?? '').includes('LATERALITÀ DISCORDANTE'))).toBe(true);
    expect(out.every((e) => e.requiresVerification)).toBe(true);
  });

  it('aggregazione di 3+ esami dello stesso giorno: i lati originali restano leggibili nell\'aggregato', () => {
    const out = consolidateEvents([{ documentId: 'ps', events: [
      ev({ title: 'RX polso dx', sourceType: 'esame_strumentale' }),
      ev({ title: 'RX polso sx', sourceType: 'esame_strumentale' }),
      ev({ title: 'RX polso dx controllo', sourceType: 'esame_strumentale' }),
    ] }]);
    const text = out.map((e) => `${e.title} ${e.description}`).join(' ');
    expect(sidesIn(text)).toContain('dx');
    expect(sidesIn(text)).toContain('sx');
  });
});
