#!/usr/bin/env bash

set -euo pipefail

readonly CONF=/opt/pantry/backup.env
readonly LOCAL_DIR=/opt/pantry/backups
readonly CONTAINER=pantry-db
readonly LOCK=/opt/pantry/.backup.lock
readonly MIN_DUMP_BYTES=1024

readonly COUNT_SQL="
SELECT 'count.' || t.table_schema || '.' || t.table_name || '=' ||
       (xpath('/row/c/text()',
              query_to_xml(format('select count(*) as c from %I.%I',
                                  t.table_schema, t.table_name),
                           false, true, '')))[1]::text
FROM information_schema.tables t
WHERE t.table_type = 'BASE TABLE'
  AND t.table_schema NOT IN ('pg_catalog', 'information_schema')
ORDER BY t.table_schema, t.table_name;
"

log() { printf '%s  %s\n' "$(date -Is)" "$*"; }
die() { log "ERROR: $*"; exit 1; }

[[ -r $CONF ]] || die "Invalid or missing $CONF"
# shellcheck source=/dev/null
set -a; source "$CONF"; set +a

: "${AGE_RECIPIENT:?missing in backup.env}"
: "${RCLONE_REMOTE:?missing in backup.env}"
LOCAL_KEEP_DAYS="${LOCAL_KEEP_DAYS:-7}"
REMOTE_KEEP_DAYS="${REMOTE_KEEP_DAYS:-30}"
KEEP_MIN="${KEEP_MIN:-3}"
DB_WAIT_SECS="${DB_WAIT_SECS:-300}"
HEALTHCHECK_URL="${HEALTHCHECK_URL:-}"

hc() {
  [[ -n $HEALTHCHECK_URL ]] || return 0
  curl -fsS -m 10 --retry 3 -o /dev/null "${HEALTHCHECK_URL}${1-}" || true
}

declare -a scratch=()
finish() {
  local rc=$?
  if (( ${#scratch[@]} )); then rm -f "${scratch[@]}"; fi
  if (( rc != 0 )); then hc /fail; fi
  exit "$rc"
}
trap finish EXIT

exec 9>"$LOCK"
flock -n 9 || die "backup already running"

hc /start

install -d -m 700 "$LOCAL_DIR"

find "$LOCAL_DIR" -maxdepth 1 -name '*.part' -mmin +120 -delete 2>/dev/null || true

stamp=$(date -u +%Y%m%dT%H%M%SZ)
dump_name="pantry-${stamp}.dump.age"
manifest_name="pantry-${stamp}.manifest.age"
dump_path="${LOCAL_DIR}/${dump_name}"
manifest_path="${LOCAL_DIR}/${manifest_name}"
dump_part="${dump_path}.part"
manifest_part="${manifest_path}.part"
scratch+=("$dump_part" "$manifest_part")

in_db() { docker exec -i "$CONTAINER" sh -c "$1"; }

db_ready() { in_db 'pg_isready -q -U "$POSTGRES_USER" -d "$POSTGRES_DB"' >/dev/null 2>&1; }

for (( i = 0; i < DB_WAIT_SECS; i++ )); do
  if db_ready; then break; fi
  sleep 1
done
db_ready || die "$CONTAINER not accepting connections after ${DB_WAIT_SECS}s"

log "dump of $CONTAINER -> $dump_name"
in_db 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' | age -r "$AGE_RECIPIENT" -o "$dump_part"

dump_bytes=$(stat -c%s "$dump_part")
(( dump_bytes >= MIN_DUMP_BYTES )) || die "invalid dump: only ${dump_bytes} bytes"

mv -f "$dump_part" "$dump_path"
dump_sha=$(sha256sum "$dump_path" | cut -d' ' -f1)

log "manifest: counting rows"

db_name=$(in_db 'printf %s "$POSTGRES_DB"')
db_user=$(in_db 'printf %s "$POSTGRES_USER"')
server_version=$(in_db 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atqc "show server_version"')
[[ -n $db_name && -n $db_user && -n $server_version ]] || die "empty result while querying the database"

{
  printf 'stamp=%s\n' "$stamp"
  printf 'dump_file=%s\n' "$dump_name"
  printf 'dump_bytes=%s\n' "$dump_bytes"
  printf 'dump_sha256=%s\n' "$dump_sha"
  printf 'db_name=%s\n' "$db_name"
  printf 'db_user=%s\n' "$db_user"
  printf 'server_version=%s\n' "$server_version"
  in_db 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atq -f -' <<< "$COUNT_SQL"
} | age -r "$AGE_RECIPIENT" -o "$manifest_part"

mv -f "$manifest_part" "$manifest_path"

log "upload -> $RCLONE_REMOTE"
rclone copy "$LOCAL_DIR" "$RCLONE_REMOTE" \
  --include "$dump_name" --include "$manifest_name" --no-traverse

rclone check "$LOCAL_DIR" "$RCLONE_REMOTE" \
  --include "$dump_name" --include "$manifest_name" --one-way \
  || die "uploaded objects do not match the local ones"

log "retention: local ${LOCAL_KEEP_DAYS}d, remote ${REMOTE_KEEP_DAYS}d, floor ${KEEP_MIN}"

count_local() { find "$LOCAL_DIR" -maxdepth 1 -name 'pantry-*.dump.age' "$@" | wc -l; }
count_remote() { rclone lsf "$RCLONE_REMOTE" --include 'pantry-*.dump.age' "$@" | wc -l; }

local_stale=$(count_local -mtime "+${LOCAL_KEEP_DAYS}")
local_left=$(( $(count_local) - local_stale ))
if (( local_stale == 0 )); then
  :
elif (( local_left >= KEEP_MIN )); then
  find "$LOCAL_DIR" -maxdepth 1 -name 'pantry-*.age' -mtime "+${LOCAL_KEEP_DAYS}" -delete
else
  log "WARN: local retention skipped, ${local_stale} expired but only ${local_left} would remain"
fi

remote_stale=$(count_remote --min-age "${REMOTE_KEEP_DAYS}d")
remote_left=$(( $(count_remote) - remote_stale ))
if (( remote_stale == 0 )); then
  :
elif (( remote_left >= KEEP_MIN )); then
  rclone delete "$RCLONE_REMOTE" --min-age "${REMOTE_KEEP_DAYS}d" --include 'pantry-*.age'
else
  log "WARN: remote retention skipped, ${remote_stale} expired but only ${remote_left} would remain"
fi

kept=$(rclone lsf "$RCLONE_REMOTE" --include 'pantry-*.dump.age' | wc -l)
log "OK: $dump_name (${dump_bytes} bytes), ${kept} dumps off-site"
hc
