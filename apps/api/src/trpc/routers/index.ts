import { router } from "../trpc.js";
import { accountRouter } from "./account.router.js";
import { adminRouter } from "./admin.router.js";
import { catalogRouter } from "./catalog.router.js";
import { listsRouter } from "./lists.router.js";
import { pushRouter } from "./push.router.js";

export const appRouter = router({
  account: accountRouter,
  admin: adminRouter,
  catalog: catalogRouter,
  push: pushRouter,
  lists: listsRouter,
});

export type AppRouter = typeof appRouter;
