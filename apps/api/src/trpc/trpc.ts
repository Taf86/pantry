import { TRPCError, initTRPC } from "@trpc/server";
import z, { ZodError } from "zod";
import type { RequestContext } from "./context.js";

const t = initTRPC.context<RequestContext>().create({
  errorFormatter({ shape, error }) {
    return {
      ...shape,
      data: {
        ...shape.data,
        zod:
          error.cause instanceof ZodError ? z.treeifyError(error.cause) : null,
        conflict:
          error.code === "CONFLICT" && error.cause !== undefined
            ? error.cause
            : null,
      },
    };
  },
});

export const router = t.router;
export const middleware = t.middleware;
export const publicProcedure = t.procedure;

export const authedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Missing session" });
  }
  if (ctx.user.status !== "active") {
    throw new TRPCError({
      code: "FORBIDDEN",
      message:
        ctx.user.status === "suspended"
          ? "Account suspended"
          : "Account not activated",
    });
  }
  return next({ ctx: { ...ctx, user: ctx.user } });
});

export const adminProcedure = authedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== "admin") {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Reserved",
    });
  }
  return next();
});
