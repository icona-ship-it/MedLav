#!/usr/bin/env bash
#
# Weekly off-site backup of Supabase Storage buckets → Cloudflare R2 (or S3).
#
# Flow:
#   1. Download ALL files from buckets (default: documents, signatures —
#      le immagini OCR vivono dentro `documents/ocr-images/`) via
#      scripts/backup-storage.ts (service role key).
#   2. tar.gz dell'intero albero.
#   3. Cifratura gpg SIMMETRICA (AES256) con $BACKUP_PASSPHRASE — i file
#      contengono dati sanitari GDPR Art. 9: MAI caricarli off-site in chiaro.
#   4. Upload su R2: storage/<ISO_TIMESTAMP>.tar.gz.gpg
#   5. Retention: elimina archivi storage/ piu' vecchi di $BACKUP_RETENTION_WEEKS.
#
# Designed to run from GitHub Actions weekly cron. Can be tested locally:
#   SUPABASE_URL="https://xxx.supabase.co" SUPABASE_SERVICE_ROLE_KEY="..." \
#   R2_ACCESS_KEY="..." R2_SECRET_KEY="..." R2_BUCKET="legmed-backups" \
#   R2_ENDPOINT="https://...r2.cloudflarestorage.com" BACKUP_PASSPHRASE="..." \
#   ./scripts/backup-storage.sh
#
# Required env vars:
#   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY — accesso Storage
#   R2_ACCESS_KEY, R2_SECRET_KEY, R2_BUCKET, R2_ENDPOINT — destinazione off-site
#   BACKUP_PASSPHRASE — passphrase gpg simmetrica (conservarla fuori da GitHub!)
#   BACKUP_RETENTION_WEEKS — default 12

set -euo pipefail

# ── Verify env vars ───────────────────────────────────────────────────────────
: "${SUPABASE_URL:?Need SUPABASE_URL}"
: "${SUPABASE_SERVICE_ROLE_KEY:?Need SUPABASE_SERVICE_ROLE_KEY}"
: "${R2_ACCESS_KEY:?Need R2_ACCESS_KEY}"
: "${R2_SECRET_KEY:?Need R2_SECRET_KEY}"
: "${R2_BUCKET:?Need R2_BUCKET}"
: "${R2_ENDPOINT:?Need R2_ENDPOINT}"
: "${BACKUP_PASSPHRASE:?Need BACKUP_PASSPHRASE (gpg symmetric encryption)}"
RETENTION_WEEKS="${BACKUP_RETENTION_WEEKS:-12}"

# ── Verify tools ──────────────────────────────────────────────────────────────
command -v aws >/dev/null 2>&1 || { echo "ERROR: aws CLI not installed"; exit 1; }
command -v gpg >/dev/null 2>&1 || { echo "ERROR: gpg not installed"; exit 1; }
command -v pnpm >/dev/null 2>&1 || { echo "ERROR: pnpm not installed (needed for tsx)"; exit 1; }

TIMESTAMP=$(date -u +"%Y-%m-%dT%H-%M-%SZ")
WORK_DIR=$(mktemp -d)
DOWNLOAD_DIR="${WORK_DIR}/files"
ARCHIVE="${WORK_DIR}/legmed_storage_${TIMESTAMP}.tar.gz"
ENCRYPTED="${ARCHIVE}.gpg"

cleanup() {
  rm -rf "${WORK_DIR}"
}
trap cleanup EXIT

# ── 1. Download all bucket files ──────────────────────────────────────────────
echo "Downloading Storage buckets..."
mkdir -p "${DOWNLOAD_DIR}"
BACKUP_DIR="${DOWNLOAD_DIR}" pnpm exec tsx scripts/backup-storage.ts

# ── 2. Archive ────────────────────────────────────────────────────────────────
echo "Creating archive..."
tar -czf "${ARCHIVE}" -C "${DOWNLOAD_DIR}" .
ARCHIVE_SIZE=$(du -h "${ARCHIVE}" | cut -f1)
echo "Archive created: ${ARCHIVE_SIZE}"

# ── 3. Encrypt (gpg symmetric AES256 — GDPR Art. 9 data) ─────────────────────
echo "Encrypting archive (gpg symmetric AES256)..."
gpg --batch --yes --symmetric \
  --cipher-algo AES256 \
  --pinentry-mode loopback \
  --passphrase "${BACKUP_PASSPHRASE}" \
  --output "${ENCRYPTED}" \
  "${ARCHIVE}"
rm -f "${ARCHIVE}"

# ── 4. Upload to R2 (S3-compatible API) ───────────────────────────────────────
export AWS_ACCESS_KEY_ID="${R2_ACCESS_KEY}"
export AWS_SECRET_ACCESS_KEY="${R2_SECRET_KEY}"
export AWS_DEFAULT_REGION=auto # R2 ignora region

REMOTE_PATH="storage/${TIMESTAMP}.tar.gz.gpg"
echo "Uploading to R2: s3://${R2_BUCKET}/${REMOTE_PATH}"
aws s3 cp "${ENCRYPTED}" "s3://${R2_BUCKET}/${REMOTE_PATH}" \
  --endpoint-url="${R2_ENDPOINT}" \
  --no-progress
echo "Upload complete"

# ── 5. Retention: delete storage archives older than RETENTION_WEEKS ─────────
echo "Pruning storage backups older than ${RETENTION_WEEKS} weeks..."
CUTOFF_DATE=$(date -u -d "${RETENTION_WEEKS} weeks ago" +"%Y-%m-%dT" 2>/dev/null \
              || date -u -v "-${RETENTION_WEEKS}w" +"%Y-%m-%dT")

aws s3 ls "s3://${R2_BUCKET}/storage/" --endpoint-url="${R2_ENDPOINT}" 2>/dev/null \
  | awk '{print $4}' \
  | while read -r OLD_FILE; do
    if [[ -n "${OLD_FILE}" ]] && [[ "${OLD_FILE}" < "${CUTOFF_DATE}" ]]; then
      echo "  Deleting old storage backup: ${OLD_FILE}"
      aws s3 rm "s3://${R2_BUCKET}/storage/${OLD_FILE}" \
        --endpoint-url="${R2_ENDPOINT}" \
        --no-progress
    fi
  done

echo "Storage backup workflow complete — ${TIMESTAMP}"
