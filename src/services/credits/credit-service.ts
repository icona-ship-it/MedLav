/**
 * Credit management service.
 *
 * Uses admin client (service_role) for all DB operations since RLS
 * only allows service_role to write credits.
 *
 * Deduction order: monthly remaining first, then purchased balance.
 */

import { createAdminClient } from '@/lib/supabase/admin';
import { logger } from '@/lib/logger';
import type { CreditOperation } from './credit-costs';

const TAG = 'credit-service';

export interface CreditBalance {
  /** Purchased credits (never expire) */
  purchased: number;
  /** Monthly credits remaining this cycle */
  monthlyRemaining: number;
  /** Total available (monthly remaining + purchased) */
  total: number;
  /** Monthly allowance for reference */
  monthlyAllowance: number;
  /** When monthly credits reset */
  monthlyResetAt: string | null;
}

interface DeductResult {
  success: boolean;
  error?: string;
  balanceAfter?: number;
}

/**
 * Get or create credit record for a user.
 * Returns the raw DB row.
 */
async function getOrCreateCreditsRow(userId: string) {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from('user_credits')
    .select('*')
    .eq('user_id', userId)
    .single();

  if (data) return data;

  // Auto-create for users that don't have a row yet (e.g., pre-migration users)
  if (error?.code === 'PGRST116') {
    const { data: newRow, error: insertErr } = await supabase
      .from('user_credits')
      .insert({ user_id: userId, balance: 0, monthly_allowance: 0, monthly_used: 0 })
      .select()
      .single();

    if (insertErr) {
      logger.error(TAG, 'Failed to create credit row', { userId, error: insertErr.message });
      return null;
    }
    return newRow;
  }

  logger.error(TAG, 'Failed to fetch credits', { userId, error: error?.message });
  return null;
}

/**
 * Check if monthly credits need a reset (new billing cycle).
 * If monthlyResetAt is in the past, reset monthly_used to 0 and
 * advance monthlyResetAt by 1 month.
 */
