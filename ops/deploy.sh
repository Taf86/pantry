#!/usr/bin/env bash

set -euo pipefail

cd /opt/pantry

readonly TAG_FILE=.env.tag
readonly WAIT_TIMEOUT=180
readonly PRUNE_OLDER_THAN=168h

log() { printf '%s  %s\n' "$(date -Is)" "$*"; }

exec 9>.deploy.lock
if ! flock -n 9; then
  log "ERROR: another deploy running"
  exit 1
fi

compose() { docker compose --env-file .env --env-file "$TAG_FILE" "$@"; }

[[ -r $TAG_FILE ]] || { log "ERROR: $TAG_FILE missing o invalid"; exit 1; }

TAG_NEW=$(grep -E '^TAG=' "$TAG_FILE" | tail -1 | cut -d= -f2- | tr -d '[:space:]')
[[ -n $TAG_NEW ]] || { log "ERROR: missing or empty TAG in $TAG_FILE"; exit 1; }

TAG_OLD=""
if cid=$(compose ps -q api 2>/dev/null) && [[ -n $cid ]]; then
  TAG_OLD=$(docker inspect --format '{{.Config.Image}}' "$cid" | sed 's/.*://')
fi

if [[ $TAG_NEW == "$TAG_OLD" ]]; then
  log "$TAG_NEW already running. Still deploying as image may have changed."
fi

log "deploy: ${TAG_OLD:-<no previous version>} -> $TAG_NEW"

if ! compose pull; then
  log "ERROR: pull failed. Nothing modified, still running ${TAG_OLD:-<nothing>}"
  exit 1
fi

if compose up -d --wait --wait-timeout "$WAIT_TIMEOUT" --remove-orphans; then
  log "OK: running $TAG_NEW"
  docker image prune -af --filter "until=$PRUNE_OLDER_THAN" >/dev/null 2>&1 || true
  exit 0
fi

log "ERROR: containers did not become healthy"
compose ps || true

if [[ -z $TAG_OLD ]]; then
  log "no previous version to roll-back: stack remain the same"
  exit 1
fi

log "rollback to $TAG_OLD"
printf 'TAG=%s\n' "$TAG_OLD" > "$TAG_FILE"

if compose up -d --wait --wait-timeout "$WAIT_TIMEOUT" --remove-orphans; then
  log "rollback successfull: running $TAG_OLD"
else
  log "SEVERE ERROR: rollback-failed, manual intervention required"
  compose ps || true
fi

exit 1
