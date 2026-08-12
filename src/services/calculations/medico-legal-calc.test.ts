import { describe, it, expect } from 'vitest';
import {
  calculateMedicoLegalPeriods,
  calculateITTITP,
  calculationsToITTITPSegments,
  formatITTITPTable,
  formatRicoveroITTFactsBlock,
} from './medico-legal-calc';

function makeEvent(eventDate: string, eventType: string, title: string, description = '') {
  return { event_date: eventDate, event_type: eventType, title, description };
}

describe('formatRicoveroITTFactsBlock — fatti deterministici Epicrisi (ricovero + durata complessiva)', () => {
  it('giorni di ricovero INCLUSIVI (14→22 = 9, come i benchmark) + durata complessiva, MAI etichettati ITT/invalidità', () => {
    const events = [
      makeEvent('2024-11-14', 'ricovero', 'Ricovero'),
      makeEvent('2024-11-22', 'ricovero', 'Lettera di dimissione', 'dimissione a domicilio'),
      makeEvent('2025-01-16', 'follow-up', 'Controllo ortopedico'),
    ];
    const block = formatRicoveroITTFactsBlock(events);
    expect(block).toContain('Giorni di ricovero');
    expect(block).toContain('9 (nove)'); // inclusivo (gold), coerente con calculateHospitalDays e la sezione PERIODI
    expect(block).toContain('Durata complessiva del periodo di malattia');
    // il numero della durata NON va etichettato come ITT/invalidità (era il bug "448 gg ITT")
    expect(block).not.toMatch(/invalidità temporanea/i);
    expect(block).not.toContain('ITT');
  });

  it('esclude le menzioni anno-only dallo span: niente 01.01.YYYY, niente span gonfiato (fix review Bug B)', () => {
    const events: Array<{ event_date: string; event_type: string; title: string; description: string; date_precision?: string }> = [
      // anamnesi remota "colecistectomia nel 2002" — data fabbricata 01.01, precisione anno
      { event_date: '2002-01-01', event_type: 'intervento', title: 'Colecistectomia', description: 'in anamnesi', date_precision: 'anno' },
      { event_date: '2024-11-14', event_type: 'ricovero', title: 'Ricovero', description: '' },
      { event_date: '2024-11-22', event_type: 'ricovero', title: 'Dimissione', description: 'lettera di dimissione' },
    ];
    const block = formatRicoveroITTFactsBlock(events);
    // il 2002 NON deve comparire (né come 01.01.2002 né come anno che gonfia lo span)
    expect(block).not.toContain('2002');
    // lo span parte dall'evento day-precise (14.11.2024), non dall'anamnesi
    expect(block).toContain('14.11.2024');
  });

  it('nessun ricovero → niente riga ricovero, ma la durata complessiva resta', () => {
    const events = [
      makeEvent('2024-01-10', 'visita', 'Prima visita'),
      makeEvent('2024-06-15', 'follow-up', 'Ultimo controllo'),
    ];
    const block = formatRicoveroITTFactsBlock(events);
    expect(block).not.toContain('Giorni di ricovero');
    expect(block).toContain('Durata complessiva del periodo di malattia');
  });

  it('fasce graduate 75/50/25 NON incluse (restano scaffold del perito)', () => {
    const events = [
      makeEvent('2024-11-14', 'ricovero', 'Ricovero'),
      makeEvent('2024-11-22', 'ricovero', 'Dimissione', 'dimissione'),
    ];
    const block = formatRicoveroITTFactsBlock(events);
    expect(block).not.toContain('75%');
    expect(block).not.toContain('50%');
    expect(block).not.toContain('25%');
  });

  it('eventi vuoti → stringa vuota', () => {
    expect(formatRicoveroITTFactsBlock([])).toBe('');
  });
});

