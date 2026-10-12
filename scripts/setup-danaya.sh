#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
if [[ ! -f .env ]]; then
  cp .env.example .env
  python3 - <<'PY'
from pathlib import Path
import secrets
p=Path('.env')
p.write_text(p.read_text().replace('POSTGRES_PASSWORD=\n','POSTGRES_PASSWORD='+secrets.token_hex(32)+'\n'))
p.chmod(0o600)
PY
fi
docker compose build
docker compose up -d --wait api frontend
printf '%s\n' 'Danaya is starting at http://localhost:8080' 'Add your facility and account using DOCKER_DEPLOYMENT.md. No default account is created.'
