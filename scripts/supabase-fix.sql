-- ============================================================================
-- MedLav — Script di FIX Supabase
-- Esegui nel SQL Editor di Supabase DOPO aver eseguito supabase-verify.sql
-- e aver identificato i problemi.
--
-- Questo script è IDEMPOTENTE: può essere eseguito più volte senza danni
-- (usa IF NOT EXISTS, IF EXISTS, CREATE OR REPLACE ovunque).
--
-- ESEGUI SEZIONE PER SEZIONE, non tutto insieme.
-- ============================================================================


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  FIX 1: Migrazione 0008 — Colonne Stripe + preferenze utente          ║
-- ║  (se non ancora applicate)                                             ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

ALTER TABLE "profiles" ADD COLUMN IF NOT EXISTS "stripe_customer_id" text;
ALTER TABLE "profiles" ADD COLUMN IF NOT EXISTS "subscription_status" text DEFAULT 'trial';
ALTER TABLE "profiles" ADD COLUMN IF NOT EXISTS "subscription_plan" text;
ALTER TABLE "profiles" ADD COLUMN IF NOT EXISTS "subscription_period_end" timestamptz;
ALTER TABLE "profiles" ADD COLUMN IF NOT EXISTS "email_notifications" boolean DEFAULT true;
ALTER TABLE "profiles" ADD COLUMN IF NOT EXISTS "is_active" boolean DEFAULT true;


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  FIX 2: pgvector extension                                             ║
-- ║  NOTA: Se fallisce, abilitare manualmente da:                          ║
-- ║  Dashboard → Database → Extensions → cercare "vector" → Enable         ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

CREATE EXTENSION IF NOT EXISTS vector;


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  FIX 3: Colonna embedding — da text a vector(1024)                     ║
-- ║  (risolve il conflitto tra migration 0002 manuale e Drizzle)           ║
-- ║                                                                        ║
-- ║  Se guideline_chunks.embedding è già vector(1024) → nessun effetto.    ║
-- ║  Se è text → converte a vector(1024).                                  ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

DO $$
BEGIN
  -- Verifica se la colonna è di tipo text
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'guideline_chunks'
      AND column_name = 'embedding'
      AND udt_name = 'text'
  ) THEN
    -- Prima svuota gli embedding esistenti (non convertibili da text arbitrario)
    UPDATE guideline_chunks SET embedding = NULL WHERE embedding IS NOT NULL;
    -- Cambia tipo da text a vector(1024)
    ALTER TABLE guideline_chunks ALTER COLUMN embedding TYPE vector(1024)
      USING embedding::vector(1024);
    RAISE NOTICE 'FIX 3: colonna embedding convertita da text a vector(1024)';
  ELSE
    RAISE NOTICE 'FIX 3: colonna embedding già vector(1024) — nessuna modifica';
  END IF;
END $$;

-- Ricrea indice HNSW (se mancante)
CREATE INDEX IF NOT EXISTS "idx_guideline_chunks_embedding"
  ON "guideline_chunks" USING hnsw ("embedding" vector_cosine_ops);


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  FIX 4: RPC function match_guideline_chunks                            ║
-- ║  (versione più recente con guideline_year)                             ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

DROP FUNCTION IF EXISTS match_guideline_chunks(vector, text, float, int);
DROP FUNCTION IF EXISTS match_guideline_chunks(vector, text, double precision, integer);

CREATE OR REPLACE FUNCTION match_guideline_chunks(
  query_embedding vector(1024),
  match_case_type text,
  match_threshold float DEFAULT 0.3,
  match_count int DEFAULT 5
)
RETURNS TABLE (
  content text,
  section_title text,
  guideline_title text,
  guideline_source text,
  guideline_year integer,
  similarity float
)
LANGUAGE sql STABLE
AS $$
  SELECT
    gc.content,
    gc.section_title,
    g.title AS guideline_title,
    g.source AS guideline_source,
    g.year AS guideline_year,
    1 - (gc.embedding <=> query_embedding) AS similarity
  FROM guideline_chunks gc
  JOIN guidelines g ON g.id = gc.guideline_id
  WHERE g.is_active = 1
    AND g.case_types ? match_case_type
    AND 1 - (gc.embedding <=> query_embedding) > match_threshold
  ORDER BY gc.embedding <=> query_embedding
  LIMIT match_count;
