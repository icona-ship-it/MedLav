import { createAdminClient } from '@/lib/supabase/admin';
import { logger } from '@/lib/logger';

interface LogAccessParams {
  userId: string | null;
  action: string;
  entityType: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
}

interface LogAccessArchivedParams {
  /** userId obbligatorio — l'archivio richiede il riferimento per audit forense */
  userId: string;
  /** Action critica (es. 'user.deleted', 'user.data_exported', 'report.deposited') */
  action: string;
  entityType?: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
  ipAddress?: string;
}

/**
 * Fire-and-forget audit log for data reads/access.
 * Uses admin client to bypass RLS — caller is responsible for passing correct userId.
 * NEVER include patient names or clinical data in metadata — only IDs and codes.
 *
 * NB: il record SOPRAVVIVE alla cancellazione utente con user_id = NULL (FK ON DELETE SET NULL).
 * Per azioni che richiedono mantenimento del riferimento user_id POST-cancellazione (forensica),
 * usare `logAccessArchived`.
 */
export function logAccess({ userId, action, entityType, entityId, metadata }: LogAccessParams): void {
  const admin = createAdminClient();

  Promise.resolve(
    admin
      .from('audit_log')
      .insert({
        user_id: userId,
        action,
        entity_type: entityType,
        entity_id: entityId ?? null,
        metadata: metadata ?? null,
      }),
  )
    .then(({ error }) => {
      if (error) {
        // Log error without sensitive data — only action and entity type
        logger.error('audit', 'Failed to log access', { action, entityType, error: error.message });
      }
    })
    .catch((err: unknown) => {
      const message = err instanceof Error ? err.message : 'unknown error';
      logger.error('audit', 'Unexpected error', { action, error: message });
    });
}

/**
 * Forensic-grade audit log che SOPRAVVIVE alla cancellazione dell'utente.
 *
 * Usare SOLO per azioni con valore legale-probatorio durature:
 *  - `user.deleted` — cancellazione account (per dimostrare quando avvenuta)
 *  - `user.data_exported` — export GDPR Art. 20 (chi ha scaricato cosa)
 *  - `report.deposited` — eventuale futuro "deposito ufficiale" in tribunale
 *
 * NON usare per accessi quotidiani — quelli vanno in `logAccess` standard.
 *
 * Schema: vedi `audit_archive` in `src/db/schema/audit.ts`. Solo INSERT da
 * service_role; nessuno puo' DELETE per design (compliance Art. 6(1)(c) GDPR).
 */
export function logAccessArchived(params: LogAccessArchivedParams): void {
  const admin = createAdminClient();

  Promise.resolve(
    admin
      .from('audit_archive')
      .insert({
        user_id: params.userId,
        action: params.action,
        entity_type: params.entityType ?? null,
        entity_id: params.entityId ?? null,
        metadata: params.metadata ?? null,
        ip_address: params.ipAddress ?? null,
      }),
  )
    .then(({ error }) => {
      if (error) {
        // Forensic log failure e' grave — logga a livello error con tag specifico
        logger.error('audit-archive', 'CRITICAL: Failed to write forensic audit', {
          action: params.action,
          userId: params.userId,
          error: error.message,
        });
      }
    })
    .catch((err: unknown) => {
      const message = err instanceof Error ? err.message : 'unknown error';
      logger.error('audit-archive', 'CRITICAL: Unexpected error in forensic audit', {
        action: params.action,
        error: message,
      });
    });
}
