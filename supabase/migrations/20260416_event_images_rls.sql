-- P0-SEC-001 — Enable RLS on event_images (missing since migration 0001_volatile_luckman)
-- Without this, any authenticated client using the anon key could SELECT/UPDATE/DELETE
-- image paths of events belonging to other users (GDPR Art. 9 exposure).

ALTER TABLE event_images ENABLE ROW LEVEL SECURITY;

-- Access is gated through the event → case → user ownership chain
CREATE POLICY "Users can manage own event_images"
  ON event_images FOR ALL TO authenticated
  USING (
    event_id IN (
      SELECT e.id FROM events e
      JOIN cases c ON e.case_id = c.id
      WHERE c.user_id = auth.uid()
    )
  )
  WITH CHECK (
    event_id IN (
      SELECT e.id FROM events e
      JOIN cases c ON e.case_id = c.id
      WHERE c.user_id = auth.uid()
    )
  );
