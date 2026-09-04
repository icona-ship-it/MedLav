import { describe, it, expect } from 'vitest';
import { DEMO_CASE, DEMO_DOCUMENTS, DEMO_EVENTS } from './demo-case-data';
import { buildDemoCaseCode, buildDemoCaseRow, buildDemoDocumentRow, buildDemoEventRows, buildDemoPageRows } from './demo-rows';
import { TEMPORAL_SCOPES } from '@/lib/temporal-scope';

/** Universo fittizio della regola security.md: ogni struttura/persona deve appartenervi. */
const FICTITIOUS_MARKERS = ['cittàdemo', 'demprova', 'demo', 'esempi', 'esemplari', 'fittizi', 'campione'];

describe('DEMO fixtures — invarianti GDPR e coerenza', () => {
  it('ogni struttura, medico e nome file appartiene all\'universo fittizio', () => {
    const strings = [
      ...DEMO_EVENTS.flatMap((e) => [e.doctor, e.facility].filter((s): s is string => !!s)),
      ...DEMO_DOCUMENTS.map((d) => d.fileName),
    ];
    for (const s of strings) {
      expect(FICTITIOUS_MARKERS.some((m) => s.toLowerCase().includes(m)), s).toBe(true);
    }
    expect(DEMO_CASE.notes.toLowerCase()).toContain('fittizi');
  });

  it('ogni evento cita un documento esistente, pagine esistenti e un sourceText presente ESATTAMENTE nella pagina', () => {
    const docByKey = new Map(DEMO_DOCUMENTS.map((d) => [d.key, d]));
    for (const e of DEMO_EVENTS) {
      const doc = docByKey.get(e.documentKey);
      expect(doc, e.title).toBeDefined();
      const cited = e.sourcePages.map((n) => doc!.pages.find((p) => p.pageNumber === n));
      expect(cited.every(Boolean), e.title).toBe(true);
      expect(cited.some((p) => p!.text.includes(e.sourceText)), e.title).toBe(true);
    }
  });

  it('date ISO valide, ordine crescente per order_number, scope validi, confidence 0-100', () => {
    const orders = DEMO_EVENTS.map((e) => e.orderNumber);
    expect(new Set(orders).size).toBe(orders.length);
    expect(orders).toEqual([...orders].sort((a, b) => a - b));
    for (const e of DEMO_EVENTS) {
      expect(e.eventDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(Number.isNaN(Date.parse(e.eventDate))).toBe(false);
      expect(TEMPORAL_SCOPES).toContain(e.temporalScope);
      expect(e.confidence).toBeGreaterThanOrEqual(0);
      expect(e.confidence).toBeLessThanOrEqual(100);
    }
    const dates = DEMO_EVENTS.map((e) => e.eventDate);
    expect(dates).toEqual([...dates].sort());
  });

  it('copre i tre ambiti temporali e almeno un evento da verificare (è ciò che la demo deve mostrare)', () => {
    const scopes = new Set(DEMO_EVENTS.map((e) => e.temporalScope));
    expect(scopes).toEqual(new Set(['corrente', 'retrospettivo', 'programmato']));
    expect(DEMO_EVENTS.some((e) => e.requiresVerification)).toBe(true);
    expect(DEMO_DOCUMENTS.some((d) => d.documentType === 'spese_mediche')).toBe(true);
  });

  it('le pagine sono numerate da 1 senza buchi', () => {
    for (const d of DEMO_DOCUMENTS) {
      expect(d.pages.map((p) => p.pageNumber)).toEqual(d.pages.map((_, i) => i + 1));
      for (const p of d.pages) expect(p.text.trim().length).toBeGreaterThan(50);
    }
  });
});

describe('demo-rows — mappatura verso le colonne DB', () => {
  it('codice DEMO-YYYY-NNN', () => {
    expect(buildDemoCaseCode(2026, 7)).toBe('DEMO-2026-007');
  });

  it('caso: modulo cronistoria, extraction_only, completato, senza crediti/pipeline', () => {
    const row = buildDemoCaseRow({ userId: 'u1', code: 'DEMO-2026-001' });
    expect(row).toMatchObject({
      user_id: 'u1', code: 'DEMO-2026-001', module_id: 'analisi_doc_sanitari', pipeline_mode: 'extraction_only',
      case_role: 'stragiudiziale', processing_stage: 'completato', status: 'bozza', document_count: DEMO_DOCUMENTS.length,
    });
    expect(typeof row.module_category).toBe('number');
    expect(row.perizia_metadata).toEqual({ patientFullName: 'Mario Demprova' });
  });

  it('documento e pagine: completato, PDF, conteggio pagine coerente', () => {
    const doc = DEMO_DOCUMENTS[0]!;
    const row = buildDemoDocumentRow({ caseId: 'c1', doc, storagePath: 'u1/c1/x.pdf', fileSize: 1234 });
    expect(row).toMatchObject({ case_id: 'c1', processing_status: 'completato', file_type: 'application/pdf', page_count: doc.pages.length, document_type: doc.documentType });
    const pages = buildDemoPageRows('d1', doc);
    expect(pages).toHaveLength(doc.pages.length);
    expect(pages[0]).toMatchObject({ document_id: 'd1', page_number: 1 });
  });

  it('eventi: document_id risolto per chiave, source_pages JSON, temporal_scope, is_relevant true', () => {
    const refs = DEMO_DOCUMENTS.map((d, i) => ({ key: d.key, id: `doc-${i}` }));
    const rows = buildDemoEventRows('c1', refs);
    expect(rows).toHaveLength(DEMO_EVENTS.length);
    for (const r of rows) {
      expect(String(r.document_id)).toMatch(/^doc-\d$/);
      expect(JSON.parse(String(r.source_pages))).toBeInstanceOf(Array);
      expect(TEMPORAL_SCOPES).toContain(r.temporal_scope);
      expect(r.is_relevant_for_chronology).toBe(true);
      expect(r.is_deleted).toBe(false);
    }
    expect(() => buildDemoEventRows('c1', [])).toThrow(/documento sconosciuto/);
  });
});
