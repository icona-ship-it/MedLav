# Backup Strategy

## Strategia a 2 livelli

LegMed combina due meccanismi complementari per la resilienza dei dati:

1. **PITR Supabase** (in-region): backup continuo nei 7 giorni, granularità al secondo. Protegge da bug applicativi, query errate, soft deletes.
2. **Backup off-site weekly su Cloudflare R2** (out-of-region EU): dump completo del DB ogni domenica. Protegge da outage regionale Supabase, perdita catastrofica account, ransomware Supabase.

**Retention combinata**: ultimi 7 giorni granulari + ultime 12 settimane snapshot.

---

## 1. Supabase Point-in-Time Recovery (PITR)

LegMed utilizza Supabase PostgreSQL (EU, Francoforte) con PITR abilitato.

### Configurazione

- **Piano**: Supabase Pro
- **Retention**: 7 giorni di backup continuo
- **Granularita**: ripristino a qualsiasi secondo negli ultimi 7 giorni
- **Regione**: eu-central-1 (Francoforte, Germania)

### Come Ripristinare

1. Accedere alla [Supabase Dashboard](https://supabase.com/dashboard)
2. Selezionare il progetto LegMed
3. Navigare su **Settings > Database > Backups**
4. Selezionare **Point in Time** e scegliere data/ora desiderata
5. Confermare il ripristino — il database verra riportato allo stato selezionato

> **Attenzione**: il ripristino PITR sovrascrive lo stato corrente del database. Eseguire solo in caso di necessita reale.

### Backup Manuale (Admin)

L'admin puo esportare dati tramite:

- **JSON export**: dall'admin panel, sezione esportazione dati
- **pg_dump**: accesso diretto alla connection string (solo da IP autorizzati)
- **Supabase CLI**: `supabase db dump --project-ref <ref> > backup.sql`

### Cosa e Coperto

| Dato | Backup PITR | Export manuale |
|------|:-----------:|:--------------:|
| Casi e metadati | Si | Si |
| Eventi clinici | Si | Si |
| Report generati | Si | Si |
| Documenti (metadata) | Si | Si |
| File (Storage) | No* | No* |
| Auth users | Si | No |

\* I file su Supabase Storage hanno backup separato gestito da Supabase.

### Frequenza Consigliata

- **PITR**: automatico, continuo (nessuna azione richiesta)
- **Export manuale**: settimanale o prima di operazioni critiche (migrazioni, aggiornamenti schema)

---

## 2. Backup off-site settimanale su Cloudflare R2

Configurato 2026-05-27 (Sprint 1 Production-robust MVP).

### Funzionamento

GitHub Actions schedulato (`weekly-backup.yml`) esegue ogni domenica alle 03:00 UTC:

1. `pg_dump --format=custom --compress=9` del DB Supabase via connection string
2. Upload via S3-compatible API verso bucket Cloudflare R2 EU
3. Cleanup automatico dei backup oltre 12 settimane (3 mesi retention)

**Output naming**: `db/<ISO_TIMESTAMP>.sql.gz` nel bucket R2.

### Setup richiesto (una tantum)

#### Cloudflare R2

1. Login Cloudflare dashboard → R2
2. Create bucket `legmed-backups` (regione EU)
3. Settings → R2 API Tokens → Create API Token
   - Permissions: Object Read & Write
   - TTL: 5 anni
   - Scope: solo bucket `legmed-backups`
4. Salvare: Access Key ID, Secret Access Key, S3 endpoint URL

#### GitHub Secrets

Repository Settings → Secrets and variables → Actions → New repository secret:

| Secret | Valore |
|--------|--------|
| `SUPABASE_DB_URL` | `postgresql://postgres:[PWD]@db.[PROJECT].supabase.co:5432/postgres` (vedi Supabase Settings → Database → Connection string) |
| `R2_ACCESS_KEY` | Access Key ID da Cloudflare R2 |
| `R2_SECRET_KEY` | Secret Access Key da Cloudflare R2 |
| `R2_BUCKET` | `legmed-backups` |
| `R2_ENDPOINT` | URL endpoint visibile in R2 dashboard (es. `https://[account-id].r2.cloudflarestorage.com`) |

#### Test manuale

GitHub UI → Actions → "Weekly DB Backup → R2" → Run workflow (dropdown destra).
Verificare logs: deve completare in <5 min con messaggio "✅ Backup workflow complete".
Verificare R2 dashboard: file `db/<oggi>.sql.gz` presente.

### Procedura di Restore

**Scenario 1: PITR fallisce (caso raro)**

1. Scaricare backup più recente da R2:
   ```bash
   aws s3 cp s3://legmed-backups/db/<latest>.sql.gz . \
     --endpoint-url=https://[account-id].r2.cloudflarestorage.com
   ```
2. Restore su DB Supabase staging:
   ```bash
   pg_restore -d $SUPABASE_STAGING_URL --no-owner --no-privileges <latest>.sql.gz
   ```
3. Verifica integrità dati in staging
4. Se OK, swap staging ↔ production (procedura Supabase dashboard)

**Scenario 2: Outage totale Supabase EU**

1. Provisioning nuovo progetto Supabase EU (anche su region diversa: Stoccolma, Parigi)
2. Update env vars `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` su Vercel
3. Restore backup R2 sul nuovo progetto come Scenario 1
4. RTO stimato: 2-4 ore

### Cosa NON è coperto

- **Supabase Storage files** (PDF documenti, immagini OCR): NON inclusi nel pg_dump.
  - Supabase Storage ha backup automatico interno separato.
  - Per backup off-site dello Storage: richiede script aggiuntivo `rclone sync` dal bucket Storage a R2 (TODO Sprint 2).
- **Auth users**: NON inclusi nel pg_dump (sono in auth.users schema separato).
  - Per ripristino auth da scratch: necessario reset utenti + invio email.

### Monthly restore test (raccomandato)

Per garantire che la procedura funzioni, eseguire ogni mese:

1. Scaricare backup ultima settimana
2. Restore su DB staging dedicato (es. Supabase free tier)
3. Verifica query: COUNT(*) su tabelle principali, ultimo record per timestamp
4. Documentare risultato in `scratchpad/backup-restore-tests.md`

> **Pratica**: scoprire al momento critico che il restore fallisce è troppo tardi. 5 minuti al mese di test valgono ore di disaster recovery.
