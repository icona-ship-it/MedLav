# MedLav — Roadmap verso il prodotto #1

## Stato attuale: MVP funzionale (Marzo 2026)

Pipeline completa, prompt adattivi per ruolo/tipo, RAG, GDPR compliance base.

---

## FASE 1 — GO-TO-MARKET (bloccanti per vendere)

| # | Task | Stato | Dipende da |
|---|------|-------|------------|
| 1.1 | Terms of Service (testo legale) | DA FARE | Avvocato |
| 1.2 | Privacy Policy (testo legale) | DA FARE | Avvocato |
| 1.3 | Stripe pagamenti (checkout, webhook, billing portal) | DA FARE | Account Stripe + pricing |
| 1.4 | Sentry error tracking | DA FARE | Account Sentry |
| 1.5 | Attivare email verification su Supabase | DA FARE | Dashboard Supabase |
| 1.6 | NEXT_PUBLIC_SITE_URL in env Vercel | DA FARE | Dashboard Vercel |
| 1.7 | pgvector + migration RAG su Supabase | DA FARE | Dashboard Supabase |
| 1.8 | Pagina pricing pubblica | DA FARE | 1.3 |

## FASE 2 — QUALITÀ REPORT (differenziante vs Docsy)

| # | Task | Stato | Dipende da |
|---|------|-------|------------|
| 2.1 | Calibrazione prompt su perizie reali (10-20 esempi) | DA FARE | Perizie da medici legali |
| 2.2 | Caricare linee guida nel RAG (AIOM, SIOT, SIAARTI, SIGO) | DA FARE | 1.7 |
| 2.3 | Few-shot prompting con esempi di perizie reali | DA FARE | 2.1 |
| 2.4 | Barème SIMLA digitalizzato (voci principali) | OPZIONALE | Libro + data entry |

## FASE 3 — UX PROFESSIONALE

| # | Task | Stato |
|---|------|-------|
| 3.1 | Onboarding wizard per nuovi utenti | DA FARE |
| 3.2 | Pagina sicurezza/compliance pubblica | DA FARE |
| 3.3 | Admin: gestione utenti (disabilita, reset password) | DA FARE |
| 3.4 | Empty states e skeleton loaders su tutte le pagine | DA FARE |
| 3.5 | Documentazione utente (guide d'uso per medici legali) | DA FARE |

## FASE 4 — SCALABILITÀ E AFFIDABILITÀ

| # | Task | Stato |
|---|------|-------|
| 4.1 | Test E2E con Playwright (workflow critico completo) | DA FARE |
| 4.2 | Monitoraggio e alerting (Vercel Analytics, uptime check) | DA FARE |
| 4.3 | Backup strategy documentata | DA FARE |
| 4.4 | 2FA/MFA per utenti | DA FARE |
| 4.5 | SEO: sitemap, robots.txt, Open Graph tags | DA FARE |

## FASE 5 — PREMIUM (post-lancio, differenziante)

| # | Task | Impatto |
|---|------|---------|
| 5.1 | Anonimizzazione automatica documenti | Alto per enterprise |
| 5.2 | Condivisione casi tra utenti (team/studio) | Alto per studi associati |
| 5.3 | SSO enterprise (OAuth/SAML) | Alto per ospedali/assicurazioni |
| 5.4 | Moduli specializzati aggiuntivi (RC Auto, Previdenziale, Infortuni) | Molto alto (come Docsy) |
| 5.5 | Fine-tuning modello Mistral su perizie reali | Alto (500+ perizie necessarie) |
| 5.6 | API pubblica per integrazioni (studi legali, assicurazioni) | Alto per B2B |
| 5.7 | Multi-lingua (documenti in altre lingue → report in italiano) | Medio |
| 5.8 | Mobile app (React Native o PWA) | Medio |

## FASE 6 — NUMERO 1 (visione a lungo termine)

| # | Obiettivo | Come |
|---|-----------|------|
| 6.1 | Certificazione ISO 27001 | Audit esterno + compliance |
| 6.2 | Penetration testing esterno | Azienda specializzata |
| 6.3 | Partnership con società medico-legali (SIMLA, AIMEF) | Business development |
| 6.4 | Feedback loop intelligente (quality flywheel) | ML sui pattern di correzione utente |
| 6.5 | Barème completo + calcolo automatico danno biologico | Data entry + integrazione prompt |
| 6.6 | Integrazione tribunali (PCT - Processo Civile Telematico) | Partnership istituzionale |
| 6.7 | White-label per assicurazioni | Multi-tenant avanzato |

---

## Metriche di successo

- **Report quality**: >90% utilizzabile senza modifiche significative (da validare con utenti reali)
- **Tempo generazione**: <5 minuti per caso medio (20-50 pagine)
- **Uptime**: >99.5%
- **NPS**: >50 (da primo survey utenti)
- **Churn mensile**: <5%
