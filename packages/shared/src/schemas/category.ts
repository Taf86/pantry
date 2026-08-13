import { z } from "zod";

import { categoryIdSchema, sortOrderSchema } from "./common.js";

export const categorySchema = z.object({
  id: categoryIdSchema,
  name: z.string(),
  sortOrder: sortOrderSchema,
});
export type Category = z.infer<typeof categorySchema>;