describe('calculateMedicoLegalPeriods', () => {
  it('should return empty for no events', () => {
    expect(calculateMedicoLegalPeriods([])).toEqual([]);
  });

  it('should calculate total illness period', () => {
    const events = [
      makeEvent('2024-01-10', 'visita', 'Prima visita'),
      makeEvent('2024-06-15', 'follow-up', 'Ultimo controllo'),
    ];

    const calcs = calculateMedicoLegalPeriods(events);
    const total = calcs.find((c) => c.label === 'Periodo totale malattia');

    expect(total).toBeDefined();
    expect(total!.days).toBe(158); // inclusivo: 10.01→15.06 conta entrambi gli estremi
    expect(total!.startDate).toBe('2024-01-10');
    expect(total!.endDate).toBe('2024-06-15');
  });

  it('should calculate hospital days from ricovero to dimissione', () => {
    const events = [
      makeEvent('2024-01-10', 'ricovero', 'Ricovero ospedaliero'),
      makeEvent('2024-01-18', 'ricovero', 'Dimissione', 'Lettera di dimissione'),
    ];

    const calcs = calculateMedicoLegalPeriods(events);
    const hospital = calcs.find((c) => c.label === 'Giorni di ricovero');

    expect(hospital).toBeDefined();
    expect(hospital!.days).toBe(9); // inclusivo: 10.01→18.01 = 9 giorni di degenza (gold)
  });

  it('should calculate interval between surgeries', () => {
    const events = [
      makeEvent('2024-01-10', 'intervento', 'Primo intervento'),
      makeEvent('2024-03-15', 'intervento', 'Secondo intervento'),
    ];

    const calcs = calculateMedicoLegalPeriods(events);
    const interval = calcs.find((c) => c.label.includes('Intervallo tra interventi'));

    expect(interval).toBeDefined();
    expect(interval!.days).toBe(65);
  });

  it('should calculate diagnosis to treatment time', () => {
    const events = [
      makeEvent('2024-01-10', 'diagnosi', 'Diagnosi tumore'),
      makeEvent('2024-02-20', 'intervento', 'Intervento chirurgico'),
    ];

    const calcs = calculateMedicoLegalPeriods(events);
    const d2t = calcs.find((c) => c.label.includes('diagnosi'));

    expect(d2t).toBeDefined();
    expect(d2t!.days).toBe(41);
  });

  it('should include ITT estimate', () => {
    const events = [
      makeEvent('2024-01-10', 'ricovero', 'Ricovero'),
      makeEvent('2024-01-20', 'ricovero', 'Dimissione ospedaliera', 'Dimissione in buone condizioni'),
    ];

    const calcs = calculateMedicoLegalPeriods(events);
    const itt = calcs.find((c) => c.label.includes('ITT'));

    expect(itt).toBeDefined();
    expect(itt!.days).toBe(11); // inclusivo: 10.01→20.01 = 11 giorni
  });
});

