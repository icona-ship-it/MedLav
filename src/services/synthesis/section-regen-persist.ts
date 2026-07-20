/**
 * Persistenza di una sezione rigenerata: chirurgia sui metadata (stato sezione
 * → 'auto', baseline originalSynthesis della sola sezione, refresh dello
 * snapshot, pruning dei claim stantii), insert della nuova versione e audit.
 *
 * Estratto dalla route /api/processing/regenerate-section (2026-07-20) per
 * essere condiviso col job Inngest `regenerate-section`: la logica è identica
 * nei due percorsi, il chiamante gestisce crediti/rimborsi e logging.
 */
import { parseSections, replaceSectionContent } from '@/lib/section-parser-client';
import { sha256Hex } from '@/lib/edit-metrics';
import { markSectionState, pruneClaimFindingsForSection } from '@/lib/section-state';
import type { ReportGenerationMetadata } from '@/db/schema/reports';

/** Sottoinsieme strutturale del client Supabase admin usato qui (testabile). */
interface AdminDb {
  from(table: string): {
    insert(values: Record<string, unknown>): PromiseLike<{ error: { message: string; code?: string } | null }>;
  };
}

export interface PersistRegeneratedSectionParams {
  admin: AdminDb;
  caseId: string;
  userId: string;
  /** Canonical section id (es. 'epicrisi'). */
  sectionId: string;
  instruction?: string;
  currentVersion: number | null;
  currentMetadata: ReportGenerationMetadata | null;
  updatedSynthesis: string;
  imageAnalysis?: ReportGenerationMetadata['imageAnalysis'];
  /** Chiavi extra per l'audit log (es. batchId del job asincrono). */
  auditExtra?: Record<string, unknown>;
}

export interface PersistRegeneratedSectionResult {
  version: number;
  wordCount: number;
}

export async function persistRegeneratedSection(
  params: PersistRegeneratedSectionParams,
): Promise<PersistRegeneratedSectionResult> {
  const {
    admin, caseId, userId, sectionId, instruction,
    currentVersion, currentMetadata, updatedSynthesis, imageAnalysis, auditExtra,
  } = params;

  // Nuova versione. Preserva l'intero generation_metadata (stato per-sezione,
  // promptVersion, HRS, …) e resetta SOLO la sezione rigenerata ad 'auto'.
  const newVersion = (currentVersion ?? 0) + 1;
  const baseMetadata = markSectionState(currentMetadata, sectionId, () => ({ status: 'auto' }))
    ?? currentMetadata ?? undefined;

  // Baseline del diff bozza→firmato: la sezione rigenerata è NUOVA bozza AI →
  // aggiorna originalSynthesis per quella sola sezione (le altre restano la
  // baseline della generazione precedente, gli edit del perito non vi entrano).
  let metadataWithBaseline = baseMetadata;
  const previousOriginal = (currentMetadata as { originalSynthesis?: string } | null)?.originalSynthesis;
  if (previousOriginal && metadataWithBaseline) {
    const regenerated = parseSections(updatedSynthesis).find((s) => s.canonicalId === sectionId);
    const originalTarget = parseSections(previousOriginal).find((s) => s.canonicalId === sectionId);
    if (regenerated && originalTarget) {
      const newOriginal = replaceSectionContent(previousOriginal, originalTarget.id, regenerated.content);
      const prevSnapshot = metadataWithBaseline.generationSnapshot;
      metadataWithBaseline = {
        ...metadataWithBaseline,
        originalSynthesis: newOriginal,
        // Il fascicolo di generazione deve attestare la baseline CORRENTE:
        // senza il refresh, reportSha256 resterebbe quello della versione
        // precedente e non combacerebbe con nulla.
        ...(prevSnapshot
          ? {
              generationSnapshot: {
                ...prevSnapshot,
                reportSha256: sha256Hex(newOriginal),
                generatedAt: new Date().toISOString(),
              },
            }
          : {}),
      };
    }
  }

  // I finding claim-level calcolati sulla bozza PRECEDENTE non valgono più per
  // la sezione rigenerata: rimuovili (gli altri restano).
  if (metadataWithBaseline) {
    metadataWithBaseline = pruneClaimFindingsForSection(metadataWithBaseline, sectionId) ?? metadataWithBaseline;
  }

  // Persisti l'imageAnalysis eventualmente ricalcolata (fallback report legacy)
  // così le rigenerazioni successive saltano Pixtral.
  const newMetadata = (imageAnalysis && imageAnalysis.length > 0)
    ? { ...(metadataWithBaseline ?? {}), imageAnalysis }
    : metadataWithBaseline;

  const { error: insertError } = await admin.from('reports').insert({
    case_id: caseId,
    version: newVersion,
    report_status: 'bozza',
    synthesis: updatedSynthesis,
    ...(newMetadata ? { generation_metadata: newMetadata } : {}),
  });
  if (insertError) {
    throw new Error(`Report INSERT failed: ${insertError.message}`);
  }

  await admin.from('audit_log').insert({
    user_id: userId,
    action: 'report.section_regenerated',
    entity_type: 'report',
    entity_id: caseId,
    metadata: {
      sectionId,
      instruction: instruction ?? null,
      version: newVersion,
      ...(auditExtra ?? {}),
    },
  });

  const wordCount = updatedSynthesis.split(/\s+/).filter((w) => w.length > 0).length;
  return { version: newVersion, wordCount };
}
