/**
 * Registro di diagnostica per-caso (post-incidente CASO-2026-235): il PERCHÉ
 * di rallentamenti, fallimenti e annullamenti deve stare in una query, non nei
 * log effimeri di Vercel. Vedi docs/RUNBOOK-DIAGNOSTICA.md.
 *
 * Regole:
 * - recordDiagnostic è BEST-EFFORT: non lancia MAI (una diagnostica che rompe
 *   la pipeline sarebbe peggio del male che cura) e degrada in silenzio se la
 *   tabella non esiste ancora (migration 0032 non applicata).
 * - MAI dati clinici nel detail (GDPR Art. 9): solo codici, contatori, range
 *   di pagine, id documento, messaggi tecnici troncati.
 */

import { createAdminClient } from '@/lib/supabase/admin';
import { logger } from '@/lib/logger';

export type DiagnosticStep = 'ocr' | 'extraction' | 'section' | 'monitor' | 'refund' | 'cancel';

export type DiagnosticCode =
  | 'rate_limited'
  | 'timeout'
  | 'truncated'
  | 'insert_failed'
  | 'pages_missing'
  | 'stream_stalled'
  | 'validator_blocked'
  | 'stuck_auto_fail'
  | 'cancelled_by_user'
  | 'stale_run_aborted'
  | 'refund_failed'
  | 'unknown';

/**
 * Classifica un messaggio d'errore tecnico in un codice diagnostico.
 * Stessi marcatori usati da isRetriableExtractionError — qui servono a
 * CONSERVARE la causa, non a decidere il retry. Puro e testabile.
 */
export function classifyPipelineError(message: string): DiagnosticCode {
  const lower = message.toLowerCase();
  if (/\b(429|rate.?limit|too many requests)\b/.test(lower)) return 'rate_limited';
  if (['timeout', 'etimedout', 'econnreset', 'econnrefused', 'epipe', 'socket hang up', 'enotfound', 'fetch failed', 'circuit'].some((t) => lower.includes(t)) || /\b(500|502|503|504)\b/.test(lower)) return 'timeout';
  if (lower.includes('truncation detected') || lower.includes('finishreason=length')) return 'truncated';
  if (/\binsert failed\b/.test(lower)) return 'insert_failed';
  if (lower.includes('pages not found')) return 'pages_missing';
  if (/\bstalled\b/.test(lower) || lower.includes('empty content')) return 'stream_stalled';
  if (lower.includes('report non valido') || lower.includes('validator')) return 'validator_blocked';
  return 'unknown';
}

/** Etichette leggibili per il pannello "Dettagli tecnici" e il runbook. */
export const DIAGNOSTIC_CODE_LABELS: Readonly<Record<DiagnosticCode, string>> = {
  rate_limited: 'Rallentata dai limiti del fornitore AI (attese imposte tra le richieste)',
  timeout: 'Interruzioni di rete o servizio momentaneamente non raggiungibile',
  truncated: 'Risposta del servizio AI interrotta a metà (blocco riprovato)',
  insert_failed: 'Salvataggio dei dati riprovato per un errore temporaneo',
  pages_missing: 'Pagine non ancora disponibili al momento della lettura (riprovato)',
  stream_stalled: 'Flusso di risposta del servizio AI fermo (blocco riprovato)',
  validator_blocked: 'Bozza bloccata dai controlli di qualità',
  stuck_auto_fail: 'Elaborazione interrotta automaticamente per inattività prolungata',
  cancelled_by_user: 'Analisi annullata dall\'utente',
  stale_run_aborted: 'Elaborazione obsoleta terminata automaticamente (il caso non era più in lavorazione)',
  refund_failed: 'Rimborso crediti non riuscito (da verificare)',
  unknown: 'Errore tecnico non classificato',
};

export interface DiagnosticEntry {
  caseId: string;
  step: DiagnosticStep;
  code: DiagnosticCode;
  /** Contesto NON clinico (pageRange, docId, stage, minutes, error troncato...). */
  detail?: Record<string, unknown>;
}

/** Tronca e ripulisce un messaggio tecnico per il campo detail.error. */
export function sanitizeErrorForDetail(message: string): string {
  return message.replace(/\s+/g, ' ').slice(0, 300);
}

/**
 * Registra (o incrementa) una riga di diagnostica. Best-effort: mai throw.
 * Una riga per (caso, step, codice): count++ e last_at avanzano, detail tiene
 * l'ultimo contesto.
 */
export async function recordDiagnostic(entry: DiagnosticEntry): Promise<void> {
  try {
    const supabase = createAdminClient();
    const { data: existing } = await supabase
      .from('pipeline_diagnostics')
      .select('id, count')
      .eq('case_id', entry.caseId)
      .eq('step', entry.step)
      .eq('code', entry.code)
      .maybeSingle();

    if (existing) {
      await supabase
        .from('pipeline_diagnostics')
        .update({
          count: ((existing.count as number) ?? 0) + 1,
          detail: entry.detail ?? null,
          last_at: new Date().toISOString(),
        })
        .eq('id', existing.id);
    } else {
      await supabase.from('pipeline_diagnostics').insert({
        case_id: entry.caseId,
        step: entry.step,
        code: entry.code,
        detail: entry.detail ?? null,
      });
    }
  } catch (err) {
    // Mai propagare: la diagnostica non deve mai rompere la pipeline (e prima
    // dell'applicazione della migration 0032 la tabella può non esistere).
    logger.warn('diagnostics', `recordDiagnostic fallito (ignorato): ${err instanceof Error ? err.message : 'unknown'}`);
  }
}
