import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** `.env` alla radice del monorepo, due livelli sopra `apps/api`. */
const localEnvPath = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "..",
  "..",
  ".env",
);

/**
 * Carica il `.env` di sviluppo, se c'è.
 *
 * `process.loadEnvFile` è nella libreria standard da Node 20.12: non serve
 * `dotenv`, e soprattutto non serve una dipendenza in più che finirebbe
 * anche nell'immagine di produzione.
 *
 * In produzione questa funzione non fa nulla, per due ragioni che si
 * rinforzano a vicenda: il file non esiste (le variabili arrivano da
 * `env_file` di Compose) e comunque `NODE_ENV` la disinnesca. Un `.env`
 * finito per sbaglio dentro l'immagine non può quindi scavalcare la
 * configurazione vera.
 *
 * Le variabili già presenti nell'ambiente **non** vengono sovrascritte da
 * Node: la CI, che le passa esplicitamente, resta padrona della propria
 * configurazione anche se un `.env` fosse presente.
 */
export const loadLocalEnv = (): void => {
  if (process.env["NODE_ENV"] === "production") return;
  if (!existsSync(localEnvPath)) return;

  process.loadEnvFile(localEnvPath);
};
