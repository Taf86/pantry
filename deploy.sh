#!/usr/bin/env bash
#
# Deploy sulla VPS. Lo lancia la CI via SSH, dopo aver scritto .env.tag.
#
# `set -euo pipefail` non è cerimonia: senza, un `docker compose pull` fallito
# proseguirebbe fino a riavviare i container con l'immagine vecchia, e il
# deploy risulterebbe riuscito.
set -euo pipefail

cd /opt/pantry

if [[ ! -f .env ]]; then
  echo "Manca /opt/pantry/.env" >&2
  exit 1
fi

if [[ ! -f .env.tag ]]; then
  echo "Manca /opt/pantry/.env.tag: la CI non ha scritto il tag" >&2
  exit 1
fi

set -a
# shellcheck disable=SC1091
source .env
# shellcheck disable=SC1091
source .env.tag
set +a

echo "Deploy del tag ${TAG}"

docker compose pull api
docker compose up -d --remove-orphans

# Le migrazioni le applica il container api all'avvio, prima di accettare
# traffico: qui aspettiamo solo che si dichiari sano.
for _ in $(seq 1 30); do
  if [[ "$(docker compose ps --format '{{.Health}}' api)" == "healthy" ]]; then
    echo "API is healthy. Deploy completed."
    docker image prune -f --filter "until=168h" >/dev/null
    exit 0
  fi
  sleep 5
done

echo "API not healthy: rollback advised." >&2
docker compose logs --tail 100 api >&2
exit 1
