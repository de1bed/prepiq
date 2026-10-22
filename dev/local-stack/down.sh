#!/usr/bin/env bash
LOG="${TMPDIR:-/tmp}/prepiq-local-stack"
docker rm -f prepiq-postgrest > /dev/null 2>&1 || true
if [[ -f "$LOG/gateway.pid" ]]; then kill "$(cat "$LOG/gateway.pid")" 2>/dev/null || true; rm -f "$LOG/gateway.pid"; fi
echo "Entorno local detenido."
