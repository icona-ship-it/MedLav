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
# Output: backup_<ISO_DATE>.sql.gz uploaded a $R2_BUCKET/db/

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

# ── Upload to R2 (S3-compatible API) ──────────────────────────────────────────
export AWS_ACCESS_KEY_ID="${R2_ACCESS_KEY}"
export AWS_SECRET_ACCESS_KEY="${R2_SECRET_KEY}"
export AWS_DEFAULT_REGION=auto  # R2 ignora region

REMOTE_PATH="db/${TIMESTAMP}.sql.gz"
echo "☁️  Uploading to R2: s3://${R2_BUCKET}/${REMOTE_PATH}"

aws s3 cp "${BACKUP_FILE}" "s3://${R2_BUCKET}/${REMOTE_PATH}" \
  --endpoint-url="${R2_ENDPOINT}" \
  --no-progress

echo "✅ Upload complete"

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
