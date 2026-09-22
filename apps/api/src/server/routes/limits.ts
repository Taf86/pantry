import type { AppServices } from "../../context.js";
import type { AppServer } from "../app.js";

export const registerRateLimit = (
  app: AppServer,
  services: AppServices,
): void => {
  app.addHook("onRequest", (request, reply, done) => {
    const { ok, retryAfter } = services.limits.http.take(request.ip);
    if (ok) {
      done();
      return;
    }

    reply
      .header("retry-after", String(retryAfter))
      .code(429)
      .send({ error: "Too many requests" });
  });
};
