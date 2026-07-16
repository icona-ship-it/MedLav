/**
 * Step pipeline: verifica claim-level del report appena salvato (anti-misgrounded).
 *
 * Gira DOPO assemble-and-save-report e PRIMA di finalize. NON blocca mai la
 * pipeline (un fallimento del verifier non deve costare il report): ogni
 * errore degrada a log + zero risultati. Stato O(1): il testo resta nel DB,
 * lo step ritorna solo conteggi.
 */

import { createAdminClient } from '@/lib/supabase/admin';
import { parseSections } from '@/lib/section-parser-client';
import {
  verifySectionClaims,
  CLAIM_VERIFY_SECTION_IDS,
  type ClaimEventDigest,
  type ClaimVerdict,
} from '@/services/validation/claim-verifier';
import { MISTRAL_MODELS } from '@/lib/mistral/client';
import { createEmptyUsage, mergeUsage, type TokenUsage } from '@/services/cost-tracking/cost-calculator';
import { logger } from '@/lib/logger';

/** Cap sulla lista mostrata al perito (attenzione finita: i primi sono i più utili). */
const MAX_FINDINGS = 40;

// UNICA fonte di verità dei tipi: lo schema (writer qui, reader in UI —
// due copie strutturali divergerebbero in silenzio; review 2026-07-04).
export type ClaimVerificationSummary = NonNullable<
  import('@/db/schema/reports').ReportGenerationMetadata['claimVerification']
>;
export type ClaimVerificationFinding = ClaimVerificationSummary['findings'][number];

export interface ClaimVerifyStepResult {
  sectionsChecked: number;
  unsupportedCount: number;
  unverifiableCount: number;
  usage: TokenUsage;
}

export async function runClaimVerification(params: {
  caseId: string;
  /** Può mancare su output memoizzati pre-feature: la verifica si salta. */
  reportId: string | null | undefined;
  events: ClaimEventDigest[];
  /** Riassunti-documento come evidenza aggiuntiva del judge (audit 2026-07-16):
   * i fatti narrati dai riassunti non devono uscire "non supportato". */
  documentSummariesDigest?: string;
}): Promise<ClaimVerifyStepResult> {
  const zero: ClaimVerifyStepResult = {
    sectionsChecked: 0,
    unsupportedCount: 0,
    unverifiableCount: 0,
    usage: createEmptyUsage(),
  };
  if (!params.reportId) return zero;

  try {
    const supabase = createAdminClient();
    const { data: report } = await supabase
      .from('reports')
      .select('synthesis, generation_metadata')
      .eq('id', params.reportId)
      .eq('case_id', params.caseId)
      .single();

    if (!report?.synthesis) return zero;

    const targets = parseSections(report.synthesis)
      .filter((s) => CLAIM_VERIFY_SECTION_IDS.includes(s.canonicalId));
    if (targets.length === 0) return zero;

    let usage = createEmptyUsage();
    let supportedCount = 0;
    const findings: ClaimVerificationFinding[] = [];

    // In parallelo: ≤4 sezioni, mistral-medium ha ampio headroom RPS e il
    // wall-time scende a ~1/3 (review 2026-07-04). Errore per-sezione → skip.
    const settled = await Promise.allSettled(
      targets.map((section) =>
        verifySectionClaims({
          sectionId: section.canonicalId,
          sectionTitle: section.title,
          sectionContent: section.content,
          events: params.events,
          extraEvidence: params.documentSummariesDigest,
        }),
      ),
    );
    settled.forEach((outcome, idx) => {
      const section = targets[idx];
      if (outcome.status === 'rejected') {
        // GDPR: solo id sezione, mai contenuto clinico nei log.
        const message = outcome.reason instanceof Error ? outcome.reason.message : 'unknown';
        logger.warn('claim-verify', `Sezione ${section.canonicalId} saltata: ${message}`);
        return;
      }
      usage = mergeUsage(usage, outcome.value.usage);
      for (const verdict of outcome.value.verdicts) {
        if (verdict.verdict === 'supportato') {
          supportedCount += 1;
          continue;
        }
        findings.push({
          sectionId: section.canonicalId,
          sectionTitle: section.title,
          claim: verdict.claim,
          verdict: verdict.verdict,
          motivo: verdict.motivo,
        });
      }
    });

    const summary: ClaimVerificationSummary = {
      checkedAt: new Date().toISOString(),
      model: MISTRAL_MODELS.MISTRAL_MEDIUM,
      sectionsChecked: targets.length,
      supportedCount,
      unverifiableCount: findings.filter((f) => f.verdict === 'non_verificabile').length,
      unsupportedCount: findings.filter((f) => f.verdict === 'non_supportato').length,
      findings: findings.slice(0, MAX_FINDINGS),
    };

    // RI-LEGGI i metadata SUBITO prima dell'update: il loop judge dura decine
    // di secondi e nel frattempo il perito può aver scritto sections/attestation
    // (review 2026-07-04: lo spread della copia stantia li cancellava). Resta
    // una finestra di pochi ms — accettabile senza RPC di merge (migration bloccata).
    const { data: freshReport } = await supabase
      .from('reports')
      .select('generation_metadata')
      .eq('id', params.reportId)
      .eq('case_id', params.caseId)
      .single();
    const metadata = (freshReport?.generation_metadata ?? report.generation_metadata ?? {}) as Record<string, unknown>;
    const { error } = await supabase
      .from('reports')
      .update({
        generation_metadata: { ...metadata, claimVerification: summary },
        updated_at: new Date().toISOString(),
      })
      .eq('id', params.reportId)
      .eq('case_id', params.caseId);
    if (error) {
      logger.warn('claim-verify', `Salvataggio risultati fallito: ${error.message}`);
    }

    logger.info('claim-verify', 'Verifica claim completata', {
      caseId: params.caseId,
      sections: summary.sectionsChecked,
      supported: summary.supportedCount,
      unsupported: summary.unsupportedCount,
      unverifiable: summary.unverifiableCount,
    });

    return {
      sectionsChecked: summary.sectionsChecked,
      unsupportedCount: summary.unsupportedCount,
      unverifiableCount: summary.unverifiableCount,
      usage,
    };
  } catch (err) {
    logger.warn('claim-verify', `Verifica claim saltata: ${err instanceof Error ? err.message : 'unknown'}`);
    return zero;
  }
}

/** Digest eventi per il judge, dai ConsolidatedEvent della pipeline. */
/** Digest compatto dei riassunti-documento per l'evidenza del judge. */
export function toDocumentSummariesDigest(
  summaries?: Array<{ fileName: string; documentType: string; summary: string }>,
): string | undefined {
  if (!summaries || summaries.length === 0) return undefined;
  return summaries.map((s) => `### ${s.fileName} (${s.documentType})\n${s.summary}`).join('\n\n');
}

export function toClaimEventDigest(events: Array<{
  orderNumber: number;
  eventDate?: string | null;
  title: string;
  description: string;
  sourceText?: string | null;
}>): ClaimEventDigest[] {
  return events.map((e) => ({
    orderNumber: e.orderNumber,
    eventDate: e.eventDate ?? null,
    title: e.title,
    description: e.description,
    sourceText: e.sourceText ?? null,
  }));
}

export type { ClaimEventDigest, ClaimVerdict };
