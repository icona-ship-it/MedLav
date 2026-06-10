# Backup Strategy

> **Ultimo aggiornamento: 2026-06-10** — questa pagina riflette lo stato REALE.
> Storia: il workflow off-site era stato spostato in `scripts/weekly-backup.yml.template`
> (nessun cron attivo dal commit `4243ade` fino al 2026-06-10). Ora il workflow e' di nuovo
> in `.github/workflows/weekly-backup.yml`, esteso con il backup dei file Storage.

## Stato attuale (cosa e' attivo e cosa no)

| Componente | Stato | Note |
|------------|-------|------|
| PITR Supabase (7 giorni, in-region) | **ATTIVO** | Gestito da Supabase Pro, nessuna azione |
| Workflow `.github/workflows/weekly-backup.yml` | **PRESENTE nel repo** | Gira ogni domenica 03:00 UTC **solo se i secrets sono configurati** (vedi sotto). Senza secrets il run FALLISCE (fail-loud, per scelta) |
| Backup DB off-site (pg_dump → R2) | RICHIEDE SECRETS | `scripts/backup-db.sh` — cifratura gpg opzionale ma raccomandata (`BACKUP_PASSPHRASE`) |
| Backup Storage off-site (PDF, immagini OCR, firme) | RICHIEDE SECRETS | `scripts/backup-storage.sh` + `scripts/backup-storage.ts` — tar.gz **sempre cifrato** gpg AES256 |
| Test di restore | **MAI ESEGUITO** | Log in `scratchpad/backup-restore-tests.md` — da compilare al primo test |

### Azioni richieste per attivare il backup off-site (una tantum, ~30 min)

1. Creare bucket R2 e API token (vedi "Setup Cloudflare R2" sotto)
2. Configurare gli 8 GitHub Secrets (tabella sotto)
3. Lanciare manualmente il workflow (Actions → "Weekly Off-site Backup" → Run workflow) e verificare il successo
4. Eseguire un **test di restore** e loggarlo in `scratchpad/backup-restore-tests.md`

---

## Strategia a 2 livelli

1. **PITR Supabase** (in-region): backup continuo nei 7 giorni, granularita' al secondo. Protegge da bug applicativi, query errate, soft deletes.
2. **Backup off-site weekly su Cloudflare R2** (out-of-region EU): dump completo del DB + archivio completo dei file Storage ogni domenica. Protegge da outage regionale Supabase, perdita catastrofica account, ransomware.

**Retention combinata**: ultimi 7 giorni granulari (PITR) + ultime 12 settimane snapshot (R2).

---

## 1. Supabase Point-in-Time Recovery (PITR)

- **Piano**: Supabase Pro — **Retention**: 7 giorni — **Regione**: eu-central-1 (Francoforte)

### Come Ripristinare

1. Supabase Dashboard → progetto LegMed → **Settings > Database > Backups**
2. **Point in Time** → scegliere data/ora → confermare

> **Attenzione**: il ripristino PITR sovrascrive lo stato corrente del database.

### Cosa copre il PITR

| Dato | PITR |
|------|:----:|
| Casi, eventi, report, anomalie, metadata documenti | Si |
| Auth users | Si |
| File Storage (PDF, immagini OCR, firme) | No — coperti SOLO dal backup off-site R2 |

---

## 2. Backup off-site settimanale su Cloudflare R2

Workflow: `.github/workflows/weekly-backup.yml` — cron domenica 03:00 UTC + dispatch manuale.

### Cosa fa

1. **DB**: `pg_dump --format=custom --compress=9` → (opzionale ma raccomandato) cifratura gpg AES256 → upload `db/<ISO_TIMESTAMP>.sql.gz[.gpg]`
2. **Storage**: download completo dei bucket `documents` (incluse le immagini OCR in `documents/ocr-images/`) e `signatures` via service role key → `tar.gz` → cifratura gpg simmetrica AES256 (**obbligatoria**, dati GDPR Art. 9) → upload `storage/<ISO_TIMESTAMP>.tar.gz.gpg`
3. **Retention**: cancellazione automatica degli archivi oltre 12 settimane (prefissi `db/` e `storage/`)

### Setup Cloudflare R2 (una tantum)

1. Cloudflare dashboard → R2 → Create bucket `legmed-backups` (location EU)
2. R2 API Tokens → Create API Token — Permissions: Object Read & Write, scope: solo `legmed-backups`
3. Salvare Access Key ID, Secret Access Key, S3 endpoint URL

### GitHub Secrets richiesti

Repository Settings → Secrets and variables → Actions:

| Secret | Valore |
|--------|--------|
| `SUPABASE_DB_URL` | `postgresql://postgres:[PWD]@db.[PROJECT].supabase.co:5432/postgres` (Supabase → Settings → Database → Connection string; usare il Session pooler se l'accesso diretto e' chiuso) |
| `SUPABASE_URL` | `https://[project-ref].supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key (Settings → API) — serve per scaricare i bucket privati |
| `R2_ACCESS_KEY` | Access Key ID da Cloudflare R2 |
| `R2_SECRET_KEY` | Secret Access Key da Cloudflare R2 |
| `R2_BUCKET` | `legmed-backups` |
| `R2_ENDPOINT` | `https://[account-id].r2.cloudflarestorage.com` |
| `BACKUP_PASSPHRASE` | Passphrase gpg lunga e casuale. **Conservarla anche FUORI da GitHub** (password manager): senza passphrase i backup cifrati sono irrecuperabili |

### Primo test manuale

GitHub UI → Actions → "Weekly Off-site Backup (DB + Storage)" → Run workflow.
Verificare: job verde, su R2 presenti `db/<oggi>...` e `storage/<oggi>.tar.gz.gpg`.

---

## 3. Procedura di Restore (passo-passo)

### 3a. Restore del DATABASE da R2

1. Scaricare il backup piu' recente:
   ```bash
   export AWS_ACCESS_KEY_ID=<R2_ACCESS_KEY> AWS_SECRET_ACCESS_KEY=<R2_SECRET_KEY>
   aws s3 ls s3://legmed-backups/db/ --endpoint-url=https://<account-id>.r2.cloudflarestorage.com
   aws s3 cp s3://legmed-backups/db/<latest> . --endpoint-url=https://<account-id>.r2.cloudflarestorage.com
   ```
2. Se cifrato (`.gpg`), decifrare:
   ```bash
   gpg --batch --decrypt --pinentry-mode loopback \
     --passphrase "<BACKUP_PASSPHRASE>" \
     --output backup.dump <latest>.gpg
   ```
3. Restore su un DB Supabase di test/staging (MAI direttamente su production senza verifica):
   ```bash
   pg_restore -d "$SUPABASE_STAGING_URL" --no-owner --no-privileges backup.dump
   ```
4. Verifica integrita': `SELECT COUNT(*)` su `cases`, `events`, `reports`, `documents`; controllare il record piu' recente per `created_at`
5. Solo se OK → ripetere su production (o swap del progetto)

### 3b. Restore dei FILE STORAGE da R2

1. Scaricare e decifrare:
   ```bash
   aws s3 cp s3://legmed-backups/storage/<latest>.tar.gz.gpg . --endpoint-url=...
   gpg --batch --decrypt --pinentry-mode loopback \
     --passphrase "<BACKUP_PASSPHRASE>" \
     --output storage.tar.gz <latest>.tar.gz.gpg
   mkdir restore && tar -xzf storage.tar.gz -C restore
   ```
2. La struttura e' `restore/<bucket>/<path>` (es. `restore/documents/ocr-images/...`)
3. Ri-upload sul progetto Supabase di destinazione (script una-tantum con service role key, `supabase.storage.from(bucket).upload(path, file)` — rispettare gli stessi path, i record `documents.storage_path` e `pages.image_path` nel DB li referenziano)

### 3c. Scenario: outage totale Supabase EU

1. Provisioning nuovo progetto Supabase EU (regione diversa: Stoccolma, Parigi)
2. Restore DB (3a) + Storage (3b) sul nuovo progetto
3. Update env vars su Vercel: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL`
4. Auth users: NON inclusi nel pg_dump (schema `auth` separato) → reset utenti + email di re-invito
5. RTO stimato: 2-4 ore (**stima MAI verificata** — vedi test di restore)

### Limiti noti

- **Auth users** non inclusi nel dump (schema `auth.users` separato): dopo un disaster recovery completo serve il re-invito degli utenti
- La cifratura e' simmetrica: la **passphrase e' un single point of failure** — conservarla in almeno 2 posti sicuri
- Il backup Storage scarica tutti i file a ogni run (no incrementale): con molti GB il job si allunga — rivalutare `rclone sync` incrementale oltre ~10 GB

---

## 4. Test di restore (mensile, obbligatorio)

Per garantire che la procedura funzioni, eseguire ogni mese un restore di prova:

1. Scaricare il backup dell'ultima settimana (DB + storage)
2. Restore su un DB di test (es. progetto Supabase free tier dedicato)
3. Verifiche: `COUNT(*)` su tabelle principali; ultimo record per timestamp; aprire 1 PDF e 1 immagine OCR estratti dall'archivio storage
4. **Documentare il risultato in `scratchpad/backup-restore-tests.md`** (template gia' pronto)

> Scoprire al momento critico che il restore fallisce e' troppo tardi. 15 minuti al mese valgono ore di disaster recovery.

### Restore test log

| Data | Esito | Note |
|------|-------|------|
| _nessun test eseguito finora_ | — | compilare al primo test (vedi `scratchpad/backup-restore-tests.md`) |