$$;


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  FIX 5: Enum values mancanti                                           ║
-- ║  (case_type + anomaly_type aggiunti in migration 0002b e 0005)         ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

-- case_type: aggiungi rc_auto, previdenziale, infortuni se mancanti
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'rc_auto' AND enumtypid = 'case_type'::regtype) THEN
    ALTER TYPE case_type ADD VALUE 'rc_auto' BEFORE 'generica';
  END IF;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'previdenziale' AND enumtypid = 'case_type'::regtype) THEN
    ALTER TYPE case_type ADD VALUE 'previdenziale' BEFORE 'generica';
  END IF;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'infortuni' AND enumtypid = 'case_type'::regtype) THEN
    ALTER TYPE case_type ADD VALUE 'infortuni' BEFORE 'generica';
  END IF;
END $$;

-- anomaly_type: aggiungi valore_clinico_critico, sequenza_temporale_violata se mancanti
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'valore_clinico_critico' AND enumtypid = 'anomaly_type'::regtype) THEN
    ALTER TYPE anomaly_type ADD VALUE 'valore_clinico_critico';
  END IF;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'sequenza_temporale_violata' AND enumtypid = 'anomaly_type'::regtype) THEN
    ALTER TYPE anomaly_type ADD VALUE 'sequenza_temporale_violata';
  END IF;
END $$;


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  FIX 6: Colonne mancanti su cases e events                            ║
-- ║  (migration 0001, 0002b, 0003)                                        ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

-- cases: case_types + perizia_metadata
ALTER TABLE "cases" ADD COLUMN IF NOT EXISTS "case_types" jsonb;
ALTER TABLE "cases" ADD COLUMN IF NOT EXISTS "perizia_metadata" jsonb;

-- events: source_text, source_pages, extraction_pass
ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "source_text" text;
ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "source_pages" text;

-- extraction_pass enum + colonna (se mancante)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'extraction_pass') THEN
    CREATE TYPE extraction_pass AS ENUM('both', 'pass1_only', 'pass2_only');
  END IF;
END $$;
ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "extraction_pass" extraction_pass;


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  FIX 7: Tabelle mancanti (event_images, guidelines, guideline_chunks,  ║
-- ║         report_ratings, case_shares)                                    ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

-- event_images
CREATE TABLE IF NOT EXISTS "event_images" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "event_id" uuid NOT NULL REFERENCES "events"("id") ON DELETE CASCADE,
  "page_id" uuid NOT NULL REFERENCES "pages"("id") ON DELETE CASCADE,
  "image_path" text NOT NULL,
  "page_number" integer NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL
);

-- guidelines
CREATE TABLE IF NOT EXISTS "guidelines" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "title" text NOT NULL,
  "source" text NOT NULL,
  "year" integer,
  "case_types" jsonb NOT NULL DEFAULT '[]',
  "chunk_count" integer NOT NULL DEFAULT 0,
  "is_active" integer NOT NULL DEFAULT 1,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);

-- guideline_chunks
CREATE TABLE IF NOT EXISTS "guideline_chunks" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "guideline_id" uuid NOT NULL REFERENCES "guidelines"("id") ON DELETE CASCADE,
  "chunk_index" integer NOT NULL,
  "content" text NOT NULL,
  "section_title" text,
  "embedding" vector(1024),
  "token_count" integer,
  "created_at" timestamptz DEFAULT now() NOT NULL
);

