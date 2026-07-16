import { inngest } from '@/lib/inngest/client';
import { createAdminClient } from '@/lib/supabase/admin';
import { logger } from '@/lib/logger';
import * as Sentry from '@sentry/nextjs';

/**
 * Scheduled Inngest function: rileva i casi POSSIBILMENTE BLOCCATI e li segnala
 * a Sentry, così l'admin lo scopre subito invece che da un perito frustrato.
 *
 * Scenario chiuso: un run Inngest che muore (o non viene mai consegnato) lascia
 * il caso in uno stage attivo per sempre, senza email né allarme. Prima l'unico
 * modo di accorgersene era aprire la pagina admin.
 *
 * Euristica: stage attivo + nessun aggiornamento da > STUCK_AFTER_MS. La pipeline
 * scrive progressi (processingProgress/generationProgress) a ogni fase, quindi
 * un caso che avanza bumpa `updated_at`; uno fermo no. Soglia conservativa per
 * limitare i falsi positivi su fasi lente (tunabile).
 *
 * Anti-spam: `perizia_metadata.stuckAlertedAt` marca l'avvenuta segnalazione;
 * un caso già segnalato non riallarma finché non riparte (updated_at avanza).
 * GDPR: nel messaggio solo il codice caso / id, mai contenuto clinico.
 */
const ACTIVE_STAGES = ['elaborazione', 'generazione_report', 'revisione_classificazione'];
const STUCK_AFTER_MS = 30 * 60 * 1000;
// AUDIT 2026-07-16: oltre questa soglia il caso è quasi certamente morto (run
// Inngest perso). Lo marchiamo 'errore' così il perito vede lo stato d'errore
// con la via d'uscita ("Rielabora") invece di una barra ferma per sempre.
const AUTO_FAIL_AFTER_MS = 60 * 60 * 1000;

interface StuckCaseRow {
  id: string;
  code: string | null;
  processing_stage: string;
  updated_at: string;
  perizia_metadata: Record<string, unknown> | null;
}

export const stuckCaseMonitor = inngest.createFunction(
  { id: 'monitoring/stuck-cases', retries: 1 },
  { cron: '*/15 * * * *' },
  async ({ step }) => {
    const flagged = await step.run('scan-and-alert', async () => {
      const supabase = createAdminClient();
      const cutoff = new Date(Date.now() - STUCK_AFTER_MS).toISOString();

      const { data, error } = await supabase
        .from('cases')
        .select('id, code, processing_stage, updated_at, perizia_metadata')
        .in('processing_stage', ACTIVE_STAGES)
        .lt('updated_at', cutoff);

      if (error) {
        logger.error('stuck-monitor', `Query casi bloccati fallita: ${error.message}`);
        return 0;
      }

      let count = 0;
      for (const row of (data ?? []) as StuckCaseRow[]) {
        const meta = (row.perizia_metadata ?? {}) as Record<string, unknown>;
        const alertedAt = typeof meta.stuckAlertedAt === 'string' ? meta.stuckAlertedAt : null;
        // Già segnalato per QUESTO stallo (nessun avanzamento dall'alert)? Salta.
        // Confronto NUMERICO: updated_at (Postgres, offset +00:00) e stuckAlertedAt
        // (toISOString, 'Z') hanno formati ISO diversi → il confronto tra stringhe
        // sarebbe inaffidabile. Parse a epoch.
        if (alertedAt) {
          const alertedMs = new Date(alertedAt).getTime();
          const updatedMs = new Date(row.updated_at).getTime();
          if (!Number.isNaN(alertedMs) && !Number.isNaN(updatedMs) && alertedMs >= updatedMs) continue;
        }

        const stuckMs = Date.now() - new Date(row.updated_at).getTime();

        Sentry.captureMessage(
          `Caso possibilmente bloccato: ${row.code ?? row.id} fermo in '${row.processing_stage}' da oltre 30 min (ultimo aggiornamento ${row.updated_at})`,
          'error',
        );

        // Oltre 60 min: auto-errore → il perito ha una via d'uscita in UI.
        if (stuckMs > AUTO_FAIL_AFTER_MS) {
          await supabase
            .from('cases')
            .update({
              processing_stage: 'errore',
              perizia_metadata: {
                ...meta,
                stuckAlertedAt: new Date().toISOString(),
                lastError: 'L\'elaborazione si è interrotta per un problema tecnico. Puoi riavviarla dalla pagina del caso.',
              },
            })
            .eq('id', row.id)
            .in('processing_stage', ACTIVE_STAGES);
          // Marca i documenti ancora "in lavorazione" come errore così l'UI è coerente.
          await supabase
            .from('documents')
            .update({ processing_status: 'errore', processing_error: 'Elaborazione interrotta (timeout)' })
            .eq('case_id', row.id)
            .in('processing_status', ['in_coda', 'ocr_in_corso', 'estrazione_in_corso', 'validazione_in_corso']);
          logger.warn('stuck-monitor', `Caso ${row.code ?? row.id} auto-marcato 'errore' dopo ${Math.round(stuckMs / 60000)} min`);
          count += 1;
          continue;
        }

        // NB: NON tocchiamo updated_at (resta l'istante reale dell'ultimo
        // progresso) — bumparlo maschererebbe lo stallo alla prossima scansione.
        const { error: markErr } = await supabase
          .from('cases')
          .update({ perizia_metadata: { ...meta, stuckAlertedAt: new Date().toISOString() } })
          .eq('id', row.id);
        if (markErr) logger.warn('stuck-monitor', `Marca stuckAlertedAt fallita per un caso: ${markErr.message}`);
        count += 1;
      }

      if (count > 0) logger.warn('stuck-monitor', `${count} casi possibilmente bloccati segnalati a Sentry`);
      return count;
    });

    return { flagged };
  },
);
