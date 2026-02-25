-- Create storage bucket for documents
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'documents',
  'documents',
  false,
  524288000, -- 500MB max file size
  ARRAY[
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/tiff',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ]
) ON CONFLICT (id) DO NOTHING;

-- Storage policies: users can only access their own files
-- Policy: Users can upload files to their own folder
CREATE POLICY "Users can upload own documents"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'documents'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Policy: Users can read their own files
CREATE POLICY "Users can read own documents"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'documents'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Policy: Users can delete their own files
CREATE POLICY "Users can delete own documents"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'documents'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Enable RLS on application tables
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
ALTER TABLE anomalies ENABLE ROW LEVEL SECURITY;
ALTER TABLE missing_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE report_exports ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

-- Profiles: users can read/update their own profile
CREATE POLICY "Users can read own profile"
  ON profiles FOR SELECT TO authenticated
  USING (id = auth.uid());

CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE TO authenticated
  USING (id = auth.uid());

CREATE POLICY "Users can insert own profile"
  ON profiles FOR INSERT TO authenticated
  WITH CHECK (id = auth.uid());

-- Cases: users can CRUD their own cases
CREATE POLICY "Users can read own cases"
  ON cases FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert own cases"
  ON cases FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own cases"
  ON cases FOR UPDATE TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can delete own cases"
  ON cases FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- Documents: access through case ownership
CREATE POLICY "Users can read own documents"
  ON documents FOR SELECT TO authenticated
  USING (case_id IN (SELECT id FROM cases WHERE user_id = auth.uid()));

CREATE POLICY "Users can insert own documents"
  ON documents FOR INSERT TO authenticated
  WITH CHECK (case_id IN (SELECT id FROM cases WHERE user_id = auth.uid()));

CREATE POLICY "Users can update own documents"
  ON documents FOR UPDATE TO authenticated
  USING (case_id IN (SELECT id FROM cases WHERE user_id = auth.uid()));

CREATE POLICY "Users can delete own documents"
  ON documents FOR DELETE TO authenticated
  USING (case_id IN (SELECT id FROM cases WHERE user_id = auth.uid()));

-- Pages: access through document → case ownership
CREATE POLICY "Users can read own pages"
  ON pages FOR SELECT TO authenticated
  USING (document_id IN (
    SELECT d.id FROM documents d
    JOIN cases c ON d.case_id = c.id
    WHERE c.user_id = auth.uid()
  ));

CREATE POLICY "Users can insert own pages"
  ON pages FOR INSERT TO authenticated
  WITH CHECK (document_id IN (
    SELECT d.id FROM documents d
    JOIN cases c ON d.case_id = c.id
    WHERE c.user_id = auth.uid()
  ));

-- Events: access through case ownership
CREATE POLICY "Users can read own events"
  ON events FOR SELECT TO authenticated
  USING (case_id IN (SELECT id FROM cases WHERE user_id = auth.uid()));

CREATE POLICY "Users can manage own events"
  ON events FOR ALL TO authenticated
  USING (case_id IN (SELECT id FROM cases WHERE user_id = auth.uid()));

-- Anomalies: access through case ownership
CREATE POLICY "Users can read own anomalies"
  ON anomalies FOR SELECT TO authenticated
  USING (case_id IN (SELECT id FROM cases WHERE user_id = auth.uid()));

-- Missing documents: access through case ownership
CREATE POLICY "Users can read own missing docs"
  ON missing_documents FOR SELECT TO authenticated
  USING (case_id IN (SELECT id FROM cases WHERE user_id = auth.uid()));

-- Reports: access through case ownership
CREATE POLICY "Users can read own reports"
  ON reports FOR SELECT TO authenticated
  USING (case_id IN (SELECT id FROM cases WHERE user_id = auth.uid()));

CREATE POLICY "Users can manage own reports"
  ON reports FOR ALL TO authenticated
  USING (case_id IN (SELECT id FROM cases WHERE user_id = auth.uid()));

-- Report exports: access through report → case ownership
CREATE POLICY "Users can read own exports"
  ON report_exports FOR SELECT TO authenticated
  USING (report_id IN (
    SELECT r.id FROM reports r
    JOIN cases c ON r.case_id = c.id
    WHERE c.user_id = auth.uid()
  ));

-- Audit log: users can only read their own logs
CREATE POLICY "Users can read own audit logs"
  ON audit_log FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- Service role can insert audit logs (server-side only)
CREATE POLICY "Service can insert audit logs"
  ON audit_log FOR INSERT TO service_role
  WITH CHECK (true);
