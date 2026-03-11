import { createAdminClient } from '@/lib/supabase/admin';
import { logger } from '@/lib/logger';

interface LogAccessParams {
  userId: string | null;
  action: string;
  entityType: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Fire-and-forget audit log for data reads/access.
 * Uses admin client to bypass RLS — caller is responsible for passing correct userId.
 * NEVER include patient names or clinical data in metadata — only IDs and codes.
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
