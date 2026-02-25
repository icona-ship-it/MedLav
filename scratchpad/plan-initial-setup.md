# Piano: Setup Iniziale MedLav

## Step 1: Inizializzare Next.js 15
- Create Next.js in temp dir, copiare in progetto
- TypeScript strict, Tailwind v4, ESLint, App Router, src directory

## Step 2: Installare dipendenze
- shadcn/ui + Radix UI
- Drizzle ORM + drizzle-kit
- @supabase/supabase-js + @supabase/ssr
- @mistralai/mistralai
- inngest
- zod
- date-fns
- docx (export DOCX)
- papaparse (export CSV)
- lucide-react (icone)
- vitest + @testing-library/react (test)

## Step 3: Struttura cartelle src/
- src/app/ (pages e layouts)
- src/components/ (UI components)
- src/lib/ (utilities, client configs)
- src/db/ (schema Drizzle, migrations)
- src/types/ (TypeScript types condivisi)
- src/hooks/ (custom React hooks)
- src/services/ (business logic, API Mistral, pipeline)
- src/inngest/ (funzioni background jobs)

## Step 4: Configurazioni base
- Drizzle config
- Supabase client (server + browser)
- Inngest client
- Mistral client
- env.example
- Vitest config

## Step 5: Schema Database
- Tabelle: users, cases, documents, pages, events, anomalies, missing_docs, reports, annotations, audit_log

## Step 6: Layout e pagine base
- Layout principale con sidebar
- Dashboard (lista casi)
- Pagina creazione caso
- Placeholder per le altre pagine
