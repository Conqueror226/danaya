#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
: "${BACKUP_DIR:?Set BACKUP_DIR to an encrypted backup location outside this repository}"
mkdir -p "$BACKUP_DIR"
umask 077
backup_file="$BACKUP_DIR/danaya-$(date -u +%Y%m%dT%H%M%SZ).dump"
trap 'rm -f "$backup_file.partial"' EXIT
docker compose exec -T db pg_dump -U danaya -d danaya -Fc > "$backup_file.partial"
mv "$backup_file.partial" "$backup_file"
printf 'Backup written: %s\n' "$backup_file"
