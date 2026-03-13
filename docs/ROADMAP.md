# MedLav — Roadmap verso il prodotto #1

## Stato attuale: MVP++ (Marzo 2026)

Pipeline completa, 10 tipi caso, prompt adattivi per ruolo, few-shot perizie, RAG linee guida, Sentry, E2E tests, health check, GDPR compliance, DB ottimizzato con indici.
**Ultimo update**: prompt versioning, quesiti del giudice, export professionale con firma, editor side-by-side, classificazione AI su tutti i doc.

---

## FASE 1 — GO-TO-MARKET (bloccanti per vendere)

| # | Task | Stato | Cosa serve |
|---|------|-------|------------|
| 1.1 | Terms of Service | DA FARE | Testo legale da avvocato |
| 1.2 | Privacy Policy | DA FARE | Testo legale da avvocato |
| 1.3 | Stripe pagamenti | DA FARE | Account Stripe + decisioni pricing |
| 1.4 | Sentry error tracking | FATTO | DSN configurato su Vercel |
| 1.5 | Email verification | FATTO | Attivato su Supabase |
| 1.6 | NEXT_PUBLIC_SITE_URL | FATTO | Configurato su Vercel |
| 1.7 | pgvector + RAG migration | FATTO | Estensione + migration eseguiti su Supabase |
| 1.8 | DB enum + indici | FATTO | 3 nuovi case types + 14 indici performance |
| 1.9 | Pagina pricing | DA FARE | Dipende da 1.3 |

## FASE 2 — QUALITÀ REPORT (differenziante vs Docsy)

| # | Task | Stato | Note |
|---|------|-------|------|
| 2.1 | Perizie golden-reference (few-shot) | FATTO | 8 perizie (4 tipi x CTU/CTP) integrate nei prompt |
| 2.2 | Linee guida cliniche per RAG | FATTO | 6 linee guida pronte + pipeline ingestione attiva |
| 2.3 | Few-shot prompting | FATTO | Integrato in synthesis + summary system prompts |
| 2.4 | Calibrazione su perizie reali | IN ATTESA | Quando avrai perizie reali da medici legali |
| 2.5 | Barème SIMLA digitalizzato | OPZIONALE | Libro + data entry |
| 2.6 | Report quality guardrails | FATTO | Validatore post-generazione: sezioni mancanti, date sentinel, copertura eventi |
| 2.7 | Classificazione doc con Mistral Large | FATTO | Upgrade da Small a Large + prompt arricchito con segnali (nome file, intestazione, struttura) |
| 2.8 | Fix date sentinel in synthesis | FATTO | formatDate('1900-01-01') → "Data non documentata" |
| 2.9 | Fix prompt estrazione | FATTO | Numerazione regole, hint tipi mancanti (lettera_dimissione, perizia_precedente) |

## FASE 3 — UX PROFESSIONALE

| # | Task | Stato |
|---|------|-------|
| 3.1 | Onboarding wizard | DA FARE |
| 3.2 | Pagina sicurezza/compliance | DA FARE |
| 3.3 | Admin gestione utenti | DA FARE |
| 3.4 | Skeleton loaders | FATTO | ReportSkeleton, EventsSkeleton, DocumentsSkeleton |
| 3.5 | Documentazione utente | DA FARE |
| 3.6 | Quesiti del giudice nel form perizia | FATTO | Input, salvataggio, integrazione prompt |
| 3.7 | Editor report side-by-side (markdown + preview) | FATTO | Sostituisce tab Modifica/Anteprima |
| 3.8 | Anteprima export prima del download | FATTO | Bottone "Anteprima Report" nel dropdown |
| 3.9 | DOCX con blocco firma e numerazione pagine | FATTO | Entrambi export standard e professionale |
| 3.10 | Prompt versioning (tracciabilità report) | FATTO | SHA-256 hash del system prompt, salvato in generation_metadata |
| 3.11 | Classificazione AI su tutti i documenti per metadata | FATTO | Mismatch warning nella review |
| 3.12 | Upload UX migliorata (label, hint, dropdown più grande) | FATTO |
| 3.13 | Fix bug post-conferma classificazione | FATTO | processing_status aggiornato |
| 3.14 | Perizia form con descrizioni campi | FATTO | Helper text per tribunale, RG, fondo spese, CTU |
| 3.15 | User-friendly error messages | FATTO | Mappatura errori tecnici → messaggi azionabili in italiano |