-- report_ratings
CREATE TABLE IF NOT EXISTS "report_ratings" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "report_id" uuid NOT NULL REFERENCES "reports"("id") ON DELETE CASCADE,
  "user_id" uuid NOT NULL REFERENCES "profiles"("id") ON DELETE CASCADE,
  "rating" integer NOT NULL CHECK (rating >= 1 AND rating <= 5),
  "comment" text,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  UNIQUE("report_id", "user_id")
);

-- case_shares
CREATE TABLE IF NOT EXISTS "case_shares" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "case_id" uuid NOT NULL REFERENCES "cases"("id") ON DELETE CASCADE,
  "user_id" uuid NOT NULL REFERENCES "profiles"("id") ON DELETE CASCADE,
  "token" text NOT NULL UNIQUE,
  "label" text,
  "expires_at" timestamptz NOT NULL,
  "view_count" integer DEFAULT 0,
  "created_at" timestamptz DEFAULT now() NOT NULL
);

-- Indexes
CREATE INDEX IF NOT EXISTS "idx_guideline_chunks_guideline_id" ON "guideline_chunks" ("guideline_id");
CREATE INDEX IF NOT EXISTS "idx_case_shares_token" ON "case_shares" ("token");


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  FIX 8: RLS su tabelle core con dati sensibili (GDPR Art. 9)          ║
-- ║                                                                        ║
-- ║  IMPORTANTE: Queste policy usano auth.uid() per verificare ownership.  ║
-- ║  Il service_role (usato da Inngest e admin) bypassa RLS di default.    ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

-- ── cases ──
ALTER TABLE "cases" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_own_cases" ON "cases";
CREATE POLICY "users_own_cases" ON "cases"
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ── documents (accesso via case ownership) ──
ALTER TABLE "documents" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_own_documents" ON "documents";
CREATE POLICY "users_own_documents" ON "documents"
  FOR ALL TO authenticated
  USING (case_id IN (SELECT id FROM cases WHERE user_id = auth.uid()))
  WITH CHECK (case_id IN (SELECT id FROM cases WHERE user_id = auth.uid()));

-- ── pages (accesso via document → case ownership) ──
ALTER TABLE "pages" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_own_pages" ON "pages";
CREATE POLICY "users_own_pages" ON "pages"
  FOR ALL TO authenticated
  USING (document_id IN (
    SELECT d.id FROM documents d
    JOIN cases c ON c.id = d.case_id
    WHERE c.user_id = auth.uid()
  ))
  WITH CHECK (document_id IN (
    SELECT d.id FROM documents d
    JOIN cases c ON c.id = d.case_id
    WHERE c.user_id = auth.uid()
  ));

-- ── events ──
ALTER TABLE "events" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_own_events" ON "events";
CREATE POLICY "users_own_events" ON "events"
  FOR ALL TO authenticated
  USING (case_id IN (SELECT id FROM cases WHERE user_id = auth.uid()))
  WITH CHECK (case_id IN (SELECT id FROM cases WHERE user_id = auth.uid()));

-- ── event_images (accesso via event → case ownership) ──
ALTER TABLE "event_images" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_own_event_images" ON "event_images";
CREATE POLICY "users_own_event_images" ON "event_images"
  FOR ALL TO authenticated
  USING (event_id IN (
    SELECT e.id FROM events e
    JOIN cases c ON c.id = e.case_id
    WHERE c.user_id = auth.uid()
  ))
  WITH CHECK (event_id IN (
    SELECT e.id FROM events e
    JOIN cases c ON c.id = e.case_id
    WHERE c.user_id = auth.uid()
  ));

-- ── anomalies ──
ALTER TABLE "anomalies" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_own_anomalies" ON "anomalies";
CREATE POLICY "users_own_anomalies" ON "anomalies"
  FOR ALL TO authenticated
  USING (case_id IN (SELECT id FROM cases WHERE user_id = auth.uid()))
  WITH CHECK (case_id IN (SELECT id FROM cases WHERE user_id = auth.uid()));

