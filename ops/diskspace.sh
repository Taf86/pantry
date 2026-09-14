#!/usr/bin/env bash

set -euo pipefail

readonly CONF=/opt/pantry/diskspace.env

log() { printf '%s  %s\n' "$(date -Is)" "$*"; }
die() { log "ERROR: $*"; exit 1; }

[[ -r $CONF ]] || die "Invalid or missing $CONF"
# shellcheck source=/dev/null
set -a; source "$CONF"; set +a

DISK_THRESHOLD="${DISK_THRESHOLD:-80}"
INODE_THRESHOLD="${INODE_THRESHOLD:-80}"
HEALTHCHECK_URL="${HEALTHCHECK_URL:-}"

hc() {
  [[ -n $HEALTHCHECK_URL ]] || return 0
  curl -fsS -m 10 --retry 3 -o /dev/null \
    --data-raw "${2-}" "${HEALTHCHECK_URL}${1-}" || true
}

finish() {
  local rc=$?
  if (( rc != 0 )); then hc /fail "unexpected failure, see journalctl -u pantry-diskspace"; fi
  exit "$rc"
}
trap finish EXIT

usage() { df -P "$@" -x tmpfs -x devtmpfs -x overlay -x squashfs; }

declare -a problems=() summary=()

scan() { # <df flag> <threshold> <label>
  local out
  out=$(usage "$1" | awk 'NR > 1 { gsub(/%/, "", $5); print $6, $5 }')
  while read -r mount used; do
    [[ -n $mount ]] || continue
    summary+=("$mount ${used}% $3")
    if (( used >= $2 )); then problems+=("$mount at ${used}% $3 (threshold $2%)"); fi
  done <<< "$out"
}

scan -k "$DISK_THRESHOLD" space
scan -i "$INODE_THRESHOLD" inodes

log "checked: ${summary[*]}"

if (( ${#problems[@]} )); then
  for p in "${problems[@]}"; do log "WARN: $p"; done
  hc /fail "$(printf '%s\n' "${problems[@]}")"
  trap - EXIT
  exit 0
fi

log "OK: all filesystems below thresholds (${DISK_THRESHOLD}% space, ${INODE_THRESHOLD}% inodes)"
hc