## FASE 4 — SCALABILITÀ E AFFIDABILITÀ

| # | Task | Stato |
|---|------|-------|
| 4.1 | Test E2E Playwright | FATTO |
| 4.1b | Test suite unit (355 test, 36 file) | FATTO | Classificazione, prompt, validatore, pipeline |
| 4.1c | OCR parallelo in pipeline | FATTO | Promise.all su step.run, tempo ridotto da N*T a max(T) |
| 4.1d | Resilienza pipeline estrazione | FATTO | Race condition fix, retry 0-eventi, filtro pagine vuote, rethrow transienti |
| 4.1e | UX diagnostica | FATTO | DocumentCoverageCard, tab Problemi unificato, checklist prossimi passi |
| 4.2 | Health check endpoint (/api/health) | FATTO |
| 4.3 | Sentry + error boundaries | FATTO |
| 4.4 | Cookie consent GDPR | FATTO |
| 4.5 | Diritti GDPR (esporta/cancella dati) | FATTO |
| 4.6 | Password reset + email verification | FATTO |
| 4.7 | Rate limiting completo | FATTO |
| 4.8 | Backup strategy | DA FARE |
| 4.9 | 2FA/MFA | DA FARE |
| 4.10 | SEO (sitemap, robots.txt, OG tags) | DA FARE |

## FASE 5 — PREMIUM (post-lancio)

| # | Task | Stato | Impatto |
|---|------|-------|---------|
| 5.1 | Moduli RC Auto, Previdenziale, Infortuni | FATTO | 10 tipi caso totali |
| 5.2 | Rigenerazione singola sezione report | FATTO | API + section parser |
| 5.3 | Calcoli medico-legali in report + export | FATTO | ITT/ITP integrati |
| 5.4 | Domain knowledge (nesso causale, framework) | FATTO | 5 criteri + 5 framework |
| 5.5 | Anonimizzazione documenti | DA FARE | Alto per enterprise |
| 5.6 | Condivisione casi (team/studio) | DA FARE | Alto per studi associati |
| 5.7 | SSO enterprise (OAuth/SAML) | DA FARE | Alto per ospedali |
| 5.8 | Fine-tuning Mistral | DA FARE | 500+ perizie necessarie |
| 5.9 | API pubblica | DA FARE | Alto per B2B |
| 5.10 | Multi-lingua documenti | DA FARE | Medio |

## FASE 6 — NUMERO 1

| # | Obiettivo | Come |
|---|-----------|------|
| 6.1 | Certificazione ISO 27001 | Audit esterno |
| 6.2 | Penetration testing | Azienda specializzata |
| 6.3 | Partnership SIMLA/AIMEF | Business development |
| 6.4 | Integrazione PCT (tribunali) | Partnership istituzionale |
| 6.5 | White-label assicurazioni | Multi-tenant avanzato |

---

## Metriche di successo

- **Report quality**: >90% utilizzabile senza modifiche (da validare con utenti reali)
- **Tempo generazione**: <5 minuti per caso medio (20-50 pagine)
- **Uptime**: >99.5%
- **NPS**: >50
- **Churn mensile**: <5%

---

## Prossimi step immediati (serve input utente)

1. **Avvocato** → Terms of Service + Privacy Policy
2. **Stripe** → Account + decisioni piani/prezzi
3. **Perizie reali** → 10-20 esempi da medici legali per calibrazione finale
