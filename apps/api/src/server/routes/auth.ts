import { type FastifyRequest } from "fastify";
import type { AppServices } from "../../context.js";
import type { AppServer } from "../app.js";

const METHODS_WITHOUT_BODY = new Set(["GET", "HEAD"]);

const toWebRequest = (request: FastifyRequest, origin: string): Request => {
  const url = new URL(request.url, origin);
  const headers = new Headers();

  for (const [key, value] of Object.entries(request.headers)) {
    if (value === undefined) continue;
    for (const entry of Array.isArray(value) ? value : [value]) {
      headers.append(key, entry);
    }
  }

  const body = METHODS_WITHOUT_BODY.has(request.method)
    ? null
    : ((request.body as string | undefined) ?? null);

  return new Request(url, { method: request.method, headers, body });
};

export const registerAuthRoutes = async (
  app: AppServer,
  services: AppServices,
): Promise<void> => {
  await app.register((instance, _opts, done) => {
    instance.removeAllContentTypeParsers();
    instance.addContentTypeParser(
      "*",
      { parseAs: "string" },
      (_request, body, next) => {
        next(null, body);
      },
    );

    instance.all("/api/auth/*", async (request, reply) => {
      const response = await services.auth.handler(
        toWebRequest(request, services.config.appUrl),
      );

      reply.status(response.status);
      for (const [key, value] of response.headers) {
        if (key.toLowerCase() === "set-cookie") continue;
        reply.header(key, value);
      }
      const cookies = response.headers.getSetCookie();
      if (cookies.length > 0) reply.header("set-cookie", cookies);

      return reply.send(response.body ? await response.text() : null);
    });

    done();
  });
};
