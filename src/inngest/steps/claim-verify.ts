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

export interface ClaimVerificationFinding {
  sectionId: string;
  sectionTitle: string;
  claim: string;
  verdict: 'non_supportato' | 'non_verificabile';
  motivo: string;
}

export interface ClaimVerificationSummary {
  checkedAt: string;
  model: string;
  sectionsChecked: number;
  supportedCount: number;
  unverifiableCount: number;
  unsupportedCount: number;
  findings: ClaimVerificationFinding[];
}

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

    // Sequenziale: poche sezioni (≤3), zero pressione sul rate limit.
    for (const section of targets) {
      try {
        const result = await verifySectionClaims({
          sectionId: section.canonicalId,
          sectionTitle: section.title,
          sectionContent: section.content,
          events: params.events,
        });
        usage = mergeUsage(usage, result.usage);
        for (const verdict of result.verdicts) {
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
      } catch (err) {
        // GDPR: solo id sezione, mai contenuto clinico nei log.
        logger.warn('claim-verify', `Sezione ${section.canonicalId} saltata: ${err instanceof Error ? err.message : 'unknown'}`);
      }
    }

    const summary: ClaimVerificationSummary = {
      checkedAt: new Date().toISOString(),
      model: MISTRAL_MODELS.MISTRAL_MEDIUM,
      sectionsChecked: targets.length,
      supportedCount,
      unverifiableCount: findings.filter((f) => f.verdict === 'non_verificabile').length,
      unsupportedCount: findings.filter((f) => f.verdict === 'non_supportato').length,
      findings: findings.slice(0, MAX_FINDINGS),
    };

    const metadata = (report.generation_metadata ?? {}) as Record<string, unknown>;
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
