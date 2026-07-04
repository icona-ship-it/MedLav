/**
 * Attestazione di revisione — parte SERVER (hash del contenuto attestato).
 *
 * L'attestazione lega la spunta del perito allo sha256 del synthesis al
 * momento dell'approvazione: una modifica successiva la invalida (il gate
 * export depositabile chiede di riapprovare). Vedi lib/attestation-shared.ts
 * per il razionale e la lista sezioni ad alto rischio.
 */

import { sha256Hex } from '@/lib/edit-metrics';
import {
  getRequiredAttestationSections,
} from '@/lib/attestation-shared';

export interface ReportAttestation {
  attestedAt: string;
  /** userId del perito che ha attestato (mai nome in chiaro nei metadati). */
  attestedBy: string;
  /** sha256 del synthesis al momento dell'attestazione. */
  synthesisSha256: string;
  confirmedSectionIds: string[];
}

export type BuildAttestationResult =
  | { attestation: ReportAttestation }
  | { error: string };

/**
 * Costruisce l'attestazione verificando SERVER-SIDE che tutte le sezioni ad
 * alto rischio presenti nel report siano state spuntate (il client non è
 * fonte di verità sull'elenco).
 */
export function buildReportAttestation(params: {
  userId: string;
  synthesis: string;
  confirmedSectionIds: string[];
}): BuildAttestationResult {
  const required = getRequiredAttestationSections(params.synthesis);
  const confirmed = new Set(params.confirmedSectionIds);
  const missing = required.filter((s) => !confirmed.has(s.canonicalId));
  if (missing.length > 0) {
    return {
      error: `Sezioni da confermare prima dell'approvazione: ${missing.map((s) => s.title).join(', ')}`,
    };
  }
  return {
    attestation: {
      attestedAt: new Date().toISOString(),
      attestedBy: params.userId,
      synthesisSha256: sha256Hex(params.synthesis),
      confirmedSectionIds: required.map((s) => s.canonicalId),
    },
  };
}

/**
 * Un'attestazione è valida solo se il synthesis corrente ha lo stesso hash
 * di quello attestato (una modifica post-approvazione la invalida).
 */
export function isAttestationValid(
  attestation: unknown,
  synthesis: string | null | undefined,
): boolean {
  if (!attestation || typeof attestation !== 'object' || !synthesis) return false;
  const a = attestation as Partial<ReportAttestation>;
  if (typeof a.synthesisSha256 !== 'string' || a.synthesisSha256.length === 0) return false;
  return a.synthesisSha256 === sha256Hex(synthesis);
}

interface ExportableReportRow {
  report_status?: unknown;
  synthesis?: unknown;
  generation_metadata?: unknown;
}

export type DepositableAttestationCheck = { ok: true } | { ok: false; message: string };

/**
 * Gate dell'export DEPOSITABILE: un report DEFINITIVO di nuova generazione
 * (ha generationSnapshot) deve avere un'attestazione valida — se è stato
 * modificato dopo l'approvazione va riapprovato. Le bozze restano esportabili
 * (portano il watermark BOZZA); i report legacy (pre-snapshot) non sono toccati.
 */
export function checkDepositableAttestation(
  report: ExportableReportRow | null | undefined,
  exportMode: 'lavoro' | 'depositabile',
): DepositableAttestationCheck {
  if (exportMode !== 'depositabile' || !report) return { ok: true };
  const metadata = (report.generation_metadata ?? null) as
    | { generationSnapshot?: unknown; attestation?: unknown }
    | null;
  if (!metadata?.generationSnapshot) return { ok: true }; // legacy: nessun gate retroattivo
  if (report.report_status !== 'definitivo') return { ok: true }; // bozza: export col watermark
  if (isAttestationValid(metadata.attestation, report.synthesis as string | null)) return { ok: true };
  return {
    ok: false,
    message:
      'Il report è stato modificato dopo l\'approvazione: l\'attestazione non è più valida. ' +
      'Riapprova il report (pulsante "Approva") prima dell\'export depositabile.',
  };
}
