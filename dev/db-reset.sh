#!/usr/bin/env bash
# Recrea una base local "Supabase-like" y aplica stub + migraciones (+ semilla opcional).
# Uso: dev/db-reset.sh [--seed]   (requiere Postgres local; ver dev/README.md)
set -euo pipefail
DB="${PREPIQ_DB:-prepiq_dev}"
PSQL="psql -v ON_ERROR_STOP=1 -q -X"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
$PSQL -d postgres -c "drop database if exists $DB with (force)" -c "create database $DB"
$PSQL -d "$DB" -f "$ROOT/dev/supabase-stub.sql"
for f in "$ROOT"/supabase/migrations/*.sql; do
  echo "→ $(basename "$f")"
  $PSQL -d "$DB" -f "$f"
done
if [[ "${1:-}" == "--seed" ]]; then
  echo "→ seed.sql"
  $PSQL -d "$DB" -f "$ROOT/supabase/seed.sql"
fi
echo "Base $DB lista."
