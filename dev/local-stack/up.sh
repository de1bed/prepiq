#!/usr/bin/env bash
# Levanta un entorno local de pruebas: Postgres (local) + PostgREST (Docker)
# + pasarela con auth simulado. La app se conecta a http://localhost:54321.
#   dev/local-stack/up.sh        # recrea la base con semilla y arranca
#   dev/local-stack/down.sh      # detiene
# Requisitos: Postgres 15+ local con pgcrypto y btree_gist, Docker, Node 20+.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
export PREPIQ_DB="${PREPIQ_DB:-prepiq_e2e}"
export JWT_SECRET="${JWT_SECRET:-prepiq-local-dev-secret-at-least-32-characters}"
LOG="${TMPDIR:-/tmp}/prepiq-local-stack"
mkdir -p "$LOG"

"$ROOT/dev/db-reset.sh" --seed > "$LOG/db.log" 2>&1 || { cat "$LOG/db.log"; exit 1; }

docker rm -f prepiq-postgrest > /dev/null 2>&1 || true
docker run -d --name prepiq-postgrest --network host \
  -e PGRST_DB_URI="postgres://authenticator:authenticator@127.0.0.1:5432/$PREPIQ_DB" \
  -e PGRST_DB_SCHEMAS=public \
  -e PGRST_DB_ANON_ROLE=anon \
  -e PGRST_JWT_SECRET="$JWT_SECRET" \
  -e PGRST_DB_CHANNEL_ENABLED=true \
  -e PGRST_SERVER_PORT=3000 \
  postgrest/postgrest:v12.2.3 > /dev/null

if [[ -f "$LOG/gateway.pid" ]]; then kill "$(cat "$LOG/gateway.pid")" 2>/dev/null || true; fi
DATABASE_URL="postgres://$(whoami)@/$PREPIQ_DB?host=/var/run/postgresql" nohup node "$ROOT/dev/local-stack/gateway.mjs" > "$LOG/gateway.log" 2>&1 &
echo $! > "$LOG/gateway.pid"

for i in $(seq 1 30); do
  if curl -sf http://localhost:54321/health > /dev/null && curl -sf http://127.0.0.1:3000/ > /dev/null; then break; fi
  sleep 1
done
ANON=$(node "$ROOT/dev/local-stack/gateway.mjs" anon-key)
cat > "$ROOT/.env.local" <<EOF
# Generado por dev/local-stack/up.sh (entorno local de pruebas)
VITE_SUPABASE_URL=http://localhost:54321
VITE_SUPABASE_ANON_KEY=$ANON
EOF
echo "Entorno local listo. Base: $PREPIQ_DB · API: http://localhost:54321 · .env.local actualizado"
