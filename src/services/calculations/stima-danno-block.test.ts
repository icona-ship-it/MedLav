import { formatEuro } from '@/lib/format';
import { describe, it, expect } from 'vitest';
import {
  buildStimaDannoMarker,
  formatStimaDannoBlock,
  expandStimaDannoMarkers,
  STIMA_DANNO_MARKER_PREFIX,
  STIMA_DANNO_EMPTY_FALLBACK,
} from './stima-danno-block';
import {
  expandDeterministicBlocks,
  hasDeterministicMarkers,
  type DeterministicTableEvent,
} from './deterministic-tables';
import { calculateDannoBiologico } from './bareme-tables';
import { calculateMilano } from './tabelle-milano';

function ev(partial: Partial<DeterministicTableEvent>): DeterministicTableEvent {
  return {
    event_date: '2025-04-10',
    event_type: 'visita',
    title: 'Evento',
    description: '',
    ...partial,
  };
}

// rc_auto without surgery → range capped at 1-9%, midpoint 5% → micropermanenti
// Art. 139: 963.40 (base D.M. 18/07/2025) × 1.5 (coeff 5%) × 5 = 7225.50 EUR.
const RC_AUTO_EVENTS: DeterministicTableEvent[] = [
  ev({ event_date: '2025-04-10', event_type: 'visita', title: 'Accesso PS' }),
  ev({ event_date: '2025-05-02', event_type: 'follow-up', title: 'Controllo' }),
];

// ortopedica with 2 interventi + complicanza → min 5+5+3=13, max 30 → midpoint 22%
// → TUN macropermanenti + Milano comparison + Balthazard note.
const ORTOPEDICA_EVENTS: DeterministicTableEvent[] = [
  ev({ event_date: '2025-03-10', event_type: 'ricovero', title: 'Ricovero' }),
  ev({ event_date: '2025-03-11', event_type: 'intervento', title: 'Osteosintesi' }),
  ev({ event_date: '2025-06-20', event_type: 'intervento', title: 'Rimozione mezzi di sintesi' }),
  ev({ event_date: '2025-07-01', event_type: 'complicanza', title: 'Infezione ferita' }),
];

describe('buildStimaDannoMarker', () => {
  it('embeds the case type in the parameterized sentinel', () => {
    expect(buildStimaDannoMarker('rc_auto')).toBe('<!--MEDLAV:STIMA_DANNO:rc_auto-->');
    expect(buildStimaDannoMarker('rc_auto').startsWith(STIMA_DANNO_MARKER_PREFIX)).toBe(true);
  });
});

