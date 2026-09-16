import z from "zod";
import {
  DEFAULT_PAGE_SIZE,
  MAX_NAME_LENGTH,
  MAX_PAGE_SIZE,
  MIN_PASSWORD_LENGTH,
} from "../constants.js";

export const nameSchema = z.string().trim().min(1).max(MAX_NAME_LENGTH);
export const emailSchema = z.string().trim().toLowerCase().pipe(z.email());
export const passwordSchema = z
  .string()
  .min(
    MIN_PASSWORD_LENGTH,
    `At least ${MIN_PASSWORD_LENGTH} characters required`,
  )
  .max(200);

/** Zero-based page request, shaped like the table state that produces it. */
export const paginationSchema = z.object({
  pageIndex: z.number().int().min(0),
  pageSize: z.number().int().min(1).max(MAX_PAGE_SIZE),
});
export type Pagination = z.infer<typeof paginationSchema>;

export const DEFAULT_PAGINATION: Pagination = {
  pageIndex: 0,
  pageSize: DEFAULT_PAGE_SIZE,
};

/**
 * One page of rows plus the number of rows the filters match, which is what a
 * server-driven table needs to know how many pages there are.
 */
export type Page<TRow> = {
  rows: TRow[];
  rowCount: number;
};
