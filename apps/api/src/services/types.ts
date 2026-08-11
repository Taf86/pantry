import type { AppServices } from "../context.js";

/**
 * I servizi dipendono solo dal database e dal bus di eventi: non conoscono
 * tRPC, Fastify o Better Auth. È ciò che li rende chiamabili da un test, da
 * uno script di seed o da un job senza impalcature.
 */
export type ServiceDeps = Pick<AppServices, "db" | "events">;
