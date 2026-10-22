#!/usr/bin/env bash
# Entorno de prueba más fiel: Postgres OFICIAL de Supabase + GoTrue (Auth real
# de Supabase) + PostgREST + pasarela. Sin Realtime (la app usa sondeo).
#   dev/real-auth-stack.sh up | down
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PORT=54330
SECRET="${JWT_SECRET:-prepiq-local-dev-secret-at-least-32-characters}"
LOG="${TMPDIR:-/tmp}/prepiq-real-auth"
mkdir -p "$LOG"
export PGPASSWORD=postgres

down() {
  docker rm -f prepiq-sb-db prepiq-sb-auth prepiq-postgrest prepiq-sb-realtime > /dev/null 2>&1 || true
  if [[ -f "$LOG/gateway.pid" ]]; then kill "$(cat "$LOG/gateway.pid")" 2>/dev/null || true; rm -f "$LOG/gateway.pid"; fi
  if [[ -f "${TMPDIR:-/tmp}/prepiq-local-stack/gateway.pid" ]]; then kill "$(cat "${TMPDIR:-/tmp}/prepiq-local-stack/gateway.pid")" 2>/dev/null || true; fi
}
[[ "${1:-up}" == "down" ]] && { down; echo "detenido"; exit 0; }
down

docker run -d --name prepiq-sb-db --network host -e POSTGRES_PASSWORD=postgres supabase/postgres:15.8.1.085 postgres -D /etc/postgresql -p $PORT > /dev/null
for _ in $(seq 1 60); do psql -h 127.0.0.1 -p $PORT -U postgres -d postgres -Atc "select 1" > /dev/null 2>&1 && break; sleep 2; done

docker run -d --name prepiq-sb-auth --network host \
  -e GOTRUE_API_HOST=0.0.0.0 -e PORT=9999 -e API_EXTERNAL_URL=http://localhost:54321/auth/v1 \
  -e GOTRUE_DB_DRIVER=postgres -e GOTRUE_DB_DATABASE_URL="postgres://supabase_auth_admin:postgres@127.0.0.1:$PORT/postgres" \
  -e GOTRUE_SITE_URL=http://localhost:5173 -e GOTRUE_DISABLE_SIGNUP=false \
  -e GOTRUE_JWT_SECRET="$SECRET" -e GOTRUE_JWT_EXP=3600 -e GOTRUE_JWT_AUD=authenticated \
  -e GOTRUE_JWT_DEFAULT_GROUP_NAME=authenticated -e GOTRUE_JWT_ADMIN_ROLES=service_role \
  -e GOTRUE_EXTERNAL_EMAIL_ENABLED=true -e GOTRUE_MAILER_AUTOCONFIRM=true \
  supabase/gotrue:v2.177.0 > /dev/null
for _ in $(seq 1 60); do curl -sf http://127.0.0.1:9999/health > /dev/null && break; sleep 2; done
curl -sf http://127.0.0.1:9999/health > /dev/null || { docker logs prepiq-sb-auth | tail -20; exit 1; }

PG="psql -h 127.0.0.1 -p $PORT -U postgres -d postgres -v ON_ERROR_STOP=1 -q -X"
for f in "$ROOT"/supabase/migrations/*.sql; do $PG -f "$f" > "$LOG/migrate.log" 2>&1 || { cat "$LOG/migrate.log"; exit 1; }; done
$PG -f "$ROOT/supabase/seed.sql" > "$LOG/seed.log" 2>&1 || { cat "$LOG/seed.log"; exit 1; }

docker run -d --name prepiq-postgrest --network host \
  -e PGRST_DB_URI="postgres://authenticator:postgres@127.0.0.1:$PORT/postgres" -e PGRST_DB_SCHEMAS=public \
  -e PGRST_DB_ANON_ROLE=anon -e PGRST_JWT_SECRET="$SECRET" -e PGRST_SERVER_PORT=3000 postgrest/postgrest:v12.2.3 > /dev/null

# Realtime (opcional, WITH_REALTIME=1). Su imagen escucha solo en IPv6; en
# máquinas sin IPv6 se monta una configuración con IPv4.
RT_ENV=""
if [[ "${WITH_REALTIME:-0}" == "1" ]]; then
  RT_IMAGE=supabase/realtime:v2.57.3
  psql -h 127.0.0.1 -p $PORT -U supabase_admin -d postgres -q -c "create schema if not exists _realtime; alter schema _realtime owner to supabase_admin;"
  docker run --rm --entrypoint cat $RT_IMAGE /app/releases/2.57.3/runtime.exs | sed 's/socket_opts: \[:inet6\]/socket_opts: [:inet]/' > "$LOG/runtime.exs"
  docker run -d --name prepiq-sb-realtime --network host -v "$LOG/runtime.exs:/app/releases/2.57.3/runtime.exs:ro" \
    -e PORT=4000 -e DB_HOST=127.0.0.1 -e DB_PORT=$PORT -e DB_USER=supabase_admin -e DB_PASSWORD=postgres -e DB_NAME=postgres \
    -e DB_IP_VERSION=ipv4 -e DB_AFTER_CONNECT_QUERY='SET search_path TO _realtime' -e DB_ENC_KEY=supabaserealtime \
    -e API_JWT_SECRET="$SECRET" -e SECRET_KEY_BASE=UpNVntn3cDxHJpq99YMc1T1AQgQpc8kfYTuRgBiYa15BLrx8etQoXz3gZv1/u2oq \
    -e ERL_AFLAGS="-proto_dist inet_tcp" -e DNS_NODES="''" -e RLIMIT_NOFILE=10000 -e APP_NAME=realtime \
    -e SEED_SELF_HOST=true -e RUN_JANITOR=true $RT_IMAGE > /dev/null
  for _ in $(seq 1 60); do curl -sf http://127.0.0.1:4000/ > /dev/null 2>&1 && break; curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:4000/ 2>/dev/null | grep -qE '^[1-5]' && break; sleep 2; done
  RT_ENV="REALTIME_URL=127.0.0.1:4000"
fi

env $RT_ENV GOTRUE_URL=http://127.0.0.1:9999 DATABASE_URL="postgres://postgres:postgres@127.0.0.1:$PORT/postgres" \
  nohup node "$ROOT/dev/local-stack/gateway.mjs" > "$LOG/gateway.log" 2>&1 &
echo $! > "$LOG/gateway.pid"
for _ in $(seq 1 30); do curl -sf http://localhost:54321/health > /dev/null && curl -sf http://127.0.0.1:3000/ > /dev/null && break; sleep 1; done
ANON=$(JWT_SECRET="$SECRET" node "$ROOT/dev/local-stack/gateway.mjs" anon-key)
printf '# Generado por dev/real-auth-stack.sh\nVITE_SUPABASE_URL=http://localhost:54321\nVITE_SUPABASE_ANON_KEY=%s\n' "$ANON" > "$ROOT/.env.local"
echo "Listo: Postgres Supabase :$PORT · GoTrue :9999 · API http://localhost:54321"