-- ── missing_documents ──
ALTER TABLE "missing_documents" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_own_missing_docs" ON "missing_documents";
CREATE POLICY "users_own_missing_docs" ON "missing_documents"
  FOR ALL TO authenticated
  USING (case_id IN (SELECT id FROM cases WHERE user_id = auth.uid()))
  WITH CHECK (case_id IN (SELECT id FROM cases WHERE user_id = auth.uid()));

-- ── reports ──
ALTER TABLE "reports" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_own_reports" ON "reports";
CREATE POLICY "users_own_reports" ON "reports"
  FOR ALL TO authenticated
  USING (case_id IN (SELECT id FROM cases WHERE user_id = auth.uid()))
  WITH CHECK (case_id IN (SELECT id FROM cases WHERE user_id = auth.uid()));

-- ── report_exports ──
ALTER TABLE "report_exports" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_own_report_exports" ON "report_exports";
CREATE POLICY "users_own_report_exports" ON "report_exports"
  FOR ALL TO authenticated
  USING (report_id IN (
    SELECT r.id FROM reports r
    JOIN cases c ON c.id = r.case_id
    WHERE c.user_id = auth.uid()
  ))
  WITH CHECK (report_id IN (
    SELECT r.id FROM reports r
    JOIN cases c ON c.id = r.case_id
    WHERE c.user_id = auth.uid()
  ));

-- ── guidelines + guideline_chunks (già avevano RLS, ricreo se mancanti) ──
ALTER TABLE "guidelines" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "guideline_chunks" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "guidelines_read" ON "guidelines";
CREATE POLICY "guidelines_read" ON "guidelines"
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "guidelines_admin_write" ON "guidelines";
CREATE POLICY "guidelines_admin_write" ON "guidelines"
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "guideline_chunks_read" ON "guideline_chunks";
CREATE POLICY "guideline_chunks_read" ON "guideline_chunks"
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "guideline_chunks_admin_write" ON "guideline_chunks";
CREATE POLICY "guideline_chunks_admin_write" ON "guideline_chunks"
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ── report_ratings (già aveva RLS) ──
ALTER TABLE "report_ratings" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_own_ratings" ON "report_ratings";
CREATE POLICY "users_own_ratings" ON "report_ratings"
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ── case_shares (già aveva RLS) ──
ALTER TABLE "case_shares" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_own_shares" ON "case_shares";
CREATE POLICY "users_own_shares" ON "case_shares"
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ── audit_log: NO RLS (solo accesso admin via service_role) ──
-- L'app usa createAdminClient() (service_role) per audit_log,
-- quindi RLS non serve. Il client autenticato non accede mai a audit_log.


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  FIX 9: Storage bucket + policies                                      ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

-- Crea bucket se mancante (Nota: potrebbe servire farlo da Dashboard)
INSERT INTO storage.buckets (id, name, public)
VALUES ('documents', 'documents', false)
ON CONFLICT (id) DO NOTHING;

-- Policy: utenti autenticati possono caricare nella propria cartella
DROP POLICY IF EXISTS "users_upload_own_documents" ON storage.objects;
CREATE POLICY "users_upload_own_documents" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'documents'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Policy: utenti autenticati possono leggere i propri documenti
DROP POLICY IF EXISTS "users_read_own_documents" ON storage.objects;
CREATE POLICY "users_read_own_documents" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'documents'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Policy: utenti autenticati possono cancellare i propri documenti
DROP POLICY IF EXISTS "users_delete_own_documents" ON storage.objects;
CREATE POLICY "users_delete_own_documents" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'documents'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  FIX 10: Profile creation trigger                                      ║
-- ║  (crea profilo automaticamente quando un utente si registra)           ║
-- ║                                                                        ║
-- ║  L'app lo fa già via codice, ma il trigger è una safety net.           ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', '')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- Rimuovi trigger esistente se presente, poi ricrea
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();


-- ============================================================================
-- FINE FIX
--
-- Riesegui supabase-verify.sql per confermare che tutto è a posto.
-- Tutti i "MANCANTE" e "PROBLEMA" dovrebbero ora mostrare "OK".
-- ============================================================================
