#!/usr/bin/env bash
# Abre PrepIQ en tu computadora con un Supabase local y datos de demostración.
# Requisitos: Node 20+ y Docker Desktop abierto. Uso: npm run demo
set -euo pipefail
cd "$(dirname "$0")/.."
command -v docker > /dev/null || { echo "Falta Docker Desktop: https://www.docker.com/products/docker-desktop/"; exit 1; }
docker info > /dev/null 2>&1 || { echo "Abre Docker Desktop y vuelve a intentar."; exit 1; }
[[ -d node_modules ]] || npm install
npx supabase start            # aplica supabase/migrations y supabase/seed.sql
eval "$(npx supabase status -o env | grep -E '^(API_URL|ANON_KEY)=')"
printf '# Generado por npm run demo\nVITE_SUPABASE_URL=%s\nVITE_SUPABASE_ANON_KEY=%s\n' "$API_URL" "$ANON_KEY" > .env.local
cat <<MSG

  PrepIQ listo en http://localhost:5173
  Contraseña de todas las cuentas demo: demo-prepiq-2026
    elena@demo.prepiq.test         mesera
    kds-comal@demo.prepiq.test     tableta de cocina (PIN 3333 Carla / 4444 Diego)
    beto@demo.prepiq.test          gerente
    ana@demo.prepiq.test           administradora
  Para apagar: npx supabase stop

MSG
npx vite --port 5173 --open
