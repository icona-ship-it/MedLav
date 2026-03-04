# MedLav — Roadmap verso il prodotto #1

## Stato attuale: MVP+ (Marzo 2026)

Pipeline completa, 10 tipi caso, prompt adattivi per ruolo, few-shot con perizie golden, RAG linee guida, Sentry, E2E tests, health check.

---

## FASE 1 — GO-TO-MARKET (bloccanti per vendere)

| # | Task | Stato | Cosa serve da te |
|---|------|-------|------------------|
| 1.1 | Terms of Service | DA FARE | Testo legale da avvocato → io lo integro come pagina |
| 1.2 | Privacy Policy | DA FARE | Testo legale da avvocato → io lo integro come pagina |
| 1.3 | Stripe pagamenti | DA FARE | Account Stripe + decisioni pricing → io integro checkout/webhook/portal |
| 1.4 | Sentry error tracking | CODICE PRONTO | Crea account su sentry.io, prendi il DSN, mettilo come `NEXT_PUBLIC_SENTRY_DSN` su Vercel |
| 1.5 | Email verification | CODICE PRONTO | Attiva "Confirm email" in Supabase Dashboard → Auth → Settings |
| 1.6 | NEXT_PUBLIC_SITE_URL | DA FARE | Imposta `NEXT_PUBLIC_SITE_URL=https://medlav.vercel.app` in Vercel env vars |
| 1.7 | pgvector + RAG migration | DA FARE | Abilita estensione `vector` su Supabase → esegui SQL migration |
| 1.8 | Pagina pricing | DA FARE | Dipende da 1.3 |

## FASE 2 — QUALITÀ REPORT (differenziante vs Docsy)

| # | Task | Stato | Note |
|---|------|-------|------|
| 2.1 | Perizie golden-reference (few-shot) | FATTO | 8 perizie esempio (4 tipi x CTU/CTP), integrate nei prompt |
| 2.2 | Linee guida cliniche per RAG | FATTO | 6 linee guida (AIOM, SIOT, SIGO, SIAARTI, SNLG, errore diagnostico), pronte per ingestione |
| 2.3 | Few-shot prompting | FATTO | Integrato in buildSynthesisSystemPrompt + buildSummarySystemPrompt |
| 2.4 | Calibrazione su perizie reali | IN ATTESA | Quando avrai perizie reali le uso per affinare tono e struttura |
| 2.5 | Barème SIMLA digitalizzato | OPZIONALE | Libro + data entry |

## FASE 3 — UX PROFESSIONALE

| # | Task | Stato |
|---|------|-------|
| 3.1 | Onboarding wizard | DA FARE |
| 3.2 | Pagina sicurezza/compliance | DA FARE |
| 3.3 | Admin gestione utenti | DA FARE |
| 3.4 | Empty states e skeleton loaders | DA FARE |
| 3.5 | Documentazione utente | DA FARE |

## FASE 4 — SCALABILITÀ E AFFIDABILITÀ

| # | Task | Stato |
|---|------|-------|
| 4.1 | Test E2E Playwright | FATTO (auth + dashboard tests) |
| 4.2 | Health check endpoint | FATTO (/api/health) |
| 4.3 | Sentry integration | FATTO (codice pronto, serve DSN) |
| 4.4 | Backup strategy | DA FARE |
| 4.5 | 2FA/MFA | DA FARE |
| 4.6 | SEO (sitemap, robots.txt, OG tags) | DA FARE |

## FASE 5 — PREMIUM (post-lancio)

| # | Task | Stato | Impatto |
|---|------|-------|---------|
| 5.1 | Moduli RC Auto, Previdenziale, Infortuni | FATTO | 10 tipi caso totali |
| 5.2 | Anonimizzazione documenti | DA FARE | Alto per enterprise |
| 5.3 | Condivisione casi (team/studio) | DA FARE | Alto per studi associati |
| 5.4 | SSO enterprise (OAuth/SAML) | DA FARE | Alto per ospedali |
| 5.5 | Fine-tuning Mistral | DA FARE | 500+ perizie necessarie |
| 5.6 | API pubblica | DA FARE | Alto per B2B |
| 5.7 | Multi-lingua documenti | DA FARE | Medio |

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