describe('A2 — graduated ITT/ITP segments', () => {
  it('returns no segments for empty events', () => {
    expect(calculateITTITP([])).toEqual([]);
  });

  it('produces an ITT 100% segment for a hospital stay', () => {
    const events = [
      makeEvent('2024-01-10', 'ricovero', 'Ricovero ospedaliero'),
      makeEvent('2024-01-20', 'ricovero', 'Dimissione ospedaliera', 'Dimissione in buone condizioni'),
    ];
    const segments = calculateITTITP(events);
    const itt = segments.find((s) => s.percentage === 100);
    expect(itt).toBeDefined();
    expect(itt!.days).toBe(11); // inclusivo: 10.01→20.01 = 11 giorni di degenza
    expect(itt!.startDate).toBe('2024-01-10');
    expect(itt!.endDate).toBe('2024-01-20');
  });

  it('produces graduated ITP segments (75/50/25) with a documented rehab phase', () => {
    const events = [
      makeEvent('2024-01-10', 'ricovero', 'Ricovero'),
      makeEvent('2024-01-20', 'ricovero', 'Dimissione', 'Dimissione, applicato tutore'),
      makeEvent('2024-02-10', 'terapia', 'Inizio fisioterapia', 'Ciclo di riabilitazione motoria'),
      makeEvent('2024-03-10', 'terapia', 'Fine fisioterapia', 'Termine fisioterapia'),
      makeEvent('2024-04-10', 'follow-up', 'Controllo finale', 'Stabilizzazione clinica'),
    ];
    const segments = calculateITTITP(events);
    const percentages = segments.map((s) => s.percentage);
    expect(percentages).toContain(100);
    expect(percentages).toContain(75);
    expect(percentages).toContain(50);
    expect(percentages).toContain(25);
    // All positive day counts
    expect(segments.every((s) => s.days > 0)).toBe(true);
  });

  it('marks third-split ITP segments as estimated when no rehab phase is documented', () => {
    const events = [
      makeEvent('2024-01-10', 'ricovero', 'Ricovero'),
      makeEvent('2024-01-20', 'ricovero', 'Dimissione', 'Dimissione'),
      makeEvent('2024-05-20', 'follow-up', 'Controllo', 'Visita di controllo'),
    ];
    const segments = calculateITTITP(events);
    const itp = segments.filter((s) => s.percentage !== 100);
    expect(itp.length).toBeGreaterThan(0);
    expect(itp.every((s) => s.estimated)).toBe(true);
  });

  it('calculationsToITTITPSegments ignores non-ITT/ITP rows', () => {
    const calcs = calculateMedicoLegalPeriods([
      makeEvent('2024-01-10', 'ricovero', 'Ricovero'),
      makeEvent('2024-01-20', 'ricovero', 'Dimissione', 'Dimissione'),
    ]);
    const segments = calculationsToITTITPSegments(calcs);
    // Hospital-days / total-illness rows must not leak in as segments
    expect(segments.every((s) => [100, 75, 50, 25].includes(s.percentage))).toBe(true);
  });

  it('formatITTITPTable renders a Markdown table with a totals row', () => {
    const events = [
      makeEvent('2024-01-10', 'ricovero', 'Ricovero'),
      makeEvent('2024-01-20', 'ricovero', 'Dimissione', 'Dimissione'),
    ];
    const table = formatITTITPTable(calculateITTITP(events));
    expect(table).toContain('| Periodo | Dal | Al | Giorni | Invalidità |');
    expect(table).toContain('|---|---|---|---|---|');
    expect(table).toContain('100%');
    expect(table).toContain('Totale giorni');
  });

  it('formatITTITPTable returns empty string for no segments', () => {
    expect(formatITTITPTable([])).toBe('');
  });

  // Post-audit: the UI passes RAW DB rows, which can carry the sentinel date
  // '1900-01-01' for undated clinical events. Those must be filtered, else the
  // table shows "Data non documentata" and multi-decade windows.
  it('calculateITTITP ignores sentinel-dated and malformed-date events', () => {
    const segments = calculateITTITP([
      makeEvent('1900-01-01', 'visita', 'Visita non datata'),
      makeEvent('2024-03', 'esame', 'Esame con data parziale'),
      makeEvent('2024-01-10', 'ricovero', 'Ricovero'),
      makeEvent('2024-01-20', 'ricovero', 'Dimissione', 'Dimissione in buone condizioni'),
    ]);
    const itt = segments.find((s) => s.percentage === 100);
    expect(itt).toBeDefined();
    expect(itt!.startDate).toBe('2024-01-10'); // anchored on the real ricovero, not 1900
    expect(segments.every((s) => s.startDate !== '1900-01-01' && s.endDate !== '1900-01-01')).toBe(true);
  });

  it('formatITTITPTable escapes pipe characters in labels', () => {
    const table = formatITTITPTable([
      { label: 'ITT | 100', percentage: 100, days: 5, startDate: '2024-01-10', endDate: '2024-01-15', estimated: false },
    ]);
    // The literal pipe in the label must be escaped so columns don't shift.
    expect(table).toContain('ITT \\| 100');
  });

  it('formatITTITPTable usa la notazione formale cifra + lettere (benchmark)', () => {
    const table = formatITTITPTable([
      { label: 'ITP', percentage: 75, days: 90, startDate: '2024-01-10', endDate: '2024-04-09', estimated: false },
    ]);
    expect(table).toContain('90 (novanta)');
    expect(table).toContain('75% (settantacinque per cento)');
  });
});

