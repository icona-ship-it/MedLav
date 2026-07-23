import { createAdminClient } from '@/lib/supabase/admin';
import { logger } from '@/lib/logger';

/**
 * Heartbeat anti-falso-positivo per lo stuck-case-monitor (2026-07-17): le fasi
 * lunghe di un caso ENORME (OCR di 100+ documenti, batch di estrazione, riassunti
 * map-reduce) possono superare i 60 minuti senza alcuna scrittura sulla riga del
 * caso → il monitor lo marcherebbe 'errore' (ora con rimborso e email (stuck-case-monitor)) mentre è VIVO e sta
 * lavorando. Tocca SOLO updated_at: nessun read-modify-write sui metadata, quindi
 * race-free anche dagli step paralleli. Best-effort: un heartbeat fallito non deve
 * mai fermare la pipeline.
 */
export async function heartbeatCase(caseId: string): Promise<void> {
  try {
    await createAdminClient()
      .from('cases')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', caseId);
  } catch (err) {
    logger.warn('pipeline', `Heartbeat fallito per caso ${caseId}: ${err instanceof Error ? err.message : 'unknown'}`);
  }
}
