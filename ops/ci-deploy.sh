#!/usr/bin/env bash

set -euo pipefail

tag="${SSH_ORIGINAL_COMMAND:-}"

if [[ ! $tag =~ ^[0-9a-f]{40}$ ]]; then
  echo "ERROR: expected a 40-character commit SHA, got: '${tag}'" >&2
  exit 2
fi

cd /opt/pantry
printf 'TAG=%s\n' "$tag" > .env.tag
exec ./deploy.sh
