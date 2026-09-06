import { describe, it, expect } from 'vitest';
import { calculateMedicoLegalPeriods, calculateITTITP, formatRicoveroITTFactsBlock } from './medico-legal-calc';

/**
 * Invarianti dei calcoli (verifica definitiva 2026-09-06): "cosa non deve
 * succedere MAI" su migliaia di sequenze di eventi casuali con seme fisso.
 * Un numero sbagliato in un blocco depositabile è l'errore che il perito non
 * vede: qui si controlla che i FATTI restino dentro i limiti dei dati.
 */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 0x100000000; };
}

const TYPES = ['ricovero', 'referto', 'visita', 'esame', 'terapia', 'intervento', 'certificato', 'altro', 'consenso', 'spesa_medica', 'follow-up', 'diagnosi'];
const TITLES = [
  'Ricovero in Ortopedia', 'Accesso Pronto Soccorso per trauma', 'Dimissione ospedaliera', 'Lettera di dimissione',
  'Decorso post-operatorio del giorno', 'Controllo ortopedico', 'Visita fisiatrica', 'RX polso', 'Osteosintesi',
  'Certificato di malattia con prognosi 30 giorni', 'Preparazione alla dimissione', 'Valutazione Barthel alla dimissione',
  'Trasferimento in reparto', 'Dimissione dal PS e ricovero in reparto', 'Firma consenso informato', 'Ticket € 36,15',
  'Controllo post-dimissione', 'Dimissione da PS: nessuna terapia', 'Trauma gomito per investimento', 'Inizio malattia dichiarato',
];
const SCOPES = [undefined, 'corrente', 'retrospettivo', 'programmato'];
const PRECISIONS = [undefined, 'giorno', 'mese', 'anno'];

function isoFrom(r: () => number): string {
  const y = 2014 + Math.floor(r() * 13);
  const m = 1 + Math.floor(r() * 12);
  const d = 1 + Math.floor(r() * 28);
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function randomEvents(r: () => number): Array<{ event_date: string; event_type: string; title: string; description: string; temporal_scope?: string; date_precision?: string }> {
  const n = 1 + Math.floor(r() * 25);
  return Array.from({ length: n }, () => ({
    event_date: r() < 0.03 ? '1900-01-01' : r() < 0.02 ? 'non-una-data' : isoFrom(r),
    event_type: TYPES[Math.floor(r() * TYPES.length)]!,
    title: TITLES[Math.floor(r() * TITLES.length)]!,
    description: r() < 0.3 ? 'cita la lettera di dimissione del reparto' : '',
    temporal_scope: SCOPES[Math.floor(r() * SCOPES.length)],
    date_precision: PRECISIONS[Math.floor(r() * PRECISIONS.length)],
  }));
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const TODAY = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome' }).format(new Date()); // stesso calendario del codice (mezzanotte di Roma ≠ UTC)

describe('invarianti — calcoli medico-legali (fuzz, seme fisso, 3000 casi)', () => {
  it('nessun NaN, nessun periodo negativo, ogni data dentro i dati, mai date sentinella o future', () => {
    const r = rng(20260906);
    for (let i = 0; i < 3000; i++) {
      const events = randomEvents(r);
      const valid = events.map((e) => e.event_date).filter((d) => ISO.test(d) && d !== '1900-01-01' && d <= TODAY);
      const min = valid.length ? [...valid].sort()[0]! : null;
      const max = valid.length ? [...valid].sort().at(-1)! : null;
      const rows = calculateMedicoLegalPeriods(events);
      for (const c of rows) {
        expect(Number.isNaN(c.days ?? 0), `NaN in ${c.label}`).toBe(false);
        if (c.days !== null) expect(c.days, c.label).toBeGreaterThanOrEqual(0);
        for (const d of [c.startDate, c.endDate]) {
          if (!d) continue;
          expect(ISO.test(d), `data malformata ${d}`).toBe(true);
          expect(d !== '1900-01-01', 'sentinella').toBe(true);
          expect(d <= TODAY, 'futuro').toBe(true);
          if (min && max) { expect(d >= min && d <= max, `fuori dai dati ${d}`).toBe(true); }
        }
        if (c.startDate && c.endDate) expect(c.endDate >= c.startDate, `periodo rovesciato ${c.label}`).toBe(true);
      }
      const segs = calculateITTITP(events);
      for (const s of segs) {
        expect(s.days).toBeGreaterThan(0);
        if (s.startDate && s.endDate) expect(s.endDate >= s.startDate).toBe(true);
      }
      const block = formatRicoveroITTFactsBlock(events);
      expect(block).not.toMatch(/NaN|undefined|1900|\(\d+\)\s*giorni/); // mai la cifra tra parentesi al posto delle lettere
      expect(block).not.toMatch(/Giorni di degenza: 0 /);
    }
  });

  it('i giorni di ricovero non superano mai l\'intervallo primo→ultimo evento e ogni degenza dura ≤ 90 gg senza eventi intermedi', () => {
    const r = rng(19770427);
    for (let i = 0; i < 2000; i++) {
      const events = randomEvents(r);
      const rows = calculateMedicoLegalPeriods(events);
      const total = rows.find((c) => c.label === 'Periodo totale malattia');
      const hospital = rows.filter((c) => c.label === 'Giorni di ricovero');
      for (const h of hospital) {
        if (total?.days != null && h.days != null) expect(h.days).toBeLessThanOrEqual(total.days);
        if (h.days != null && h.days > 90) {
          const inside = events.filter((e) => e.event_type === 'ricovero' && e.event_date > h.startDate! && e.event_date < h.endDate!);
          expect(inside.length, 'degenza lunga senza eventi di degenza intermedi').toBeGreaterThan(0);
        }
      }
    }
  });
});
