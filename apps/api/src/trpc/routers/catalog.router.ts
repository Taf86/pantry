import { getLookups } from "../../services/catalog/catalog.service.js";
import { authedProcedure, router } from "../trpc.js";

export const catalogRouter = router({
  lookups: authedProcedure.query(({ ctx }) => getLookups(ctx)),
});
