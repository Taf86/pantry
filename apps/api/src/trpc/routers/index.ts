import { router } from "../trpc.js";
import { adminRouter } from "./admin.router.js";

export const appRouter = router({
  admin: adminRouter,
});

export type AppRouter = typeof appRouter;
