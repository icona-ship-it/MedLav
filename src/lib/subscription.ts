import { createClient } from '@/lib/supabase/server';

export type FeatureGate = 'processing' | 'export' | 'rag_guidelines' | 'section_regenerate';

interface FeatureAccessResult {
  allowed: boolean;
  reason?: string;
}

/**
 * Check if a user has access to a gated feature based on their subscription.
 *
 * - Trial: processing (capped by cases limit elsewhere), HTML export only, no RAG/section regen
 * - Pro: everything allowed
 * - Canceled / past_due: deny all gated features (viewing existing data is still allowed)
 */
export async function checkFeatureAccess(
  userId: string,
  feature: FeatureGate,
): Promise<FeatureAccessResult> {
  const supabase = await createClient();

  const { data: profile } = await supabase
    .from('profiles')
    .select('subscription_status, subscription_plan')
    .eq('id', userId)
    .single();

  const status = (profile?.subscription_status as string | null) ?? 'trial';
  const plan = (profile?.subscription_plan as string | null) ?? 'trial';

  // Canceled or past_due: deny all gated features
  if (status === 'canceled' || status === 'past_due') {
    return {
      allowed: false,
      reason: 'Il tuo abbonamento non è attivo. Rinnova per utilizzare questa funzionalità.',
    };
  }

  // Pro / enterprise with active subscription: allow everything
  if ((plan === 'pro' || plan === 'enterprise') && (status === 'active' || status === 'trialing')) {
    return { allowed: true };
  }

  // Trial users: limited access
  const trialAllowed: Record<FeatureGate, boolean> = {
    processing: true,
    export: false,
    rag_guidelines: false,
    section_regenerate: false,
  };

  if (trialAllowed[feature]) {
    return { allowed: true };
  }

  return {
    allowed: false,
    reason: 'Funzionalità non disponibile nel piano attuale. Passa a Pro per sbloccarla.',
  };
}
