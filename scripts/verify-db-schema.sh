#!/usr/bin/env bash
#
# Confronta lo SCHEMA di due database Postgres (solo struttura, nessun dato).
# Gate della Fase 2 del piano di uscita: dopo aver eseguito le migration da zero
# su STAGING, lo schema deve combaciare con PROD (diff vuoto). Un diff non vuoto
# = migration incompleta / drift (spesso il multi-statement non applicato).
#
# SOLA LETTURA: usa pg_dump --schema-only, non tocca i dati.
#
# Uso:
#   SOURCE_DB_URL="postgresql://...prod..." \
#   TARGET_DB_URL="postgresql://...staging..." \
#   ./scripts/verify-db-schema.sh
#
# Exit 0 = schemi identici · Exit 1 = differenze (stampa il diff unificato).

set -euo pipefail

: "${SOURCE_DB_URL:?Need SOURCE_DB_URL (es. prod)}"
: "${TARGET_DB_URL:?Need TARGET_DB_URL (es. staging)}"
command -v pg_dump >/dev/null 2>&1 || { echo "ERROR: pg_dump non installato"; exit 1; }

SRC="/tmp/schema_source.sql"
TGT="/tmp/schema_target.sql"

dump_schema() {
  # --schema-only: nessun dato. Escludiamo lo schema drizzle (tracking table:
  # differisce per numero di righe registrate, non è schema applicativo).
  pg_dump "$1" --schema-only --no-owner --no-privileges --schema=public --schema=storage 2>/dev/null \
    | grep -vE '^--|^SET |^SELECT pg_catalog|^$' \
    | sort
}

echo "📥 Dump schema SOURCE..."
dump_schema "${SOURCE_DB_URL}" > "${SRC}"
echo "📥 Dump schema TARGET..."
dump_schema "${TARGET_DB_URL}" > "${TGT}"

if diff -u "${SRC}" "${TGT}" > /tmp/schema_diff.txt; then
  echo "✅ Schemi IDENTICI (public + storage). Gate Fase 2 superato."
  rm -f "${SRC}" "${TGT}" /tmp/schema_diff.txt
  exit 0
else
  echo "❌ Differenze di schema trovate (- SOURCE / + TARGET):"
  cat /tmp/schema_diff.txt
  echo ""
  echo "→ Se il target manca oggetti: probabile multi-statement non applicato."
  echo "  Aggiungi statement-breakpoint alle migration 0018-0031 e riapplica su staging."
  rm -f "${SRC}" "${TGT}"
  exit 1
fi
