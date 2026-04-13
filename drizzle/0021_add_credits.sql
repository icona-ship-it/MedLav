-- Credits system: user balances and transaction history
-- Supports monthly allowance (Pro plan) + purchased credits (never expire)

CREATE TABLE IF NOT EXISTS user_credits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE UNIQUE,
  balance INTEGER NOT NULL DEFAULT 0,
  monthly_allowance INTEGER NOT NULL DEFAULT 0,
  monthly_used INTEGER NOT NULL DEFAULT 0,
  monthly_reset_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS credit_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL,
  balance_after INTEGER NOT NULL,
  type TEXT NOT NULL,
  operation TEXT,
  entity_id UUID,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_credit_transactions_user_id ON credit_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_credit_transactions_created_at ON credit_transactions(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_credit_transactions_entity ON credit_transactions(entity_id) WHERE entity_id IS NOT NULL;

-- RLS policies
ALTER TABLE user_credits ENABLE ROW LEVEL SECURITY;
ALTER TABLE credit_transactions ENABLE ROW LEVEL SECURITY;

-- Users can read their own credits
CREATE POLICY "Users can view own credits" ON user_credits
  FOR SELECT USING (auth.uid() = user_id);

-- Users can read their own transactions
CREATE POLICY "Users can view own transactions" ON credit_transactions
  FOR SELECT USING (auth.uid() = user_id);

-- Only service role can insert/update (server-side operations)
CREATE POLICY "Service role manages credits" ON user_credits
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role manages transactions" ON credit_transactions
  FOR ALL USING (auth.role() = 'service_role');

-- Grant trial credits to existing trial users
-- New users get credits via signup flow
INSERT INTO user_credits (user_id, balance, monthly_allowance, monthly_used)
SELECT id, 30, 0, 0
FROM profiles
WHERE subscription_status = 'trial' OR subscription_status IS NULL
ON CONFLICT (user_id) DO NOTHING;

-- Grant monthly credits to existing Pro users
INSERT INTO user_credits (user_id, balance, monthly_allowance, monthly_used, monthly_reset_at)
SELECT id, 0, 900, 0, subscription_period_end
FROM profiles
WHERE subscription_plan = 'pro' AND subscription_status = 'active'
ON CONFLICT (user_id) DO NOTHING;
