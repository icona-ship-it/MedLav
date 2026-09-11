import { describe, it, expect } from 'vitest';
import { findUnattestedDates, sanitizeAnamnesiPast, unwrapGuillemets, collectCurrentDays, collectCurrentLesions } from './narrative-nets';
import { collectAttestedDays } from './header-schema';

/**
 * Invarianti DATE delle reti narrative (audit 2026-09-10): ogni data che compare
 * in Fatto/Anamnesi/Epicrisi deve esistere fra le date del caso, altrimenti
 * finisce nel pannello "Da controllare" — MAI in silenzio. Fuzz a seme fisso,
 * dati interamente fittizi (Cittàdemo / Demprova).
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
const pad = (n: number): string => String(n).padStart(2, '0');

function isoParts(r: () => number): { y: number; m: number; d: number } {
  return { y: 2019 + Math.floor(r() * 8), m: 1 + Math.floor(r() * 12), d: 1 + Math.floor(r() * 28) };
}
const toIso = (p: { y: number; m: number; d: number }): string => `${p.y}-${pad(p.m)}-${pad(p.d)}`;
const toDot = (p: { y: number; m: number; d: number }): string => `${pad(p.d)}.${pad(p.m)}.${p.y}`;

describe('invarianti DATE — findUnattestedDates (fuzz, seme fisso, 1500 casi)', () => {
  it('date attestate in ogni formato numerico mai segnalate; giorno/mese invertiti o anno sbagliato SEMPRE segnalati; output dedup e normalizzato', () => {
    const r = mulberry32(20260910);
    for (let i = 0; i < 1500; i++) {
      const attested = Array.from({ length: 1 + Math.floor(r() * 6) }, () => isoParts(r));
      const attestedIso = new Set(attested.map(toIso));
      const sinistro = r() < 0.5 ? `${pad(attested[0]!.d)}/${pad(attested[0]!.m)}/${attested[0]!.y}` : null;
      const days = collectAttestedDays(attested.map((p) => ({ eventDate: toIso(p) })), { dataSinistro: sinistro });

      const parts: string[] = [];
      const mustFlag = new Set<string>();
      for (const p of attested) {
        const forms = [toDot(p), `${pad(p.d)}/${pad(p.m)}/${p.y}`, `${pad(p.d)}-${pad(p.m)}-${p.y}`, `${p.d}.${p.m}.${p.y}`];
        parts.push(`Referto del ${pick(r, forms)}, «controllo del ${pick(r, forms)}» presso l'Ospedale Civile di Cittàdemo`);
        if (p.d !== p.m && p.d <= 12) {
          const swapped = { y: p.y, m: p.d, d: p.m };
          parts.push(`RX del ${toDot(swapped)}`);
          if (!attestedIso.has(toIso(swapped))) mustFlag.add(toDot(swapped));
        }
        const shifted = { ...p, y: p.y + 1 };
        parts.push(`visita del ${toDot(shifted)}`);
        if (!attestedIso.has(toIso(shifted))) mustFlag.add(toDot(shifted));
      }
      const text = parts.join(pick(r, [' ', '\n', ' | ', ' <br> ', ' [ILLEGGIBILE] ']));
      const out = findUnattestedDates(text, days);

      expect(new Set(out).size).toBe(out.length);
      for (const k of out) {
        expect(k).toMatch(/^\d{2}\.\d{2}\.\d{4}$/);
        const [d, m, y] = k.split('.');
        expect(attestedIso.has(`${y}-${m}-${d}`), `attestata segnalata: ${k}`).toBe(false);
      }
      for (const k of mustFlag) expect(out, `non segnalata: ${k}`).toContain(k);
    }
  });

  it('placeholder [ ... ] ignorati; senza date attestate o senza testo → nessuna segnalazione', () => {
    const days = collectAttestedDays([{ eventDate: '2025-01-23' }], null);
    expect(findUnattestedDates('Visita del 23.01.2025 [da compilare: 07.01.2025]', days)).toEqual([]);
    expect(findUnattestedDates('Visita del 07.01.2025', new Set())).toEqual([]);
    expect(findUnattestedDates('', days)).toEqual([]);
  });

  // Classe coperta (audit 2026-09-10): data impossibile nel testo narrativo saltata in silenzio (dayNumber senza validazione di calendario; 31.02 "attestata" dal 03.03 per rollover)
  it('date di calendario impossibili nel testo (mese 13, 31 febbraio, giorno 00) non passano MAI in silenzio', () => {
    const days = collectAttestedDays([{ eventDate: '2025-03-03' }, { eventDate: '2025-01-15' }], null);
    const out = findUnattestedDates('Controllo del 15.13.2025; RX del 31.02.2025; visita del 00.01.2025.', days);
    expect(out).toContain('15.13.2025');
    expect(out).toContain('31.02.2025');
    expect(out).toContain('00.01.2025');
  });

  // Classe coperta (audit 2026-09-10): data in lettere ("7 gennaio 2025") invisibile alla rete (DATE_RE solo numerico) — i generati benchmark ne contengono fino a 26 in "Il Fatto" e 7 in "Epicrisi"
  it('una data scritta in lettere e non attestata viene segnalata come una numerica', () => {
    const days = collectAttestedDays([{ eventDate: '2025-01-23' }], null);
    expect(findUnattestedDates('In data 7 gennaio 2025 il periziando accedeva al Pronto Soccorso di Cittàdemo.', days)).toEqual(['07.01.2025']);
    expect(findUnattestedDates('In data 23 gennaio 2025 il periziando accedeva al Pronto Soccorso di Cittàdemo.', days)).toEqual([]);
  });
});

describe('invarianti DATE — sanitizeAnamnesiPast (fuzz, seme fisso, 1200 casi)', () => {
  const PREGRESSE = [
    'ipertensione arteriosa in terapia', 'diabete mellito di tipo 2', 'appendicectomia in età giovanile',
    'colecistectomia laparoscopica', 'artroscopia del ginocchio sinistro', 'pregresso trauma distorsivo caviglia destra',
  ];
  const LABELS = ['In passato:', '- **In passato:**', 'Patologie pregresse:', 'Anamnesi patologica remota:', 'A.P.R.:'];
  const LESION = 'Frattura composta del radio distale destro';

  it('tocca solo la riga "In passato"; toglie SOLO le voci con data corrente o lesione indice; le voci conservate sono testuali; clausole di fonte intatte; idempotente', () => {
    const r = mulberry32(7);
    for (let i = 0; i < 1200; i++) {
      const current = Array.from({ length: 1 + Math.floor(r() * 3) }, () => toIso({ y: 2024 + Math.floor(r() * 3), m: 1 + Math.floor(r() * 12), d: 1 + Math.floor(r() * 28) }));
      const currentDays = collectCurrentDays(current.map((eventDate) => ({ eventDate, temporalScope: 'corrente' })));
      const lesions = collectCurrentLesions([{ diagnosis: LESION, temporalScope: 'corrente' }]);
      const fmtIso = (iso: string): string => `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}`;
      const oldDate = `${pad(1 + Math.floor(r() * 28))}.${pad(1 + Math.floor(r() * 12))}.${2015 + Math.floor(r() * 4)}`;

      const items: Array<{ text: string; index: boolean }> = Array.from({ length: 1 + Math.floor(r() * 5) }, () => {
        const kind = r();
        const preg = pick(r, PREGRESSE);
        if (kind < 0.3) return { text: preg, index: false };
        if (kind < 0.5) return { text: `${preg} del ${fmtIso(pick(r, current))}`, index: true };
        if (kind < 0.7) return { text: `${preg} del ${oldDate}`, index: false };
        if (kind < 0.85) return { text: `${preg}, come da cartella clinica del ${fmtIso(pick(r, current))}`, index: false };
        return { text: LESION.toLowerCase(), index: true };
      });
      const label = pick(r, LABELS);
      const body = `${items.map((it) => it.text).join(pick(r, [', ', '; ']))}.`;
      const before = `## Anamnesi\n\nRiferisce buona salute generale.\n\n${label} ${body}\n\nAttualmente: dolore al polso destro.`;
      const res = sanitizeAnamnesiPast(before, currentDays, lesions);

      const linesB = before.split('\n');
      const linesA = res.text.split('\n');
      expect(linesA.length).toBe(linesB.length);
      const idx = linesB.findIndex((l) => l.startsWith(label));
      linesB.forEach((l, k) => { if (k !== idx) expect(linesA[k]).toBe(l); });

      const anyIndex = items.some((it) => it.index);
      expect(res.replaced).toBe(anyIndex);
      if (!anyIndex) { expect(res.text).toBe(before); continue; }

      const afterBody = linesA[idx]!.slice(label.length).trim();
      const keptExpected = items.filter((it) => !it.index).map((it) => it.text);
      if (keptExpected.length === 0) {
        expect(afterBody).toBe('nulla di rilevante documentato.');
      } else {
        expect(afterBody.endsWith('.')).toBe(true);
        const keptParts = afterBody.slice(0, -1).split(/\s*[;,]\s+/);
        for (const part of keptParts) {
          expect(body.includes(part), `voce non testuale: "${part}"`).toBe(true);
          const isSourceClause = /^come da/i.test(part);
          if (!isSourceClause) for (const c of current) expect(part.includes(fmtIso(c)), `data corrente sopravvissuta: ${part}`).toBe(false);
          expect(part.toLowerCase()).not.toBe(LESION.toLowerCase());
        }
        for (const k of keptExpected) expect(afterBody.includes(k.replace(/, come da/, ', come da')), `voce pregressa persa: ${k}`).toBe(true);
      }
      expect(sanitizeAnamnesiPast(res.text, currentDays, lesions).text).toBe(res.text);
    }
  });

  // Classe coperta (audit 2026-09-10): stessa causa della data in lettere — hasCurrentDate usa il solo DATE_RE numerico
  it('"In passato" con la data dell\'evento indice scritta in lettere viene comunque ripulita', () => {
    const currentDays = collectCurrentDays([{ eventDate: '2024-11-13', temporalScope: 'corrente' }]);
    const res = sanitizeAnamnesiPast('In passato: contusione della spalla sinistra del 13 novembre 2024, diabete mellito.', currentDays, []);
    expect(res.replaced).toBe(true);
    expect(res.text).not.toContain('13 novembre 2024');
    expect(res.text).toContain('diabete mellito');
  });
});

describe('invarianti DATE — unwrapGuillemets e collectCurrentDays', () => {
  it('unwrapGuillemets non tocca cifre né date; collectCurrentDays conta solo i correnti con data valida, mai NaN, giorno giusto', () => {
    const r = mulberry32(99);
    const digits = (s: string): string => s.replace(/\D+/g, '');
    for (let i = 0; i < 500; i++) {
      const p = isoParts(r);
      const text = `Esiti «di frattura del ${toDot(p)}» e «${pick(r, ['controllo', ' ', ''])}» con «RX ${p.d}/${p.m}/${p.y}»`;
      const out = unwrapGuillemets(text);
      expect(digits(out)).toBe(digits(text));
      expect(out).not.toMatch(/[«»]/);
    }
    const days = collectCurrentDays([
      { eventDate: '2025-01-23T00:00:00Z', temporalScope: 'corrente' },
      { eventDate: '2025-01-24', temporalScope: 'retrospettivo' },
      { eventDate: '2025-01-25', temporalScope: 'programmato' },
      { eventDate: '1900-01-01', temporalScope: 'corrente' },
      { eventDate: '', temporalScope: 'corrente' },
      { eventDate: null, temporalScope: 'corrente' },
    ]);
    expect(days.size).toBe(1);
    expect(days.has(Math.round(Date.UTC(2025, 0, 23) / 86_400_000))).toBe(true);
    for (const n of days) expect(Number.isNaN(n)).toBe(false);
  });
});