describe('formatStimaDannoBlock', () => {
  it('renders the micropermanenti lookup with the expected amount (rc_auto, no surgery)', () => {
    const out = formatStimaDannoBlock(RC_AUTO_EVENTS, 'rc_auto');
    expect(out).toContain('1-9%'); // refined range (no surgery → cap 9%)
    expect(out).toContain('5%'); // midpoint
    expect(out).toContain('Art. 139 CAP — Micropermanenti (D.M. 18/07/2025)');
    expect(out).toContain('7.225,50'); // 963.40 × 1.5 × 5
    // No Milano comparison ROW below 10% (the routing note may still mention Milano)
    expect(out).not.toContain('demolt.');
  });

  it('renders the TUN macropermanenti lookup + Milano comparison + Balthazard (ortopedica, 2 surgeries + complication)', () => {
    const out = formatStimaDannoBlock(ORTOPEDICA_EVENTS, 'ortopedica');
    const expectedTun = calculateDannoBiologico(22);
    const expectedMilano = calculateMilano(22, 35);
    expect(out).toContain('13-30%');
    expect(out).toContain('22%');
    expect(out).toContain('TUN DPR 12/2025');
    expect(out).toContain(
      formatEuro(expectedTun.estimatedAmount!),
    );
    expect(out).toContain('Tabelle Milano 2024');
    expect(out).toContain(
      formatEuro(expectedMilano.estimatedAmount),
    );
    expect(out).toContain('Balthazard');
  });

  it('un intervento PROGRAMMATO con data futura non gonfia la stima né innesca Balthazard (F-P2)', () => {
    const events: DeterministicTableEvent[] = [
      ev({ event_date: '2025-03-10', event_type: 'ricovero', title: 'Ricovero' }),
      ev({ event_date: '2025-03-11', event_type: 'intervento', title: 'Osteosintesi' }),
      ev({ event_date: '2027-03-01', event_type: 'intervento', title: 'Rimozione mezzi di sintesi (programmata)' }),
    ];
    // today = 2026-01-01: il 2° intervento è FUTURO → un solo intervento conta.
    const out = formatStimaDannoBlock(events, 'ortopedica', '2026-01-01', '2025-03-01');
    expect(out).not.toContain('Balthazard'); // serve >1 intervento REALE
    expect(out).not.toContain('2027');
  });

  it('un intervento PROGRAMMATO con data ormai passata non gonfia la stima né innesca Balthazard (0034)', () => {
    const out = formatStimaDannoBlock([
      { event_date: '2026-01-10', event_type: 'intervento', title: 'Osteosintesi', description: '' },
      { event_date: '2026-03-01', event_type: 'intervento', title: 'Rimozione mezzi di sintesi programmata', description: 'In programma', temporal_scope: 'programmato' },
    ], 'ortopedica', '2026-09-04');
    expect(out).not.toMatch(/Balthazard/i);
  });

  it('includes the table-routing note derived from the earliest dated event (Cass. 8630/2026)', () => {
    const out = formatStimaDannoBlock(ORTOPEDICA_EVENTS, 'ortopedica');
    // 2025-03-10 ≥ TUN effective date 2025-03-05 → direct application
    expect(out).toContain('2025-03-10');
    expect(out).toContain('DIRETTA');
  });

  it('handles undated/sentinel events: no incident date → perito-must-verify note', () => {
    const out = formatStimaDannoBlock(
      [ev({ event_date: '1900-01-01', event_type: 'visita' }), ev({ event_date: '', event_type: 'visita' })],
      'rc_auto',
    );
    expect(out).toContain('Data sinistro non disponibile');
    expect(out).not.toContain('1900');
  });

  it('ignores non-clinical events when deriving the incident date', () => {
    const out = formatStimaDannoBlock(
      [
        ev({ event_date: '2024-01-01', event_type: 'spesa_medica', title: 'Fattura' }),
        ev({ event_date: '2025-04-10', event_type: 'visita' }),
      ],
      'rc_auto',
    );
    expect(out).toContain('2025-04-10');
    expect(out).not.toContain('2024-01-01');
  });

  it('always carries the proposal disclaimer (le tabelle ministeriali fanno fede)', () => {
    const out = formatStimaDannoBlock(RC_AUTO_EVENTS, 'rc_auto');
    expect(out).toContain('Avvertenza');
    expect(out).toMatch(/fa(nno)? fede/);
    expect(out).toContain('proposta');
  });

  it('returns empty string for case types without an indicative range', () => {
    expect(formatStimaDannoBlock(RC_AUTO_EVENTS, 'generica')).toBe('');
    expect(formatStimaDannoBlock(RC_AUTO_EVENTS, 'tipo_inesistente')).toBe('');
  });
});

describe('expandStimaDannoMarkers / expandDeterministicBlocks integration', () => {
  it('expands the parameterized marker from the CURRENT events', () => {
    const synthesis = `## Considerazioni Medico-Legali\n\n${buildStimaDannoMarker('rc_auto')}\n`;
    const out = expandStimaDannoMarkers(synthesis, RC_AUTO_EVENTS);
    expect(out).not.toContain(STIMA_DANNO_MARKER_PREFIX);
    expect(out).toContain('7.225,50');
  });

  it('replaces the marker with the empty fallback when no estimate is possible', () => {
    const synthesis = buildStimaDannoMarker('generica');
    const out = expandStimaDannoMarkers(synthesis, RC_AUTO_EVENTS);
    expect(out).toBe(STIMA_DANNO_EMPTY_FALLBACK);
  });

  it('is a no-op without markers and idempotent after expansion', () => {
    expect(expandStimaDannoMarkers('Nessun marker qui.', RC_AUTO_EVENTS)).toBe('Nessun marker qui.');
    const synthesis = `Testo\n\n${buildStimaDannoMarker('ortopedica')}`;
    const once = expandStimaDannoMarkers(synthesis, ORTOPEDICA_EVENTS);
    const twice = expandStimaDannoMarkers(once, ORTOPEDICA_EVENTS);
    expect(twice).toBe(once);
  });

  it('expandDeterministicBlocks expands STIMA_DANNO alongside the other markers (all read surfaces)', () => {
    const synthesis = `## Considerazioni Medico-Legali\n\n<!--MEDLAV:ITT_ITP-->\n\n${buildStimaDannoMarker('rc_auto')}\n`;
    const out = expandDeterministicBlocks(synthesis, RC_AUTO_EVENTS);
    expect(out).not.toContain('<!--MEDLAV:');
    expect(out).toContain('7.225,50');
    const again = expandDeterministicBlocks(out, RC_AUTO_EVENTS);
    expect(again).toBe(out); // idempotent
  });

  it('hasDeterministicMarkers detects a synthesis that only carries the STIMA_DANNO marker', () => {
    expect(hasDeterministicMarkers(buildStimaDannoMarker('rc_auto'))).toBe(true);
    expect(hasDeterministicMarkers('niente marker')).toBe(false);
  });
});