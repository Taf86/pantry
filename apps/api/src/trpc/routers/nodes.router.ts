import {
  Permission,
  consumeNodeInput,
  createNodeInput,
  deleteNodeInput,
  moveNodeInput,
  updateNodeInput,
} from "pantry-shared";

import {
  consumeNode,
  createNode,
  deleteNode,
  getTree,
  moveNode,
  updateNode,
} from "../../services/nodes.service.js";
import { pantryProcedure } from "../procedures.js";
import { router } from "../trpc.js";

export const nodesRouter = router({
  tree: pantryProcedure(Permission.Read).query(({ ctx, input }) =>
    getTree(ctx, input.pantryId),
  ),

  create: pantryProcedure(Permission.Write)
    .input(createNodeInput)
    .mutation(({ ctx, input }) => createNode(ctx, ctx.user.id, input)),

  update: pantryProcedure(Permission.Write)
    .input(updateNodeInput)
    .mutation(({ ctx, input }) => updateNode(ctx, ctx.user.id, input)),

  delete: pantryProcedure(Permission.Write)
    .input(deleteNodeInput)
    .mutation(({ ctx, input }) => deleteNode(ctx, ctx.user.id, input)),

  move: pantryProcedure(Permission.Write)
    .input(moveNodeInput)
    .mutation(({ ctx, input }) => moveNode(ctx, ctx.user.id, input)),

  /** Consumare non è modificare: basta il permesso di fare la spesa. */
  consume: pantryProcedure(Permission.Shop)
    .input(consumeNodeInput)
    .mutation(({ ctx, input }) => consumeNode(ctx, ctx.user.id, input)),
});
