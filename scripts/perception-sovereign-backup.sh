#!/usr/bin/env bash
set -euo pipefail

: "${PERCEPTION_DATABASE_URL:?Set PERCEPTION_DATABASE_URL to the LWV-controlled canonical Perception Postgres connection.}"

BACKUP_ROOT="${PERCEPTION_BACKUP_DIR:-./backups/perception}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
PREFIX="${BACKUP_ROOT%/}/perception-sovereign-${STAMP}"
DUMP_PATH="${PREFIX}.dump"
MANIFEST_PATH="${PREFIX}.manifest.json"

umask 077
mkdir -p "$BACKUP_ROOT"

if ! command -v pg_dump >/dev/null 2>&1; then
  echo "pg_dump is required." >&2
  exit 1
fi

if command -v sha256sum >/dev/null 2>&1; then
  SHA_CMD=(sha256sum)
elif command -v shasum >/dev/null 2>&1; then
  SHA_CMD=(shasum -a 256)
else
  echo "sha256sum or shasum is required." >&2
  exit 1
fi

pg_dump "$PERCEPTION_DATABASE_URL" \
  --format=custom \
  --no-owner \
  --no-privileges \
  --schema=public \
  --schema=private \
  --file="$DUMP_PATH"

ARCHIVE_SHA="$("${SHA_CMD[@]}" "$DUMP_PATH" | awk '{print $1}')"
ARCHIVE_BYTES="$(wc -c < "$DUMP_PATH" | tr -d ' ')"

cat > "$MANIFEST_PATH" <<JSON
{
  "schema": "perception-sovereign-backup/v1",
  "owner": "Legacy Works Ventures",
  "authority": "canonical Perception state",
  "created_at": "${STAMP}",
  "archive_file": "$(basename "$DUMP_PATH")",
  "archive_sha256": "${ARCHIVE_SHA}",
  "archive_bytes": ${ARCHIVE_BYTES},
  "included_schemas": ["public", "private"],
  "provider_state_authoritative": false,
  "restore_note": "Restore only into an isolated LWV-controlled Postgres/Supabase target and verify auth identity mapping before production cutover."
}
JSON

chmod 600 "$DUMP_PATH" "$MANIFEST_PATH"

echo "Sovereign backup created:"
echo "  dump:     $DUMP_PATH"
echo "  manifest: $MANIFEST_PATH"
echo "  sha256:   $ARCHIVE_SHA"
echo "  bytes:    $ARCHIVE_BYTES"
