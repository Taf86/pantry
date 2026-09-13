#!/usr/bin/env bash

set -euo pipefail

case "$(uname -s)" in
  MINGW* | MSYS*) readonly ON_MSYS=1 ;;
  *) readonly ON_MSYS=0 ;;
esac
noconv() {
  if ((ON_MSYS)); then
    MSYS_NO_PATHCONV=1 MSYS2_ARG_CONV_EXCL='*' "$@"
  else
    "$@"
  fi
}

readonly CONF="${RESTORE_DRILL_ENV:-$HOME/.config/pantry/restore-drill.env}"
readonly CONTAINER=pantry-restore-drill

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

if [[ -r $CONF ]]; then
  # shellcheck source=/dev/null
  set -a; source "$CONF"; set +a
fi

: "${RCLONE_REMOTE:?missing in enviroment and in $CONF}"
: "${AGE_IDENTITY:?missing in enviroment and in $CONF}"
[[ -r $AGE_IDENTITY ]] || die "invalid private key: $AGE_IDENTITY"

for cmd in docker rclone age; do
  command -v "$cmd" >/dev/null || die "missing $cmd"
done

work=$(mktemp -d)
cleanup() {
  local rc=$?
  docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
  rm -rf "$work"
  exit "$rc"
}
trap cleanup EXIT

stamp="${1:-}"
if [[ -z $stamp ]]; then
  latest=$(noconv rclone lsf "$RCLONE_REMOTE" --include 'pantry-*.dump.age' | sort | tail -1)
  [[ -n $latest ]] || die "no dump in $RCLONE_REMOTE"
  stamp=${latest#pantry-}
  stamp=${stamp%.dump.age}
fi
log "picked backup: $stamp"

dump_name="pantry-${stamp}.dump.age"
manifest_name="pantry-${stamp}.manifest.age"

(
  cd "$work"
  noconv rclone copy "$RCLONE_REMOTE" . \
    --include "$dump_name" --include "$manifest_name" --no-traverse
)
[[ -f "$work/$dump_name" ]] || die "$dump_name not downloaded"
[[ -f "$work/$manifest_name" ]] || die "$manifest_name not downloaded: backup without manifest"

age -d -i "$AGE_IDENTITY" -o "$work/manifest" "$work/$manifest_name"
age -d -i "$AGE_IDENTITY" -o "$work/dump" "$work/$dump_name"

manifest_get() { grep -m1 "^$1=" "$work/manifest" | cut -d= -f2- || true; }

want_sha=$(manifest_get dump_sha256)
have_sha=$(sha256sum "$work/$dump_name" | cut -d' ' -f1)
[[ $want_sha == "$have_sha" ]] || die "sha256 different from manifest's one: corrupted object"
log "sha256 verified: ${have_sha:0:16}…"

db_name=$(manifest_get db_name)
db_user=$(manifest_get db_user)
server_version=$(manifest_get server_version)
[[ -n $db_name && -n $db_user ]] || die "invalid manifest"

image="${DRILL_IMAGE:-postgres:${server_version%% *}}"
log "restoring in $image (production: $server_version)"

docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
docker run -d --name "$CONTAINER" \
  -e POSTGRES_USER="$db_user" \
  -e POSTGRES_DB="$db_name" \
  -e POSTGRES_PASSWORD="$(head -c 18 /dev/urandom | base64)" \
  "$image" >/dev/null

for _ in $(seq 120); do
  if docker logs "$CONTAINER" 2>&1 | grep -q 'init process complete'; then break; fi
  sleep 1
done
for _ in $(seq 60); do
  if docker exec "$CONTAINER" pg_isready -U "$db_user" -d "$db_name" >/dev/null 2>&1; then
    break
  fi
  sleep 1
done
docker exec "$CONTAINER" pg_isready -U "$db_user" -d "$db_name" >/dev/null \
  || die "test container never became ready"

docker exec -i "$CONTAINER" sh -c 'cat > /tmp/pantry.dump' < "$work/dump"

if ! docker exec "$CONTAINER" sh -c \
       "pg_restore -U '$db_user' -d '$db_name' --no-owner --exit-on-error /tmp/pantry.dump"; then
  die "pg_restore failed: this backup is not restorable"
fi
log "pg_restore successfull"

declare -A expected restored
while IFS='=' read -r k v; do
  if [[ $k == count.* ]]; then expected[${k#count.}]=$v; fi
done < "$work/manifest"

while IFS='=' read -r k v; do
  if [[ $k == count.* ]]; then restored[${k#count.}]=$v; fi
done < <(docker exec -i "$CONTAINER" psql -U "$db_user" -d "$db_name" -Atq -f - <<< "$COUNT_SQL")

printf '\n  %-34s %10s %12s   %s\n' table "with dump" restored outcome
printf '  %s\n' "$(printf '%.0s-' {1..74})"

failures=0
for t in $(printf '%s\n' "${!expected[@]}" "${!restored[@]}" | sort -u); do
  want=${expected[$t]:-assente}
  have=${restored[$t]:-assente}
  if [[ $want == "$have" ]]; then
    verdict=ok
  else
    verdict='DIFFERENT'
    failures=$((failures + 1))
  fi
  printf '  %-34s %10s %12s   %s\n' "$t" "$want" "$have" "$verdict"
done
echo

(( ${#expected[@]} > 0 )) || die "manifest don't have any count"
[[ ${restored[public.users]:-0} -ge 1 ]] || die "no users restored: empty dump"
[[ ${restored[drizzle.__drizzle_migrations]:-0} -ge 1 ]] \
  || die "migration table missing: not the same schema"

if (( failures > 0 )); then
  die "$failures tables don't match"
fi

log "DRILL SUCCESSFULL: backup $stamp restorable, ${#restored[@]} tables, same counts."
log "Write down date in docs/backup.md, at «Registro delle prove»"
