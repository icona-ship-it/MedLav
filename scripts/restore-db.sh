#!/usr/bin/env bash
#
# Restore di un backup off-site (Cloudflare R2) in un database TARGET — per il
# DR drill della Fase 3 del piano di uscita. Scarica l'ultimo dump (o quello
# indicato), lo decifra, lo ripristina e verifica i conteggi delle tabelle
# chiave + la coerenza con auth.users.
#
# ⚠️  ESEGUIRE SOLO SU STAGING / progetto usa-e-getta. Il restore SOVRASCRIVE il
#     target (pg_restore --clean). Guardie esplicite sotto per non colpire prod.
#
# Uso tipico:
#   RESTORE_DB_URL="postgresql://...staging..." \
#   R2_ACCESS_KEY=... R2_SECRET_KEY=... R2_BUCKET=legmed-backups \
#   R2_ENDPOINT="https://...r2.cloudflarestorage.com" \
#   BACKUP_PASSPHRASE=... \
#   I_UNDERSTAND_THIS_OVERWRITES=yes \
#   ./scripts/restore-db.sh            # usa l'ultimo backup
#   ./scripts/restore-db.sh db/2026-07-07T03-00-00Z.sql.gz.gpg   # backup specifico
#
# Env richieste:
#   RESTORE_DB_URL   — connection string del TARGET (staging!)
#   R2_ACCESS_KEY / R2_SECRET_KEY / R2_BUCKET / R2_ENDPOINT — come backup-db.sh
#   I_UNDERSTAND_THIS_OVERWRITES=yes — conferma esplicita (il restore è distruttivo)
# Env opzionali:
#   BACKUP_PASSPHRASE — se il dump è cifrato (.gpg)
#   PROD_DB_HOST_BLOCKLIST — host (o sottostringa) del DB di PROD: se RESTORE_DB_URL
#                            lo contiene, lo script ABORTA (rete di sicurezza)

set -euo pipefail

: "${RESTORE_DB_URL:?Need RESTORE_DB_URL (il TARGET di staging)}"
: "${R2_ACCESS_KEY:?Need R2_ACCESS_KEY}"
: "${R2_SECRET_KEY:?Need R2_SECRET_KEY}"
: "${R2_BUCKET:?Need R2_BUCKET}"
: "${R2_ENDPOINT:?Need R2_ENDPOINT}"

# ── Guardie anti-prod ─────────────────────────────────────────────────────────
if [[ "${I_UNDERSTAND_THIS_OVERWRITES:-}" != "yes" ]]; then
  echo "ERROR: il restore SOVRASCRIVE il target. Imposta I_UNDERSTAND_THIS_OVERWRITES=yes per confermare."; exit 1
fi
if [[ -n "${PROD_DB_HOST_BLOCKLIST:-}" ]] && [[ "${RESTORE_DB_URL}" == *"${PROD_DB_HOST_BLOCKLIST}"* ]]; then
  echo "ERROR: RESTORE_DB_URL contiene l'host di PROD (${PROD_DB_HOST_BLOCKLIST}). Restore ANNULLATO."; exit 1
fi
TARGET_HOST=$(echo "${RESTORE_DB_URL}" | sed -E 's#.*@([^:/]+).*#\1#')
echo "🎯 Target del restore: ${TARGET_HOST}"
echo "    (sovrascrittura tra 5s — Ctrl-C per annullare)"
sleep 5

command -v aws >/dev/null 2>&1 || { echo "ERROR: aws CLI non installato"; exit 1; }
command -v pg_restore >/dev/null 2>&1 || { echo "ERROR: pg_restore non installato"; exit 1; }
command -v psql >/dev/null 2>&1 || { echo "ERROR: psql non installato"; exit 1; }

export AWS_ACCESS_KEY_ID="${R2_ACCESS_KEY}"
export AWS_SECRET_ACCESS_KEY="${R2_SECRET_KEY}"
export AWS_DEFAULT_REGION=auto

# ── Individua il backup (arg esplicito o l'ultimo db/*.sql.gz*) ────────────────
REMOTE_KEY="${1:-}"
if [[ -z "${REMOTE_KEY}" ]]; then
  REMOTE_KEY="db/$(aws s3 ls "s3://${R2_BUCKET}/db/" --endpoint-url="${R2_ENDPOINT}" \
    | awk '{print $4}' | grep -E '\.sql\.gz(\.gpg)?$' | sort | tail -1)"
fi
[[ -n "${REMOTE_KEY}" && "${REMOTE_KEY}" != "db/" ]] || { echo "ERROR: nessun backup trovato in s3://${R2_BUCKET}/db/"; exit 1; }
echo "📥 Backup selezionato: ${REMOTE_KEY}"

LOCAL="/tmp/restore_$(basename "${REMOTE_KEY}")"
aws s3 cp "s3://${R2_BUCKET}/${REMOTE_KEY}" "${LOCAL}" --endpoint-url="${R2_ENDPOINT}" --no-progress

# ── Decifra se .gpg ───────────────────────────────────────────────────────────
if [[ "${LOCAL}" == *.gpg ]]; then
  : "${BACKUP_PASSPHRASE:?Il backup è cifrato: serve BACKUP_PASSPHRASE}"
  DEC="${LOCAL%.gpg}"
  gpg --batch --yes --decrypt --pinentry-mode loopback \
    --passphrase "${BACKUP_PASSPHRASE}" --output "${DEC}" "${LOCAL}"
  rm -f "${LOCAL}"; LOCAL="${DEC}"
  echo "🔓 Decifrato"
fi

# ── Restore ───────────────────────────────────────────────────────────────────
echo "♻️  Restore in corso (pg_restore --clean --if-exists)..."
pg_restore --clean --if-exists --no-owner --no-privileges \
  --dbname="${RESTORE_DB_URL}" "${LOCAL}" || {
    echo "⚠️  pg_restore ha segnalato errori (spesso benigni su --clean di oggetti assenti). Verifico i conteggi."; }
rm -f "${LOCAL}"

# ── Verifica coerenza (conteggi tabelle chiave) ───────────────────────────────
echo "🔎 Conteggi post-restore:"
psql "${RESTORE_DB_URL}" -v ON_ERROR_STOP=1 -c \
  "select 'cases' t, count(*) from public.cases
   union all select 'documents', count(*) from public.documents
   union all select 'events', count(*) from public.events
   union all select 'reports', count(*) from public.reports
   union all select 'profiles', count(*) from public.profiles;"

# Ownership orfana: cases.user_id senza profilo corrispondente (segnala se auth
# non è stata rimappata — vedi il companion db/auth-users/ e il runbook).
echo "🔎 Casi con owner mancante (attesi 0 dopo rimappatura auth.users):"
psql "${RESTORE_DB_URL}" -v ON_ERROR_STOP=1 -c \
  "select count(*) as orphaned_cases from public.cases c
   left join public.profiles p on p.id = c.user_id where p.id is null;"

echo "✅ Restore + verifica completati. Ora: (1) apri 1 PDF e 1 immagine OCR dal bucket Storage ripristinato;"
echo "   (2) registra RTO/RPO reali in scratchpad/backup-restore-tests.md."