// ── Ondata 1 (audit project-wide): correttezza calcoli ITT/ITP ──
describe('Audit Ondata 1 — ITT/ITP correctness', () => {
  const ittDays = (calcs: ReturnType<typeof calculateMedicoLegalPeriods>) =>
    calcs.find((c) => c.label.includes('ITT'))?.days ?? null;
  const hospitalRows = (calcs: ReturnType<typeof calculateMedicoLegalPeriods>) =>
    calcs.filter((c) => c.label === 'Giorni di ricovero');

  it('does NOT double-count when 2 admissions share 1 discharge', () => {
    const calcs = calculateMedicoLegalPeriods([
      makeEvent('2024-01-10', 'ricovero', 'Primo ricovero'),
      makeEvent('2024-01-15', 'ricovero', 'Secondo ricovero'),
      makeEvent('2024-01-20', 'ricovero', 'Dimissione', 'Dimissione'),
      makeEvent('2024-03-01', 'follow-up', 'Controllo'),
    ]);
    expect(hospitalRows(calcs)).toHaveLength(1); // discharge paired once
    expect(ittDays(calcs)).toBe(11); // Jan10→Jan20 inclusivo (= 11), non 15 (niente double-count)
  });

  // Audit 2026-08-11 — invarianti F-1 (pairing same-day) e F-P2 (degenza duplicata).
  it('F-1: day-surgery same-day + ricovero successivo → 1 gg e 10 gg, MAI un ponte da 37 gg', () => {
    const calcs = calculateMedicoLegalPeriods([
      makeEvent('2026-01-05', 'ricovero', 'Day surgery'),
      makeEvent('2026-01-05', 'ricovero', 'Dimissione in giornata', 'dimesso in giornata'),
      makeEvent('2026-02-01', 'ricovero', 'Secondo ricovero'),
      makeEvent('2026-02-10', 'ricovero', 'Dimissione', 'dimissione'),
      makeEvent('2026-04-20', 'follow-up', 'Controllo'),
    ]);
    const days = hospitalRows(calcs).map((r) => r.days).sort((a, b) => (a ?? 0) - (b ?? 0));
    expect(days).toEqual([1, 10]);
    expect(hospitalRows(calcs).some((r) => r.days === 37)).toBe(false); // niente ponte
  });

  it('F-1: day-hospital singolo (ricovero + dimissione stesso giorno) → 1 riga da 1 giorno, non 0', () => {
    const calcs = calculateMedicoLegalPeriods([
      makeEvent('2026-01-05', 'ricovero', 'Day hospital'),
      makeEvent('2026-01-05', 'ricovero', 'Dimissione in giornata', 'dimesso in giornata'),
      makeEvent('2026-02-15', 'follow-up', 'Controllo'),
    ]);
    expect(hospitalRows(calcs)).toHaveLength(1);
    expect(hospitalRows(calcs)[0].days).toBe(1);
  });

  it('F-P2: una menzione anamnestica ANNO-only (fabbricata YYYY-01-01) non ancora ITT/ITP', () => {
    const events = [
      { event_date: '2020-01-01', event_type: 'visita', title: 'Cervicalgia nel 2020', description: 'in anamnesi', date_precision: 'anno' },
      { event_date: '2026-03-01', event_type: 'ricovero', title: 'Ricovero', description: '', date_precision: 'giorno' },
      { event_date: '2026-03-10', event_type: 'ricovero', title: 'Dimissione', description: 'dimissione', date_precision: 'giorno' },
    ];
    const calcs = calculateMedicoLegalPeriods(events);
    // Nessuna riga deve partire dal 2020 (span gonfiato a ~2260 giorni).
    for (const c of calcs) {
      if (c.startDate) expect(c.startDate >= '2026-01-01').toBe(true);
      if (c.days != null) expect(c.days).toBeLessThan(365);
    }
    // Anche il percorso UI/marker (calculateITTITP) ignora l'anno-only.
    const segments = calculateITTITP(events);
    for (const s of segments) {
      if (s.startDate) expect(s.startDate >= '2026-01-01').toBe(true);
    }
  });

  it('F-P2: stessa degenza da DUE documenti → giorni di ricovero e ITT 100% NON raddoppiati (10, non 20)', () => {
    const dup = [
      makeEvent('2026-02-01', 'ricovero', 'Ricovero (doc A)'),
      makeEvent('2026-02-10', 'ricovero', 'Dimissione (doc A)', 'dimissione'),
      makeEvent('2026-02-01', 'ricovero', 'Ricovero (doc B)'),
      makeEvent('2026-02-10', 'ricovero', 'Dimissione (doc B)', 'dimissione'),
    ];
    const calcs = calculateMedicoLegalPeriods(dup);
    expect(hospitalRows(calcs)).toHaveLength(1);
    expect(hospitalRows(calcs)[0].days).toBe(10);
    // Percorso ITT graduata (UI/marker): la degenza duplicata è fusa → 10, non 20.
    const itt = calculateITTITP(dup).find((c) => c.label.startsWith('Invalidità Temporanea Totale'));
    expect(itt?.days).toBe(10);
  });

  it('detects a discharge NOT labeled "dimissione" ("Relazione di fine ricovero")', () => {
    const calcs = calculateMedicoLegalPeriods([
      makeEvent('2024-01-10', 'ricovero', 'Ricovero'),
      makeEvent('2024-01-20', 'referto', 'Relazione di fine ricovero', 'Paziente dimesso'),
      makeEvent('2024-03-01', 'follow-up', 'Controllo'),
    ]);
    expect(ittDays(calcs)).toBe(11); // hospital stay not lost (Jan10→Jan20 inclusivo)
  });

  it('does NOT produce a backward ITP period when the only follow-up precedes the discharge', () => {
    const calcs = calculateMedicoLegalPeriods([
      makeEvent('2024-01-05', 'follow-up', 'Visita pre-ricovero'),
      makeEvent('2024-01-10', 'ricovero', 'Ricovero'),
      makeEvent('2024-01-20', 'ricovero', 'Dimissione', 'Dimissione'),
    ]);
    // No ITP segment may have endDate before startDate.
    for (const c of calcs.filter((x) => x.label.startsWith('ITP'))) {
      if (c.startDate && c.endDate) expect(c.endDate >= c.startDate).toBe(true);
    }
  });

  it('uses explicit rehab phases for English "physiotherapy" (not the thirds estimate)', () => {
    const calcs = calculateMedicoLegalPeriods([
      makeEvent('2024-01-10', 'ricovero', 'Ricovero'),
      makeEvent('2024-01-20', 'ricovero', 'Dimissione', 'Dimissione'),
      makeEvent('2024-02-01', 'terapia', 'Start physiotherapy', 'physical therapy cycle'),
      makeEvent('2024-03-01', 'terapia', 'End physiotherapy', 'physiotherapy completed'),
      makeEvent('2024-04-01', 'follow-up', 'Controllo finale'),
    ]);
    const itp = calcs.filter((c) => c.label.startsWith('ITP'));
    // Explicit phases are NOT marked "(stima)".
    expect(itp.length).toBeGreaterThan(0);
    expect(itp.every((c) => !c.value.includes('stima'))).toBe(true);
  });

  it('keeps the thirds invariant (sum of ITP days == total recovery) and emits no 0-day rows', () => {
    for (const totalApprox of [2, 5, 10, 100, 101, 102]) {
      const end = new Date(Date.UTC(2024, 0, 11) + totalApprox * 86_400_000).toISOString().slice(0, 10);
      const calcs = calculateMedicoLegalPeriods([
        makeEvent('2024-01-10', 'ricovero', 'Ricovero'),
        makeEvent('2024-01-11', 'ricovero', 'Dimissione', 'Dimissione'),
        makeEvent(end, 'follow-up', 'Controllo'),
      ]);
      const itp = calcs.filter((c) => c.label.startsWith('ITP') && c.value.includes('stima'));
      expect(itp.every((c) => (c.days ?? 0) > 0)).toBe(true); // no "0 giorni" rows
      const sum = itp.reduce((a, c) => a + (c.days ?? 0), 0);
      // total recovery = end - dischargeDate(2024-01-11)
      const total = Math.round((Date.parse(end + 'T00:00:00Z') - Date.parse('2024-01-11T00:00:00Z')) / 86_400_000);
      expect(sum).toBe(total);
    }
  });

  it('is robust to unsorted input (sorts internally)', () => {
    const sorted = calculateMedicoLegalPeriods([
      makeEvent('2024-01-10', 'ricovero', 'Ricovero'),
      makeEvent('2024-01-20', 'ricovero', 'Dimissione', 'Dimissione'),
      makeEvent('2024-03-01', 'follow-up', 'Controllo'),
    ]);
    const shuffled = calculateMedicoLegalPeriods([
      makeEvent('2024-03-01', 'follow-up', 'Controllo'),
      makeEvent('2024-01-20', 'ricovero', 'Dimissione', 'Dimissione'),
      makeEvent('2024-01-10', 'ricovero', 'Ricovero'),
    ]);
    expect(ittDays(shuffled)).toBe(ittDays(sorted));
    const totSorted = sorted.find((c) => c.label === 'Periodo totale malattia');
    const totShuffled = shuffled.find((c) => c.label === 'Periodo totale malattia');
    expect(totShuffled?.days).toBe(totSorted?.days);
    expect(totShuffled?.startDate).toBe('2024-01-10');
    expect(totShuffled?.endDate).toBe('2024-03-01');
  });
});