async function maybeResetMonthly(userId: string, row: Record<string, unknown>): Promise<Record<string, unknown>> {
  const resetAt = row.monthly_reset_at as string | null;
  if (!resetAt) return row;

  const resetDate = new Date(resetAt);
  if (resetDate > new Date()) return row; // not yet

  const supabase = createAdminClient();
  const nextReset = new Date(resetDate);
  nextReset.setMonth(nextReset.getMonth() + 1);

  const { data, error } = await supabase
    .from('user_credits')
    .update({
      monthly_used: 0,
      monthly_reset_at: nextReset.toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId)
    .select()
    .single();

  if (error) {
    logger.error(TAG, 'Failed to reset monthly credits', { userId, error: error.message });
    return row;
  }

  logger.info(TAG, 'Monthly credits reset', { userId, nextReset: nextReset.toISOString() });
  return data;
}

/**
 * Get the current credit balance for a user.
 */
export async function getBalance(userId: string): Promise<CreditBalance> {
  const row = await getOrCreateCreditsRow(userId);
  if (!row) {
    return { purchased: 0, monthlyRemaining: 0, total: 0, monthlyAllowance: 0, monthlyResetAt: null };
  }

  const current = await maybeResetMonthly(userId, row);
  const allowance = current.monthly_allowance as number;
  const used = current.monthly_used as number;
  const purchased = current.balance as number;
  const monthlyRemaining = Math.max(0, allowance - used);

  return {
    purchased,
    monthlyRemaining,
    total: monthlyRemaining + purchased,
    monthlyAllowance: allowance,
    monthlyResetAt: current.monthly_reset_at as string | null,
  };
}

/**
 * Deduct credits for an operation.
 * Order: monthly credits first, then purchased balance.
 * Atomic: uses a single update to prevent race conditions.
 *
 * @returns DeductResult with success and remaining balance
 */
export async function deductCredits(
  userId: string,
  amount: number,
  operation: CreditOperation | string,
  entityId?: string,
  metadata?: Record<string, unknown>,
  _retryCount = 0,
): Promise<DeductResult> {
  if (amount <= 0) return { success: true, balanceAfter: 0 };
  if (_retryCount > 2) {
    logger.error(TAG, 'Credit deduction failed after max retries', { userId, amount });
    return { success: false, error: 'Errore nella deduzione crediti. Riprova.' };
  }

  const balance = await getBalance(userId);
  if (balance.total < amount) {
    return {
      success: false,
      error: `Crediti insufficienti: servono ${amount}, hai ${balance.total}`,
    };
  }

  // Calculate how much to take from monthly vs purchased
  const fromMonthly = Math.min(balance.monthlyRemaining, amount);
  const fromPurchased = amount - fromMonthly;

  const supabase = createAdminClient();

  // Atomic update — deduct from both pools
  const row = await getOrCreateCreditsRow(userId);
  if (!row) return { success: false, error: 'Errore nel recupero crediti' };

  const newMonthlyUsed = (row.monthly_used as number) + fromMonthly;
  const newBalance = (row.balance as number) - fromPurchased;

  // Verify no race condition (balance can't go negative)
  if (newBalance < 0) {
    return { success: false, error: 'Crediti insufficienti (conflitto concorrente)' };
  }

  const { data: updated, error: updateErr } = await supabase
    .from('user_credits')
    .update({
      monthly_used: newMonthlyUsed,
      balance: newBalance,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId)
    .eq('balance', row.balance as number) // optimistic lock
    .eq('monthly_used', row.monthly_used as number)
    .select('id');

  if (updateErr) {
    logger.error(TAG, 'Credit deduction failed', { userId, amount, error: updateErr.message });
    return { success: false, error: 'Errore nella deduzione crediti' };
  }

  // Optimistic lock: if 0 rows updated, another request modified credits concurrently
  if (!updated || updated.length === 0) {
    logger.warn(TAG, 'Credit deduction race condition detected, retrying', { userId, amount, retry: _retryCount + 1 });
    return deductCredits(userId, amount, operation, entityId, metadata, _retryCount + 1);
  }

  const totalAfter = Math.max(0, (row.monthly_allowance as number) - newMonthlyUsed) + newBalance;

  // Record transaction
  await recordTransaction(userId, -amount, totalAfter, 'consumption', operation, entityId, metadata);

  logger.info(TAG, 'Credits deducted', {
    userId,
    amount,
    operation,
    fromMonthly,
    fromPurchased,
    totalAfter,
  });

  return { success: true, balanceAfter: totalAfter };
}

/**
 * Refund credits for a failed operation.
 * Refunds go to purchased balance (simplest, always available).
 */
export async function refundCredits(
  userId: string,
  amount: number,
  operation: CreditOperation | string,
  entityId?: string,
  metadata?: Record<string, unknown>,
  _retryCount = 0,
): Promise<DeductResult> {
  if (amount <= 0) return { success: true };

  const supabase = createAdminClient();

  const row = await getOrCreateCreditsRow(userId);
  if (!row) return { success: false, error: 'Errore nel recupero crediti' };

  const newBalance = (row.balance as number) + amount;

  // OPTIMISTIC LOCK (audit 2026-07-16): senza il .eq('balance', row.balance) un
  // refund concorrente a una deduzione poteva sovrascriverla (saldo errato). Su
  // 0 righe aggiornate = corsa rilevata → rileggi e riprova.
  const { data: updated, error: updateErr } = await supabase
    .from('user_credits')
    .update({
      balance: newBalance,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId)
    .eq('balance', row.balance as number)
    .select('id');

  if (updateErr) {
    logger.error(TAG, 'Credit refund failed', { userId, amount, error: updateErr.message });
    return { success: false, error: 'Errore nel rimborso crediti' };
  }
  if (!updated || updated.length === 0) {
    if (_retryCount >= 5) {
      logger.error(TAG, 'Credit refund giving up after retries', { userId, amount });
      return { success: false, error: 'Errore nel rimborso crediti (concorrenza)' };
    }
    logger.warn(TAG, 'Credit refund race, retrying', { userId, amount, retry: _retryCount + 1 });
    return refundCredits(userId, amount, operation, entityId, metadata, _retryCount + 1);
  }

  const allowance = row.monthly_allowance as number;
  const used = row.monthly_used as number;
  const totalAfter = Math.max(0, allowance - used) + newBalance;

  await recordTransaction(userId, amount, totalAfter, 'refund', operation, entityId, metadata);

  logger.info(TAG, 'Credits refunded', { userId, amount, operation, totalAfter });

  return { success: true, balanceAfter: totalAfter };
}

/**
 * Rimborsa la consumption più recente NON ancora rimborsata per un caso e una
 * delle operazioni indicate (idempotente: conta consumi vs rimborsi, come
 * onFailure della pipeline). Usato dall'annullamento manuale — prima annullare
 * un'elaborazione bruciava i crediti senza rimborso (audit 2026-07-16).
 * Ritorna l'importo rimborsato (0 se niente da rimborsare).
 */
export async function refundLatestCaseConsumption(
  userId: string,
  caseId: string,
  operations: string[],
  reason: string,
): Promise<number> {
  const supabase = createAdminClient();
  for (const operation of operations) {
    const { data: consumptions } = await supabase
      .from('credit_transactions')
      .select('amount')
      .eq('user_id', userId)
      .eq('entity_id', caseId)
      .eq('type', 'consumption')
      .eq('operation', operation)
      .order('created_at', { ascending: false });
    const { data: refunds } = await supabase
      .from('credit_transactions')
      .select('id')
      .eq('user_id', userId)
      .eq('entity_id', caseId)
      .eq('type', 'refund')
      .eq('operation', operation);
    const consumptionCount = consumptions?.length ?? 0;
    const refundCount = refunds?.length ?? 0;
    if (consumptionCount > 0 && refundCount < consumptionCount) {
      const amount = Math.abs(consumptions![0].amount as number);
      await refundCredits(userId, amount, operation, caseId, { reason });
      return amount;
    }
  }
  return 0;
}

/**
 * Grant monthly credits for a Pro subscription.
 * Called from Stripe webhook on subscription create/renew.
 */
export async function grantMonthlyCredits(
  userId: string,
  monthlyAllowance: number,
  resetAt: Date,
): Promise<void> {
  const supabase = createAdminClient();
  const newResetIso = resetAt.toISOString();

  // Idempotenza per PERIODO. Stripe emette customer.subscription.updated piu' volte
  // nello stesso ciclo (cambio carta, portal, proration) con event_id diversi, che
  // la dedup per evento NON blocca. Azzerare monthly_used a ogni evento 'active'
  // regalerebbe l'intera quota piu' volte nello stesso mese. Reset SOLO quando il
  // periodo (monthly_reset_at) cambia davvero.
  const { data: existing } = await supabase
    .from('user_credits')
    .select('monthly_reset_at')
    .eq('user_id', userId)
    .maybeSingle();

  const samePeriod = !!existing?.monthly_reset_at
    && new Date(existing.monthly_reset_at as string).getTime() === resetAt.getTime();

  if (samePeriod) {
    // Stesso ciclo: aggiorna solo l'allowance, NON toccare monthly_used, niente grant duplicato.
    const { error } = await supabase
      .from('user_credits')
      .update({ monthly_allowance: monthlyAllowance, updated_at: new Date().toISOString() })
      .eq('user_id', userId);
    if (error) {
      logger.error(TAG, 'Failed to refresh monthly allowance', { userId, error: error.message });
    } else {
      logger.info(TAG, 'Monthly allowance refreshed (stesso periodo, nessun reset)', { userId, resetAt: newResetIso });
    }
    return;
  }

  // Nuovo periodo (o prima concessione): reset legittimo della quota consumata.
  const { error } = await supabase
    .from('user_credits')
    .upsert({
      user_id: userId,
      monthly_allowance: monthlyAllowance,
      monthly_used: 0,
      monthly_reset_at: newResetIso,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' });

  if (error) {
    logger.error(TAG, 'Failed to grant monthly credits', { userId, error: error.message });
    throw new Error(`grantMonthlyCredits fallito per ${userId}: ${error.message}`);
  }

  const balance = await getBalance(userId);
  await recordTransaction(userId, monthlyAllowance, balance.total, 'monthly_grant', 'subscription');

  logger.info(TAG, 'Monthly credits granted', { userId, monthlyAllowance, resetAt: newResetIso });
}

/**
 * Vero se l'utente ha GIÀ ricevuto il grant di prova. AUDIT 2026-07-16: ri-
 * registrarsi con la stessa email non confermata regalava +30 crediti a ogni
 * tentativo (Supabase ritorna l'utente esistente). Guard prima di grantare.
 */
export async function hasTrialGrant(userId: string): Promise<boolean> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from('credit_transactions')
    .select('id')
    .eq('user_id', userId)
    .eq('type', 'trial_grant')
    .limit(1)
    .maybeSingle();
  return !!data;
}

/**
 * Grant one-time credits (trial or purchase).
 * These go to the purchased balance (never expire).
 */
export async function grantCredits(
  userId: string,
  amount: number,
  type: 'trial_grant' | 'purchase',
  metadata?: Record<string, unknown>,
  _grantRetry = 0,
): Promise<void> {
  const supabase = createAdminClient();

  // Ensure row exists
  const row = await getOrCreateCreditsRow(userId);
  if (!row) throw new Error(`grantCredits: impossibile creare la riga crediti per ${userId}`);

  const newBalance = (row.balance as number) + amount;

  // OPTIMISTIC LOCK (audit 2026-07-16): condiziona sul saldo letto; su 0 righe
  // (deduzione/refund concorrente) rileggi e riprova, così l'accredito non
  // sovrascrive una modifica intercorsa.
  const { data: updated, error } = await supabase
    .from('user_credits')
    .update({
      balance: newBalance,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId)
    .eq('balance', row.balance as number)
    .select('id');

  if (error) {
    // MAI ingoiare: un pagamento riuscito senza crediti accreditati = soldi persi
    // in silenzio. Il chiamante (webhook Stripe) DEVE fallire il 200 → Stripe
    // ritenta gratis finché l'accredito va a buon fine (audit 2026-07-16).
    logger.error(TAG, 'Failed to grant credits', { userId, amount, type, error: error.message });
    throw new Error(`grantCredits fallito per ${userId}: ${error.message}`);
  }
  if (!updated || updated.length === 0) {
    if (_grantRetry >= 5) throw new Error(`grantCredits: concorrenza non risolta per ${userId}`);
    logger.warn(TAG, 'grantCredits race, retrying', { userId, amount, retry: _grantRetry + 1 });
    return grantCredits(userId, amount, type, metadata, _grantRetry + 1);
  }

  const allowance = row.monthly_allowance as number;
  const used = row.monthly_used as number;
  const totalAfter = Math.max(0, allowance - used) + newBalance;

  await recordTransaction(userId, amount, totalAfter, type, type === 'purchase' ? 'acquisto' : 'registrazione', undefined, metadata);

  logger.info(TAG, 'Credits granted', { userId, amount, type, totalAfter });
}

/**
 * Revoke monthly credits when subscription is canceled.
 */
export async function revokeMonthlyCredits(userId: string): Promise<void> {
  const supabase = createAdminClient();

  const { error } = await supabase
    .from('user_credits')
    .update({
      monthly_allowance: 0,
      monthly_used: 0,
      monthly_reset_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId);

  if (error) {
    logger.error(TAG, 'Failed to revoke monthly credits', { userId, error: error.message });
  }
}

// --- Internal helpers ---

async function recordTransaction(
  userId: string,
  amount: number,
  balanceAfter: number,
  type: string,
  operation?: string,
  entityId?: string,
  metadata?: Record<string, unknown>,
): Promise<void> {
  const supabase = createAdminClient();

  const { error } = await supabase
    .from('credit_transactions')
    .insert({
      user_id: userId,
      amount,
      balance_after: balanceAfter,
      type,
      operation: operation ?? null,
      entity_id: entityId ?? null,
      metadata: metadata ?? null,
    });

  if (error) {
    // Non-blocking: log but don't fail the operation
    logger.error(TAG, 'Failed to record credit transaction', { userId, amount, type, error: error.message });
  }
}
