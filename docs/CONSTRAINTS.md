# Vincoli Tecnici

## Infrastruttura

- Deploy frontend + API su Vercel (function region EU: fra1 o cdg1)
- Database e storage su Supabase (EU region - Frankfurt)
- AI/LLM esclusivamente Mistral API (azienda francese, dati in EU)
- Job queue con Inngest (integrato con Vercel per job long-running)
- TUTTI i dati devono rimanere in EU (data residency)
- Nessun servizio non-EU per dati sanitari

## GDPR e Sicurezza (Dati Sanitari - Art. 9 GDPR)

### Implementare nell'app
- Row Level Security (RLS) su Supabase — ogni perito vede SOLO i propri dati
- Crittografia at-rest (Supabase encryption) e in-transit (HTTPS/TLS ovunque)
- Audit log completo: chi ha fatto cosa, quando, su quale dato
- Pseudonimizzazione: usare iniziali paziente e codici caso, MAI nomi completi nei log
- Diritto alla cancellazione: funzione per eliminare TUTTI i dati di un caso/utente
- Data retention policy configurabile per utente
- Cookie banner e consent management (solo cookie tecnici + analytics opt-in)
- Logging sanitizzato: NESSUN dato clinico nei log applicativi
- Session management sicuro: scadenza, invalidazione, single-session opzionale
- Rate limiting su tutti gli endpoint API
- CSRF protection su tutti i form
- Content Security Policy (CSP) headers

### Da fare lato legale (utente)
- DPA (Data Processing Agreement) con Supabase, Mistral, Vercel
- Privacy policy e terms of service
- DPO (Data Protection Officer) se trattamento su larga scala
- DPIA (Data Protection Impact Assessment) — obbligatoria per dati sanitari
- Registro dei trattamenti
- Base giuridica del trattamento (consenso esplicito + legittimo interesse professionale)

## Compatibilita

- Browser: Chrome 100+, Safari 17+, Firefox 110+, Edge 100+
- Mobile-first responsive (i periti usano anche tablet)
- Supporto upload file fino a 500MB per caso
- Gestione documenti di centinaia di pagine

## Dipendenze Vietate

- NO jQuery
- NO Moment.js (usare date-fns o dayjs)
- NO ORM pesanti (usare Drizzle ORM — leggero e type-safe)
- NO servizi non-EU per dati sanitari
- NO console.log in produzione
- NO `any` in TypeScript

## Dipendenze Preferite

- Zod per validazione input/output
- Drizzle ORM per database
- TanStack Query per data fetching client-side
- Tailwind CSS v4 per styling
- shadcn/ui per componenti UI
- Radix UI per primitives accessibili
- Lucide per icone
- date-fns per date/time
- Papa Parse per CSV export
- docx per DOCX export
- Inngest per background jobs
- Vitest per unit/integration test
- Playwright per E2E test

## Performance

- TTFB < 200ms per pagine statiche
- LCP < 2.5s
- Elaborazione OCR: feedback progressivo in real-time via Supabase Realtime
- Upload file: chunk upload per file grandi con resume su interruzione

## Scalabilita

- Architettura single-tenant iniziale con isolamento dati via RLS
- Predisposta per multi-tenant: user_id su ogni tabella, RLS policies
- Target: 20-100 utenti primo anno, volumi variabili
