import { sql } from "drizzle-orm";
import type { AppServices } from "../../context.js";
import type { AppServer } from "../app.js";

const HEALTH_PROBE_TIMEOUT_MS = 2_000;

const HEALTH_CACHE_MS = 5_000;

export const registerHealthRoute = (
  app: AppServer,
  services: AppServices,
): void => {
  let cached: { at: number; ok: boolean } | undefined;
  let inflight: Promise<boolean> | undefined;

  const probe = async (): Promise<boolean> => {
    let timer: NodeJS.Timeout | undefined;
    try {
      await Promise.race([
        services.db.execute(sql`select 1`),
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () => reject(new Error("health probe timeout")),
            HEALTH_PROBE_TIMEOUT_MS,
          );
        }),
      ]);
      return true;
    } catch (error) {
      services.logger.error({ error }, "health: database unreachable");
      return false;
    } finally {
      clearTimeout(timer);
    }
  };

  const check = (): Promise<boolean> => {
    if (cached && Date.now() - cached.at < HEALTH_CACHE_MS) {
      return Promise.resolve(cached.ok);
    }
    inflight ??= probe().then((ok) => {
      cached = { at: Date.now(), ok };
      inflight = undefined;
      return ok;
    });
    return inflight;
  };

  app.get("/api/health", async (_request, reply) => {
    const ok = await check();
    reply.header("cache-control", "no-store");
    reply.status(ok ? 200 : 503);
    return { status: ok ? "ok" : "degraded" };
  });
};
