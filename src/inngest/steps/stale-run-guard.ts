/**
 * GUARDIA ANTI-ZOMBIE (post-incidente CASO-2026-235, 2026-07-24): un run
 * Inngest annullato PRIMA che esistesse il kill-event è sopravvissuto 2,5
 * giorni macinando estrazione a spese nostre — invisibile allo stuck-monitor
 * (i suoi stessi write tenevano updated_at fresco, quindi sembrava "attivo").
 *
 * Difesa in profondità: ogni step lungo della pipeline chiama abortIfStaleRun
 * al proprio inizio — se il caso non è più in lavorazione (annullato, in
 * errore, completato o eliminato), il run SI UCCIDE DA SOLO con un
 * NonRetriableError, anche se l'evento di cancellazione non è mai arrivato.
 *
 * I catch di degradazione ("una sezione fallita non abortisce il resto")
 * devono RILANCIARE questo errore, riconoscendolo con isStaleRunAbort —
 * altrimenti un run zombie degraderebbe con eleganza fino a finalize.
 */

import { NonRetriableError } from 'inngest';
import { createAdminClient } from '@/lib/supabase/admin';
import { recordDiagnostic, type DiagnosticStep } from '@/lib/pipeline-diagnostics';
import { logger } from '@/lib/logger';

export const STALE_RUN_MESSAGE = 'Run obsoleto terminato: il caso non è più in lavorazione';

/** Stage in cui NESSUNO step di pipeline deve più lavorare. */
const ABORT_STAGES = new Set(['idle', 'errore', 'completato']);

/**
 * Decide se il run va terminato. Fail-open: uno stage sconosciuto (o null) con
 * la riga presente NON abortisce — mai uccidere un run sano per un valore
 * inatteso; la riga MANCANTE invece abortisce sempre (caso eliminato, Art.17).
 */
export function shouldAbortStaleRun(stage: string | null | undefined, rowExists: boolean): boolean {
  if (!rowExists) return true;
  return stage != null && ABORT_STAGES.has(stage);
}

/** Riconosce l'errore del guard nei catch di degradazione (che devono rilanciarlo). */
export function isStaleRunAbort(error: unknown): boolean {
  return error instanceof Error && error.message.includes(STALE_RUN_MESSAGE);
}

/**
 * Da chiamare all'INIZIO di ogni step lungo (estrazione, consolidamento,
 * sezioni). Una lettura DB; se il caso non è più in lavorazione registra la
 * diagnostica e termina il run senza retry. Un errore di LETTURA non uccide
 * mai il run (fail-open).
 */
export async function abortIfStaleRun(caseId: string, phase: DiagnosticStep): Promise<void> {
  let stage: string | null = null;
  let rowExists = true;
  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from('cases')
      .select('processing_stage')
      .eq('id', caseId)
      .maybeSingle();
    if (error) return;
    rowExists = data != null;
    stage = (data?.processing_stage as string | null) ?? null;
  } catch {
    return;
  }
  if (!shouldAbortStaleRun(stage, rowExists)) return;

  logger.warn('pipeline', `Run obsoleto rilevato per caso ${caseId} (stage=${stage ?? 'riga_mancante'}) — terminato al confine di step`);
  await recordDiagnostic({
    caseId,
    step: phase,
    code: 'stale_run_aborted',
    detail: { stage: stage ?? 'row_missing' },
  });
  throw new NonRetriableError(`${STALE_RUN_MESSAGE} (stage=${stage ?? 'row_missing'})`);
}
