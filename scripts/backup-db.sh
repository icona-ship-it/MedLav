#!/usr/bin/env bash
#
# Weekly off-site backup of Supabase PostgreSQL → Cloudflare R2 (or S3).
#
# Designed to run from GitHub Actions weekly cron. Can be tested locally:
#   SUPABASE_DB_URL="postgresql://..." R2_ACCESS_KEY="..." R2_SECRET_KEY="..." \
#   R2_BUCKET="legmed-backups" R2_ENDPOINT="https://...r2.cloudflarestorage.com" \
#   ./scripts/backup-db.sh
#
# Required env vars:
#   SUPABASE_DB_URL   — connection string (postgresql://postgres:xxx@host:5432/postgres)
#   R2_ACCESS_KEY     — Cloudflare R2 access key
#   R2_SECRET_KEY     — Cloudflare R2 secret key
#   R2_BUCKET         — bucket name (es. "legmed-backups")
#   R2_ENDPOINT       — bucket endpoint URL (visible in R2 dashboard)
#   BACKUP_RETENTION_WEEKS — default 12 (3 mesi); rimuovi backup piu' vecchi
#
# Optional env vars:
#   BACKUP_PASSPHRASE — se presente, il dump viene cifrato con gpg simmetrico
#                       (AES256) prima dell'upload (consigliato: GDPR Art. 9).
#                       Output diventa db/<ISO_DATE>.sql.gz.gpg
#
# Output: db/<ISO_DATE>.sql.gz (o .sql.gz.gpg) uploaded a $R2_BUCKET/db/

set -euo pipefail

# ── Verify env vars ───────────────────────────────────────────────────────────
: "${SUPABASE_DB_URL:?Need SUPABASE_DB_URL}"
: "${R2_ACCESS_KEY:?Need R2_ACCESS_KEY}"
: "${R2_SECRET_KEY:?Need R2_SECRET_KEY}"
: "${R2_BUCKET:?Need R2_BUCKET}"
: "${R2_ENDPOINT:?Need R2_ENDPOINT}"
RETENTION_WEEKS="${BACKUP_RETENTION_WEEKS:-12}"

# ── Verify tools ──────────────────────────────────────────────────────────────
command -v pg_dump >/dev/null 2>&1 || { echo "ERROR: pg_dump not installed"; exit 1; }
command -v aws >/dev/null 2>&1 || { echo "ERROR: aws CLI not installed (used for R2 S3-compat)"; exit 1; }

# ── Backup ────────────────────────────────────────────────────────────────────
TIMESTAMP=$(date -u +"%Y-%m-%dT%H-%M-%SZ")
BACKUP_FILE="/tmp/legmed_db_${TIMESTAMP}.sql.gz"

echo "📦 Starting backup: ${TIMESTAMP}"
echo "📂 Dumping to: ${BACKUP_FILE}"

# pg_dump con compressione gzip stream — non occupa spazio extra
pg_dump "${SUPABASE_DB_URL}" \
  --no-owner \
  --no-privileges \
  --quote-all-identifiers \
  --compress=9 \
  --format=custom \
  --file="${BACKUP_FILE}"

DUMP_SIZE=$(du -h "${BACKUP_FILE}" | cut -f1)
echo "✅ Dump complete: ${DUMP_SIZE}"

# ── Integrity smoke test — il dump deve essere LEGGIBILE e non troncato PRIMA di
#    cifrarlo/caricarlo. Un backup corrotto scoperto al disastro è peggio di
#    nessun backup. (fail-loud)
DUMP_BYTES=$(wc -c < "${BACKUP_FILE}")
MIN_BYTES="${BACKUP_MIN_BYTES:-10240}"   # 10KB: un dump reale è molto più grande
if [[ "${DUMP_BYTES}" -lt "${MIN_BYTES}" ]]; then
  echo "ERROR: dump troppo piccolo (${DUMP_BYTES} byte < ${MIN_BYTES}) — probabile troncamento"; exit 1
fi
if ! pg_restore --list "${BACKUP_FILE}" >/dev/null 2>&1; then
  echo "ERROR: pg_restore --list fallito — dump non leggibile (corrotto/troncato)"; exit 1
fi
TABLE_COUNT=$(pg_restore --list "${BACKUP_FILE}" 2>/dev/null | grep -c "TABLE DATA" || true)
echo "🔎 Smoke test OK: dump leggibile, ${TABLE_COUNT} tabelle con dati"

