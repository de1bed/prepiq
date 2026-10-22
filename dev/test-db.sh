#!/usr/bin/env bash
# Recrea la base local con semilla y corre las pruebas SQL de criterios críticos.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DB="${PREPIQ_DB:-prepiq_test}"
PREPIQ_DB="$DB" "$ROOT/dev/db-reset.sh" --seed > /dev/null
for f in "$ROOT"/supabase/tests/*.sql; do
  echo "== $(basename "$f")"
  psql -X -q -v ON_ERROR_STOP=1 -d "$DB" -f "$f" 2>&1 | sed -E 's/^psql:[^ ]+ (NOTICE|ERROR|DETAIL|CONTEXT|HINT):  //'
done
