import type { ClaimVerificationFinding } from './claim-verify';

/**
 * REVISIONE AUTOMATICA (richiesta founder 2026-07-17): l'ultimo passo del flusso
 * non si limita a SEGNALARE gli errori fattuali del report — prova a correggerli.
 *
 * Come: per ogni sezione con errori "non_supportato", UNA rigenerazione mirata
 * con l'elenco esatto degli errori del verificatore come istruzione di revisione;
 * poi il verificatore RIGIRA da capo e al perito arriva solo ciò che sopravvive.
 *
 * Perché ora e non prima: il ciclo è sicuro solo con un giudice affidabile —
 * da stanotte il judge ha l'evidenza completa (eventi + riassunti/OCR) e il
 * filtro anti-fabbricazione (isClaimGroundedInSection). Guardrail:
 * - UN SOLO giro di revisione (mai loop);
 * - massimo AUTO_REPAIR_MAX_SECTIONS sezioni per run;
 * - documentazione_sanitaria ESCLUSA (percorso verbatim/varianti dedicate);
 * - trasparenza totale: il log delle correzioni resta nei metadata e in UI;
 * - l'attestazione del perito prima dell'export resta invariata.
 */

export const AUTO_REPAIR_MAX_SECTIONS = 4;

/** Sezioni mai auto-riparate: doc-sanitaria ha il suo percorso (verbatim/varianti). */
const NEVER_REPAIR = new Set(['documentazione_sanitaria']);

export interface RepairTarget {
  sectionId: string;
  sectionTitle: string;
  findings: ClaimVerificationFinding[];
}

/**
 * Raggruppa i findings "non_supportato" per sezione e sceglie i bersagli della
 * revisione (prima le sezioni con più errori). Pura e testabile.
 */
export function selectRepairableSections(
  findings: ClaimVerificationFinding[] | undefined,
): RepairTarget[] {
  if (!findings || findings.length === 0) return [];
  const bySection = new Map<string, RepairTarget>();
  for (const f of findings) {
    if (f.verdict !== 'non_supportato') continue;
    if (NEVER_REPAIR.has(f.sectionId)) continue;
    const entry = bySection.get(f.sectionId) ?? { sectionId: f.sectionId, sectionTitle: f.sectionTitle, findings: [] };
    entry.findings.push(f);
    bySection.set(f.sectionId, entry);
  }
  return [...bySection.values()]
    .sort((a, b) => b.findings.length - a.findings.length)
    .slice(0, AUTO_REPAIR_MAX_SECTIONS);
}

/**
 * Istruzione di revisione per la rigenerazione mirata di UNA sezione: l'elenco
 * esatto degli errori (claim → motivo del verificatore). Pura.
 */
export function buildRepairInstruction(target: RepairTarget): string {
  const rows = target.findings.slice(0, 6).map((f, i) =>
    `${i + 1}) «${(f.claim ?? '').slice(0, 160)}» → ${(f.motivo ?? 'non attestato nei documenti').slice(0, 160)}`,
  );
  return [
    'REVISIONE FINALE — una verifica indipendente contro i documenti segnala questi dati ERRATI nel testo precedente di questa sezione:',
    ...rows,
    'Riscrivi la sezione correggendo SOLO questi punti, usando ESCLUSIVAMENTE i fatti forniti (se il dato corretto non è disponibile, RIMUOVI l\'affermazione). Tutto il resto della sezione deve restare invariato nella sostanza.',
  ].join('\n').slice(0, 1800);
}
