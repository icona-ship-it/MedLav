import { describe, it, expect, vi, beforeEach } from 'vitest';

// Regression per il fix HIGH (verifica totale 2026-07-12): grantMonthlyCredits
// deve azzerare monthly_used SOLO quando il periodo (monthly_reset_at) cambia.
// Prima azzerava a ogni customer.subscription.updated 'active' → un abbonato Pro
// poteva recuperare l'intera quota più volte nello stesso ciclo (money leak).

const { updateSpy, upsertSpy, txInsertSpy } = vi.hoisted(() => ({
  updateSpy: vi.fn(),
  upsertSpy: vi.fn(),
  txInsertSpy: vi.fn(),
}));

// Stato mutabile letto a call-time dentro il mock (niente hoisting issue).
let existingResetAt: string | null;

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      if (table === 'credit_transactions') {
        return { insert: (...a: unknown[]) => { txInsertSpy(...a); return Promise.resolve({ error: null }); } };
      }
      // user_credits
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: () => Promise.resolve({ data: { monthly_reset_at: existingResetAt } }),
            single: () => Promise.resolve({
              data: {
                user_id: 'u1', balance: 0, monthly_allowance: 30,
                monthly_used: 0, monthly_reset_at: existingResetAt,
              },
            }),
          }),
        }),
        update: (payload: unknown) => { updateSpy(payload); return { eq: () => Promise.resolve({ error: null }) }; },
        upsert: (payload: unknown) => { upsertSpy(payload); return Promise.resolve({ error: null }); },
      };
    },
  }),
}));
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

import { grantMonthlyCredits } from './credit-service';

// Date lontane nel futuro: evitano che maybeResetMonthly (lazy reset in getBalance)
// scatti durante il test, rendendolo indipendente dalla data di esecuzione.
const RESET = new Date('2030-02-01T00:00:00.000Z');

describe('grantMonthlyCredits — idempotenza per periodo', () => {
  beforeEach(() => {
    updateSpy.mockClear();
    upsertSpy.mockClear();
    txInsertSpy.mockClear();
  });

  it('STESSO periodo (reset_at invariato): aggiorna solo l\'allowance, NON azzera monthly_used né concede di nuovo', async () => {
    existingResetAt = RESET.toISOString();

    await grantMonthlyCredits('u1', 30, RESET);

    // Nessun reset (upsert con monthly_used: 0) e nessun grant duplicato nel ledger.
    expect(upsertSpy).not.toHaveBeenCalled();
    expect(txInsertSpy).not.toHaveBeenCalled();
    // Solo un update dell'allowance, SENZA la chiave monthly_used.
    expect(updateSpy).toHaveBeenCalledTimes(1);
    const payload = updateSpy.mock.calls[0][0] as Record<string, unknown>;
    expect(payload).toHaveProperty('monthly_allowance', 30);
    expect(payload).not.toHaveProperty('monthly_used');
  });

  it('NUOVO periodo (reset_at diverso): reset legittimo con monthly_used = 0 + grant registrato', async () => {
    existingResetAt = '2030-03-01T00:00:00.000Z'; // periodo diverso (e futuro → no lazy reset)

    await grantMonthlyCredits('u1', 30, RESET);

    // Reset via upsert con quota azzerata.
    expect(upsertSpy).toHaveBeenCalledTimes(1);
    const payload = upsertSpy.mock.calls[0][0] as Record<string, unknown>;
    expect(payload).toMatchObject({ monthly_used: 0, monthly_allowance: 30, monthly_reset_at: RESET.toISOString() });
    // Il grant mensile viene registrato nel ledger.
    expect(txInsertSpy).toHaveBeenCalledTimes(1);
  });

  it('PRIMA concessione (nessun periodo salvato): tratta come nuovo periodo', async () => {
    existingResetAt = null;

    await grantMonthlyCredits('u1', 30, RESET);

    expect(upsertSpy).toHaveBeenCalledTimes(1);
    const payload = upsertSpy.mock.calls[0][0] as Record<string, unknown>;
    expect(payload).toMatchObject({ monthly_used: 0 });
  });
});
