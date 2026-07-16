import { createClient } from '@/lib/supabase/server';

export type FeatureGate = 'processing' | 'export' | 'rag_guidelines' | 'section_regenerate' | 'document_organizer';

interface FeatureAccessResult {
  allowed: boolean;
  reason?: string;
}

/**
 * Check if a user has access to a gated feature based on their subscription.
 *
 * - Trial: TUTTO consentito — il gating economico è a CREDITI, non a piano
 *   (audit 2026-07-17: il vecchio commento "HTML export only, no RAG/regen"
 *   descriveva un modello mai implementato; qualcuno che "allineasse" il
 *   codice al commento romperebbe l'export dei beta tester a saldo zero).
 * - Pro: everything allowed
 * - Canceled / past_due: deny all gated features (viewing existing data is still allowed)
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function checkFeatureAccess(userId: string, feature: FeatureGate): Promise<FeatureAccessResult> {
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

  // Trial users: all features allowed — gated by credits instead of subscription
  // Credits are the gate: if user has credits, they can use any feature
  return { allowed: true };
}
