import { router } from "../trpc.js";
import { accountRouter } from "./account.router.js";
import { adminRouter } from "./admin.router.js";

export const appRouter = router({
  account: accountRouter,
  admin: adminRouter,
});

export type AppRouter = typeof appRouter;