describe('QA 2026-06-11 — dedup ricoveri e sanity check (caso Tedesco, PDF duplicato)', () => {
  it('should merge identical/overlapping ricovero intervals (duplicated docs counted once)', () => {
    const events = [
      makeEvent('2024-01-10', 'ricovero', 'Ricovero ortopedia'),
      makeEvent('2024-01-10', 'ricovero', 'Ricovero ortopedia'), // duplicato dal PDF doppio
      makeEvent('2024-01-20', 'referto', 'Dimissione'),
      makeEvent('2024-01-20', 'referto', 'Dimissione'), // duplicato
      makeEvent('2024-03-01', 'visita', 'Controllo finale'),
    ];
    const calcs = calculateMedicoLegalPeriods(events);
    const ricoveri = calcs.filter((c) => c.label === 'Giorni di ricovero');
    expect(ricoveri).toHaveLength(1);
    expect(ricoveri[0].days).toBe(11); // inclusivo: Jan10→Jan20 (dup fusi, contati una volta)
  });

  it('should flag DA VERIFICARE when estimated periods exceed the observed interval', () => {
    // Intervallo osservato corto, ma ricovero "fantasma" lungo che gonfia ITT
    const events = [
      makeEvent('2024-01-01', 'ricovero', 'Ricovero'),
      makeEvent('2024-12-31', 'referto', 'Dimissione'), // ricovero di un anno
      makeEvent('2025-01-10', 'visita', 'Controllo'),
    ];
    const calcs = calculateMedicoLegalPeriods(events);
    const graduated = calcs.filter((c) => /ITT|ITP/.test(c.label));
    // La somma ITT(365) + ITP graduata supera l'intervallo (374 gg) → flag
    const flagged = graduated.filter((c) => c.notes.includes('DA VERIFICARE'));
    const total = graduated.reduce((s, c) => s + (c.days ?? 0), 0);
    if (total > 374 * 1.1) {
      expect(flagged.length).toBe(graduated.length);
      expect(flagged[0].notes).toContain('supera l\'intervallo documentato');
    } else {
      expect(flagged).toHaveLength(0); // somma plausibile: nessun falso allarme
    }
  });
});

