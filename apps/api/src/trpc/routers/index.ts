import { router } from "../trpc.js";
import { accountRouter } from "./account.router.js";
import { adminRouter } from "./admin.router.js";
import { categoriesRouter } from "./categories.router.js";
import { itemsRouter } from "./items.router.js";
import { listsRouter } from "./lists.router.js";
import { pushRouter } from "./push.router.js";
import { shoppingRouter } from "./shopping.router.js";

export const appRouter = router({
  account: accountRouter,
  admin: adminRouter,
  categories: categoriesRouter,
  items: itemsRouter,
  lists: listsRouter,
  push: pushRouter,
  shopping: shoppingRouter,
});

export type AppRouter = typeof appRouter;
