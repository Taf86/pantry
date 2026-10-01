import { router } from "../trpc.js";
import { accountRouter } from "./account.router.js";
import { adminRouter } from "./admin.router.js";
import { listsRouter } from "./lists.router.js";
import { pushRouter } from "./push.router.js";

export const appRouter = router({
  account: accountRouter,
  admin: adminRouter,
  push: pushRouter,
  lists: listsRouter,
});

export type AppRouter = typeof appRouter;
