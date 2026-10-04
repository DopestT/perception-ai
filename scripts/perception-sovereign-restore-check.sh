#!/usr/bin/env bash
set -euo pipefail

if [[ "${PERCEPTION_ALLOW_DESTRUCTIVE_RESTORE:-}" != "YES" ]]; then
  echo "Set PERCEPTION_ALLOW_DESTRUCTIVE_RESTORE=YES only for an isolated restore target." >&2
  exit 1
fi

: "${PERCEPTION_RESTORE_DATABASE_URL:?Set PERCEPTION_RESTORE_DATABASE_URL to an isolated LWV-controlled restore target.}"
: "${1:?Usage: perception-sovereign-restore-check.sh <backup.dump>}"

DUMP_PATH="$1"

if [[ ! -f "$DUMP_PATH" ]]; then
  echo "Backup not found: $DUMP_PATH" >&2
  exit 1
fi

if ! command -v pg_restore >/dev/null 2>&1 || ! command -v psql >/dev/null 2>&1; then
  echo "pg_restore and psql are required." >&2
  exit 1
fi

pg_restore \
  --clean \
  --if-exists \
  --no-owner \
  --no-privileges \
  --dbname="$PERCEPTION_RESTORE_DATABASE_URL" \
  "$DUMP_PATH"

psql "$PERCEPTION_RESTORE_DATABASE_URL" -v ON_ERROR_STOP=1 <<'SQL'
do $$
begin
  if not exists (
    select 1 from information_schema.tables
    where table_schema='public' and table_name='perception_projects'
  ) then
    raise exception 'RESTORE FAIL: perception_projects missing';
  end if;

  if not exists (
    select 1 from information_schema.tables
    where table_schema='public' and table_name='perception_epistemic_ledger'
  ) then
    raise exception 'RESTORE FAIL: epistemic ledger missing';
  end if;

  if not exists (
    select 1 from information_schema.tables
    where table_schema='public' and table_name='perception_execution_ledger'
  ) then
    raise exception 'RESTORE FAIL: execution ledger missing';
  end if;

  if not exists (
    select 1
    from public.perception_storage_authority
    where authority_key='canonical'
      and owner_organization='Legacy Works Ventures'
      and provider_state_authoritative=false
      and conversation_history_authoritative=false
      and provider_vector_store_authoritative=false
      and provider_thread_authoritative=false
  ) then
    raise exception 'RESTORE FAIL: sovereign storage authority record missing or invalid';
  end if;
end
$$;
SQL

echo "Sovereign restore drill passed on isolated target."
