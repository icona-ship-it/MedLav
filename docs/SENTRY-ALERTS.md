# Sentry Alerts — MedLav Production

Documento procedurale per la configurazione manuale delle alert rules su Sentry.io (org `edo-montagna`, project `javascript-nextjs`).

> **Stato**: queste alert rules vanno configurate **manualmente** nella dashboard Sentry. La configurazione via SDK non è supportata. Documento aggiornato post-deploy ogni volta che si modificano le regole.

## Filtri custom disponibili

Il codice usa `withSentryTags` (`src/lib/sentry-context.ts`) per aggiungere tag a ogni errore. Filtri usabili in Sentry queries:

| Tag | Valore | Uso |
|-----|--------|-----|
| `case_hash` | SHA-256[:8] del caseId | Filtrare errori per caso specifico |
| `user_hash` | SHA-256[:8] dello userId | Filtrare errori per utente specifico |
| `pipeline_mode` | `full` / `extraction_only` / `expenses_only` / `anonymize_only` | Errori per tipo elaborazione |
| `step` | Nome step Inngest | Errori per fase pipeline |
| `module` | `synthesis` / `extraction` / `ocr` / `transcription` / etc. | Errori per modulo |

## Alert rules da configurare

### 1. Error rate spike (CRITICAL)

**Soglia**: > 5% degli eventi in 5 minuti con `level:error`
**Azione**: 
- Email a `privacy@legmed.it` (DPO + tech)
- Slack webhook su `#incidents` (se configurato)
**Severità**: Critical
**Rationale**: spike improvviso = bug appena deployato o servizio downstream giù

### 2. Pipeline failure (HIGH)

**Filtro query**: `module:synthesis OR module:extraction OR step:* level:error`
**Soglia**: ≥ 3 errori in 10 minuti con stesso `step`
**Azione**: email + Slack
**Severità**: High
**Rationale**: pipeline rotta blocca produzione report — periti non possono lavorare

### 3. PDF generation failure (MEDIUM)

**Filtro query**: `module:pdf-generator level:error`
**Soglia**: ≥ 5 errori in 30 minuti
**Azione**: email
**Severità**: Medium
**Rationale**: feature recente (Puppeteer), può degradare per ragioni memoria/timeout

### 4. Auth errors spike (HIGH)

**Filtro query**: URL contains `/login` OR `/auth/` `level:warning`
**Soglia**: > 50 errori auth in 10 minuti (potenziale brute force)
**Azione**: email + Slack immediato
**Severità**: High
**Rationale**: attacco credential stuffing / brute force in corso

### 5. Mistral API down (HIGH)

**Filtro query**: `error.type:MistralAPIError OR message:"circuit OPEN"`
**Soglia**: ≥ 1 evento `Circuit OPEN`
**Azione**: email + Slack
**Severità**: High
**Rationale**: Mistral fuori servizio → pipeline ferma, periti vedono solo errori

### 6. Storage upload failure (MEDIUM)

**Filtro query**: `module:document-validation OR module:storage level:error`
**Soglia**: ≥ 10 errori in 30 minuti
**Azione**: email
**Severità**: Medium
**Rationale**: problema Supabase Storage region → upload bloccati

### 7. Stripe webhook failure (HIGH)

**Filtro query**: URL contains `/api/stripe/webhook` `level:error`
**Soglia**: ≥ 1 errore
**Azione**: email immediato a `billing@legmed.it`
**Severità**: High
**Rationale**: pagamento non processato = perdita revenue + utente confuso

## Procedura configurazione (manuale)

1. Login: https://de.sentry.io/organizations/edo-montagna/
2. Project: `javascript-nextjs`
3. Sidebar → **Alerts** → **Create Alert**
4. Tipo: **Issue Alert** (per condition-based) o **Metric Alert** (per rate-based)
5. Configurare condizioni come da tabella sopra
6. Action: aggiungere notifica email + Slack workspace
7. Salvare e testare con errore artificiale

### Test fire (verifica alert funzioni)

In `src/app/api/health/route.ts` (o equivalente) aggiungere temporaneamente:
```ts
Sentry.captureException(new Error('Sentry alert test — ignore'));
```
Deploy → attendere ~1 minuto → verificare che notifica arrivi a email/Slack.
Rimuovere il test dal codice immediatamente dopo.

## Slack webhook setup

Se non configurato:
1. Crea Slack channel `#legmed-incidents` (privato, accesso DPO + tech)
2. Slack → App Directory → cerca "Sentry" → installa
3. In Sentry project Settings → Integrations → Slack → Connect workspace
4. Per ogni alert rule, sezione "Actions" → Aggiungi "Send notification to Slack" → seleziona `#legmed-incidents`

## Email distribution list

Lista email per notifiche alert:
- `privacy@legmed.it` (DPO + Sicurezza)
- `dev@legmed.it` (tech)
- `oncall@legmed.it` (rotazione on-call, se applicabile)

Aggiungere come "Team Members" nel Sentry project Settings → Membership.

## Roadmap evoluzione

- **v1 (ora)**: alert manuali in Sentry dashboard, notifica email/Slack
- **v2**: automated rollback Vercel su error rate spike (webhook → script)
- **v3**: Sentry session replay per debug visivo (richiede consenso utente per GDPR)
- **v4**: integration PagerDuty per on-call rotation H24

## Audit log

| Data | Cambio | Autore |
|------|--------|--------|
| 2026-05-27 | Documento creato (Sprint 1.4) | Claude + edo |

---

**Nota**: aggiornare questo documento dopo OGNI modifica alle regole alert. Niente "tribal knowledge" — tutto tracciato qui.
