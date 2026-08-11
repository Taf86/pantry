import { router } from "../trpc.js";
import { accountRouter } from "./account.router.js";
import { adminRouter } from "./admin.router.js";
import { itemsRouter } from "./items.router.js";
import { listsRouter } from "./lists.router.js";
import { nodesRouter } from "./nodes.router.js";
import { pantriesRouter } from "./pantries.router.js";
import { shoppingRouter } from "./shopping.router.js";

export const appRouter = router({
  account: accountRouter,
  admin: adminRouter,
  items: itemsRouter,
  lists: listsRouter,
  nodes: nodesRouter,
  pantries: pantriesRouter,
  shopping: shoppingRouter,
});

export type AppRouter = typeof appRouter;
