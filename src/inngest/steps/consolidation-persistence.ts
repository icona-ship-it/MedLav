/**
 * Piano di persistenza del consolidamento (collaudo 2026-09-18, cronistoria):
 * consolidateEvents() scarta i doppioni e aggrega gli esami IN MEMORIA, ma
 * finora il DB teneva tutte le righe → il medico vedeva nella cronistoria
 * doppioni che la perizia non aveva. Qui si traducono le decisioni del
 * consolidatore in operazioni sul DB: righe assorbite da eliminare, righe
 * sopravvissute da riscrivere (titolo/descrizione/tipo/note cambiati).
 * Funzione pura: nessun accesso al DB.
 */
import type { ConsolidatedEvent } from '@/services/consolidation/event-consolidator';

export interface RawEventRowForPersistence {
  id: string;
  title: string;
  description: string;
  event_type: string;
  diagnosis: string | null;
  doctor: string | null;
  facility: string | null;
  confidence: number;
  requires_verification: boolean;
  reliability_notes: string | null;
  source_pages: string | null;
  temporal_scope?: string | null;
}

export interface SurvivorUpdate {
  id: string;
  fields: Partial<{
    title: string;
    description: string;
    event_type: string;
    diagnosis: string | null;
    doctor: string | null;
    facility: string | null;
    confidence: number;
    requires_verification: boolean;
    reliability_notes: string | null;
    source_pages: string | null;
    temporal_scope: string;
  }>;
}

export interface ConsolidationPersistencePlan {
  /** Righe assorbite: da eliminare (sono doppioni/aggregati del sopravvissuto). */
  deleteIds: string[];
  /** Righe sopravvissute con campi cambiati: da riscrivere. */
  updates: SurvivorUpdate[];
}

export function planConsolidationPersistence(
  allEvents: ReadonlyArray<ConsolidatedEvent>,
  existingRaw: ReadonlyArray<RawEventRowForPersistence>,
): ConsolidationPersistencePlan {
  const survivors = new Set<string>();
  for (const e of allEvents) if (e.rowId) survivors.add(e.rowId);

  const deleteIds: string[] = [];
  const seen = new Set<string>();
  for (const e of allEvents) {
    for (const id of e.absorbedRowIds ?? []) {
      // Mai eliminare una riga che è anche un sopravvissuto (difesa da fusioni incoerenti).
      if (survivors.has(id) || seen.has(id)) continue;
      seen.add(id);
      deleteIds.push(id);
    }
  }

  const rawById = new Map(existingRaw.map((r) => [r.id, r]));
  const updates: SurvivorUpdate[] = [];
  for (const e of allEvents) {
    if (!e.rowId || !e.mutated) continue;
    const row = rawById.get(e.rowId);
    if (!row) continue;
    const fields: SurvivorUpdate['fields'] = {};
    if (e.title !== row.title) fields.title = e.title;
    if (e.description !== row.description) fields.description = e.description;
    if (e.eventType !== row.event_type) fields.event_type = e.eventType;
    if ((e.diagnosis ?? null) !== (row.diagnosis ?? null)) fields.diagnosis = e.diagnosis ?? null;
    if ((e.doctor ?? null) !== (row.doctor ?? null)) fields.doctor = e.doctor ?? null;
    if ((e.facility ?? null) !== (row.facility ?? null)) fields.facility = e.facility ?? null;
    if (e.confidence !== row.confidence) fields.confidence = e.confidence;
    if (e.requiresVerification !== row.requires_verification) fields.requires_verification = e.requiresVerification;
    if ((e.reliabilityNotes ?? null) !== (row.reliability_notes ?? null)) fields.reliability_notes = e.reliabilityNotes ?? null;
    const pages = e.sourcePages && e.sourcePages.length > 0 ? JSON.stringify(e.sourcePages) : null;
    if (pages !== (row.source_pages ?? null)) fields.source_pages = pages;
    if (row.temporal_scope !== undefined && e.temporalScope !== (row.temporal_scope ?? 'corrente')) fields.temporal_scope = e.temporalScope;
    if (Object.keys(fields).length > 0) updates.push({ id: e.rowId, fields });
  }
  return { deleteIds, updates };
}

/** Righe grezze sopravvissute, con i campi che il piano riscrive già applicati:
 * l'assegnazione degli order_number cerca la riga per (documento, data, TIPO) e
 * un sopravvissuto cambiato di tipo (PS: ricovero → visita; prestazione:
 * spesa → terapia) altrimenti non veniva più trovato e restava col numero
 * vecchio (giro avversariale 2026-09-21). */
export function applyPlanToRows<T extends { id: string; event_type: string; title: string }>(
  rows: ReadonlyArray<T>,
  plan: ConsolidationPersistencePlan,
): T[] {
  const deleted = new Set(plan.deleteIds);
  const byId = new Map(plan.updates.map((u) => [u.id, u.fields]));
  return rows
    .filter((r) => !deleted.has(r.id))
    .map((r) => {
      const f = byId.get(r.id);
      if (!f) return r;
      return { ...r, ...(f.event_type !== undefined ? { event_type: f.event_type } : {}), ...(f.title !== undefined ? { title: f.title } : {}) };
    });
}
