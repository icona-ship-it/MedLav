-- Case sharing: token-based read-only access with expiration
CREATE TABLE case_shares (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  label TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  view_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE INDEX idx_case_shares_token ON case_shares(token);

ALTER TABLE case_shares ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_own_shares" ON case_shares
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
