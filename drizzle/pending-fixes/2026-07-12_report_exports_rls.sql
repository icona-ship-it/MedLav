-- report_exports è l'unica tabella del public schema senza RLS abilitata ed è di
-- fatto una tabella MORTA (nessun consumer runtime). Abilitare RLS senza policy
-- nega ogni accesso ai client anon/authenticated (il service-role la bypassa
-- comunque): superficie chiusa senza rischi. In alternativa, se confermata morta,
-- si può fare DROP TABLE (vedi sotto, commentato).

ALTER TABLE public.report_exports ENABLE ROW LEVEL SECURITY;

-- Alternativa (solo se sei certo che nessuno la usi):
-- DROP TABLE public.report_exports;

-- Verifica: relrowsecurity deve essere true.
-- SELECT relname, relrowsecurity FROM pg_class WHERE relname = 'report_exports';
