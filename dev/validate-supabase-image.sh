#!/usr/bin/env bash
# Valida migraciones + semilla + pruebas críticas sobre la imagen OFICIAL de
# Postgres de Supabase, ejecutando como el rol `postgres` (no superusuario),
# igual que `supabase db push` en un proyecto real.
#   dev/validate-supabase-image.sh
# Requiere Docker. No toca ningún proyecto en la nube.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
IMAGE="${SUPABASE_PG_IMAGE:-supabase/postgres:15.8.1.060}"
PORT="${SUPABASE_PG_PORT:-54329}"
NAME=prepiq-supabase-validate
export PGPASSWORD=postgres

docker rm -f "$NAME" > /dev/null 2>&1 || true
docker run -d --name "$NAME" --network host -e POSTGRES_PASSWORD=postgres "$IMAGE" postgres -D /etc/postgresql -p "$PORT" > /dev/null
for _ in $(seq 1 60); do
  psql -h 127.0.0.1 -p "$PORT" -U postgres -d postgres -Atc "select 1" > /dev/null 2>&1 && break
  sleep 2
done

ADMIN="psql -h 127.0.0.1 -p $PORT -U supabase_admin -d postgres -v ON_ERROR_STOP=1 -q -X"
PG="psql -h 127.0.0.1 -p $PORT -U postgres -d postgres -v ON_ERROR_STOP=1 -q -X"

# La imagen base trae el esquema auth inicial; GoTrue agrega estas piezas en
# un proyecto real. Se emulan solo para poder sembrar usuarios de prueba.
$ADMIN <<'SQL'
alter table auth.users add column if not exists email_confirmed_at timestamptz;
alter table auth.users add column if not exists email_change_token_new varchar(255);
create table if not exists auth.identities (
  id uuid primary key default gen_random_uuid(), provider_id text not null,
  user_id uuid not null references auth.users(id) on delete cascade, identity_data jsonb not null,
  provider text not null, last_sign_in_at timestamptz, created_at timestamptz default now(),
  updated_at timestamptz default now(), unique (provider_id, provider));
grant all on auth.identities, auth.users to postgres;
SQL

for f in "$ROOT"/supabase/migrations/*.sql; do
  echo "→ $(basename "$f")"
  $PG -f "$f"
done
echo "→ seed.sql"
$PG -f "$ROOT/supabase/seed.sql" 2>&1 | grep -v NOTICE || true
echo "→ pruebas críticas"
$PG -f "$ROOT/supabase/tests/criticos.sql" 2>&1 | sed -E 's/^psql:[^ ]+ (NOTICE|ERROR):  //' | grep -E "FALLÓ|✔|ERROR" || true
docker rm -f "$NAME" > /dev/null