describe('Data sinistro — eventi preesistenti esclusi dai calcoli (feedback beta 2026-07-20)', () => {
  // Scenario reale (CASO-2026-027): un'artroscopia PREESISTENTE del 03.03, citata
  // nell'anamnesi del PS, ancorava il "periodo di malattia" a 116 giorni. Col
  // sinistro del 18.04 il periodo corretto è 18.04→30.06 = 74 giorni inclusivi.
  const eventsWithPreexisting = [
    makeEvent('2026-03-03', 'intervento', 'Artroscopia caviglia destra', 'intervento preesistente citato in anamnesi'),
    makeEvent('2026-04-18', 'visita', 'Accesso in PS per incidente stradale'),
    makeEvent('2026-06-30', 'certificazione', 'Certificato definitivo con postumi'),
  ];

  it('calculateMedicoLegalPeriods: il periodo totale parte dal sinistro, non dalla preesistenza', () => {
    const calcs = calculateMedicoLegalPeriods(eventsWithPreexisting, undefined, '18/04/2026');
    const total = calcs.find((c) => c.label === 'Periodo totale malattia');
    expect(total).toBeDefined();
    expect(total!.startDate).toBe('2026-04-18');
    expect(total!.endDate).toBe('2026-06-30');
    expect(total!.days).toBe(74);
  });

  it('senza data sinistro il comportamento resta invariato (retrocompatibile)', () => {
    const calcs = calculateMedicoLegalPeriods(eventsWithPreexisting);
    const total = calcs.find((c) => c.label === 'Periodo totale malattia');
    expect(total!.startDate).toBe('2026-03-03');
  });

  it('accetta la data sinistro sia in formato italiano sia ISO', () => {
    for (const d of ['18/04/2026', '18.04.2026', '2026-04-18']) {
      const calcs = calculateMedicoLegalPeriods(eventsWithPreexisting, undefined, d);
      const total = calcs.find((c) => c.label === 'Periodo totale malattia');
      expect(total!.startDate).toBe('2026-04-18');
    }
  });

  it('data sinistro malformata o vuota → ignorata, nessun crash e nessun filtro', () => {
    for (const d of ['15/13/2026', 'boh', '', '  ', undefined]) {
      const calcs = calculateMedicoLegalPeriods(eventsWithPreexisting, undefined, d);
      const total = calcs.find((c) => c.label === 'Periodo totale malattia');
      expect(total!.startDate).toBe('2026-03-03');
    }
  });

  it('un evento NEL giorno del sinistro è incluso (>=, non >)', () => {
    const calcs = calculateMedicoLegalPeriods(eventsWithPreexisting, undefined, '2026-04-18');
    const total = calcs.find((c) => c.label === 'Periodo totale malattia');
    expect(total!.startDate).toBe('2026-04-18');
  });

  it('tutti gli eventi antecedenti al sinistro → nessun calcolo (mai numeri assurdi)', () => {
    const calcs = calculateMedicoLegalPeriods(
      [makeEvent('2026-03-03', 'intervento', 'Artroscopia')],
      undefined,
      '2026-04-18',
    );
    expect(calcs).toEqual([]);
  });

  it('calculateITTITP filtra le preesistenze con la data sinistro', () => {
    const events = [
      makeEvent('2026-03-03', 'intervento', 'Artroscopia preesistente'),
      makeEvent('2026-04-18', 'ricovero', 'Ricovero'),
      makeEvent('2026-04-25', 'ricovero', 'Dimissione', 'dimissione a domicilio'),
      makeEvent('2026-06-30', 'follow-up', 'Controllo finale'),
    ];
    const withFilter = calculateITTITP(events, '18/04/2026');
    for (const s of withFilter) {
      expect(s.startDate === null || s.startDate >= '2026-04-18').toBe(true);
    }
  });

  it('formatRicoveroITTFactsBlock: parte dal sinistro e dichiara le preesistenze escluse', () => {
    const block = formatRicoveroITTFactsBlock(eventsWithPreexisting, '18/04/2026');
    expect(block).toContain('18.04.2026');
    expect(block).not.toContain('03.03.2026');
    expect(block).toContain('74 (settantaquattro)');
    expect(block.toLowerCase()).toContain('preesistenz'); // nota di trasparenza per il perito
  });

  // Collaudo live 2026-07-24 (CASO-2026-029): un "controllo ortopedico
  // programmato" con data futura (estratto da una prescrizione) allungava il
  // periodo di malattia fino all'appuntamento mai avvenuto.
  it('un evento con data FUTURA (appuntamento programmato) NON entra nel periodo di malattia', () => {
    const calcs = calculateMedicoLegalPeriods([
      makeEvent('2026-04-18', 'visita', 'Accesso PS'),
      makeEvent('2026-06-05', 'terapia', 'Ultima seduta'),
      makeEvent('2099-01-01', 'follow-up', 'Controllo ortopedico programmato'),
    ], undefined, '2026-04-18');
    const total = calcs.find((c) => c.label === 'Periodo totale malattia');
    expect(total!.endDate).toBe('2026-06-05');
  });

  it('solo eventi futuri → nessun calcolo', () => {
    expect(calculateMedicoLegalPeriods([makeEvent('2099-01-01', 'follow-up', 'Programmato')])).toEqual([]);
  });

  // Decisione founder 2026-07-24: il certificato MEDICO di guarigione/prognosi
  // CHIUDE il periodo di malattia (come ragiona il perito); restano esclusi i
  // certificati amministrativi (la ratio Passaniti: notifiche/ticket tardivi).
  it('il certificato di guarigione CHIUDE il periodo (18.04→30.06 = 74 gg, il confronto col caso beta)', () => {
    const calcs = calculateMedicoLegalPeriods([
      makeEvent('2026-04-18', 'visita', 'Accesso PS per incidente stradale'),
      makeEvent('2026-06-05', 'terapia', 'Ultima seduta fisioterapia'),
      makeEvent('2026-06-30', 'certificato', 'Certificato medico definitivo', 'ha conseguito guarigione clinica con postumi da valutare'),
    ], undefined, '2026-04-18');
    const total = calcs.find((c) => c.label === 'Periodo totale malattia');
    expect(total!.endDate).toBe('2026-06-30');
    expect(total!.days).toBe(74);
  });

  it('certificato con prognosi → incluso nei calcoli', () => {
    const calcs = calculateMedicoLegalPeriods([
      makeEvent('2026-04-18', 'visita', 'Accesso PS'),
      makeEvent('2026-04-20', 'certificato', 'Certificato medico', 'Prognosi giorni s.c. 40 giorni dall\'incidente'),
    ]);
    const total = calcs.find((c) => c.label === 'Periodo totale malattia');
    expect(total!.endDate).toBe('2026-04-20');
  });

  it('certificato AMMINISTRATIVO tardivo → resta ESCLUSO (regressione Passaniti)', () => {
    const calcs = calculateMedicoLegalPeriods([
      makeEvent('2026-04-18', 'visita', 'Accesso PS'),
      makeEvent('2026-06-05', 'terapia', 'Ultima seduta'),
      makeEvent('2026-08-20', 'certificato', 'Sollecito pagamento ticket', 'Richiesta pagamento prestazioni codice bianco, quota fissa 25 euro'),
    ]);
    const total = calcs.find((c) => c.label === 'Periodo totale malattia');
    expect(total!.endDate).toBe('2026-06-05');
  });

  it('formatRicoveroITTFactsBlock: senza eventi esclusi nessuna nota preesistenze', () => {
    const events = [
      makeEvent('2026-04-18', 'visita', 'Accesso in PS'),
      makeEvent('2026-06-30', 'certificazione', 'Certificato definitivo'),
    ];
    const block = formatRicoveroITTFactsBlock(events, '18/04/2026');
    expect(block.toLowerCase()).not.toContain('preesistenz');
  });
});