# ── Companion dump di auth.users (id,email,created_at) ────────────────────────
# pg_dump del solo schema public NON include auth.users, ma cases.user_id vi fa
# riferimento (ownership RLS). Senza questa mappatura, dopo un restore in un
# progetto nuovo i casi restano orfani. La salviamo a parte (cifrata come il DB).
command -v psql >/dev/null 2>&1 || { echo "ERROR: psql non installato (serve per il dump auth.users)"; exit 1; }
AUTH_FILE="/tmp/legmed_auth_users_${TIMESTAMP}.csv"
psql "${SUPABASE_DB_URL}" -v ON_ERROR_STOP=1 -c \
  "\copy (select id, email, created_at from auth.users order by created_at) to '${AUTH_FILE}' csv header"
AUTH_ROWS=$(( $(wc -l < "${AUTH_FILE}") - 1 ))
echo "👥 auth.users esportati: ${AUTH_ROWS} righe"

# ── Optional: encrypt dump (gpg symmetric AES256 — GDPR Art. 9 data) ─────────
REMOTE_SUFFIX=""
if [[ -n "${BACKUP_PASSPHRASE:-}" ]]; then
  command -v gpg >/dev/null 2>&1 || { echo "ERROR: gpg not installed but BACKUP_PASSPHRASE is set"; exit 1; }
  echo "🔐 Encrypting dump (gpg symmetric AES256)..."
  gpg --batch --yes --symmetric \
    --cipher-algo AES256 \
    --pinentry-mode loopback \
    --passphrase "${BACKUP_PASSPHRASE}" \
    --output "${BACKUP_FILE}.gpg" \
    "${BACKUP_FILE}"
  rm -f "${BACKUP_FILE}"
  BACKUP_FILE="${BACKUP_FILE}.gpg"
  REMOTE_SUFFIX=".gpg"
fi

# ── Upload to R2 (S3-compatible API) ──────────────────────────────────────────
export AWS_ACCESS_KEY_ID="${R2_ACCESS_KEY}"
export AWS_SECRET_ACCESS_KEY="${R2_SECRET_KEY}"
export AWS_DEFAULT_REGION=auto  # R2 ignora region

REMOTE_PATH="db/${TIMESTAMP}.sql.gz${REMOTE_SUFFIX}"
echo "☁️  Uploading to R2: s3://${R2_BUCKET}/${REMOTE_PATH}"

aws s3 cp "${BACKUP_FILE}" "s3://${R2_BUCKET}/${REMOTE_PATH}" \
  --endpoint-url="${R2_ENDPOINT}" \
  --no-progress

echo "✅ Upload complete"

# ── auth.users companion: cifra (se passphrase presente) e carica accanto al DB
AUTH_SUFFIX=""
if [[ -n "${BACKUP_PASSPHRASE:-}" ]]; then
  gpg --batch --yes --symmetric --cipher-algo AES256 --pinentry-mode loopback \
    --passphrase "${BACKUP_PASSPHRASE}" --output "${AUTH_FILE}.gpg" "${AUTH_FILE}"
  rm -f "${AUTH_FILE}"
  AUTH_FILE="${AUTH_FILE}.gpg"
  AUTH_SUFFIX=".gpg"
fi
AUTH_REMOTE="db/auth-users/${TIMESTAMP}.csv${AUTH_SUFFIX}"
echo "☁️  Uploading auth.users: s3://${R2_BUCKET}/${AUTH_REMOTE}"
aws s3 cp "${AUTH_FILE}" "s3://${R2_BUCKET}/${AUTH_REMOTE}" \
  --endpoint-url="${R2_ENDPOINT}" \
  --no-progress
rm -f "${AUTH_FILE}"
echo "✅ auth.users upload complete"

# ── Cleanup local file ────────────────────────────────────────────────────────
rm -f "${BACKUP_FILE}"

# ── Retention: delete backups older than RETENTION_WEEKS settimane ────────────
echo "🧹 Pruning backups older than ${RETENTION_WEEKS} weeks..."

CUTOFF_DATE=$(date -u -d "${RETENTION_WEEKS} weeks ago" +"%Y-%m-%dT" 2>/dev/null \
              || date -u -v "-${RETENTION_WEEKS}w" +"%Y-%m-%dT")

# List backups in R2 db/ prefix, delete those before cutoff
aws s3 ls "s3://${R2_BUCKET}/db/" --endpoint-url="${R2_ENDPOINT}" 2>/dev/null \
  | awk '{print $4}' \
  | while read -r OLD_FILE; do
    if [[ -n "${OLD_FILE}" ]] && [[ "${OLD_FILE}" < "${CUTOFF_DATE}" ]]; then
      echo "  🗑️  Deleting old backup: ${OLD_FILE}"
      aws s3 rm "s3://${R2_BUCKET}/db/${OLD_FILE}" \
        --endpoint-url="${R2_ENDPOINT}" \
        --no-progress
    fi
  done

echo "✅ Backup workflow complete — ${TIMESTAMP}"
