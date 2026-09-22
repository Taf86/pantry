import z from "zod";
import {
  DEFAULT_PAGE_SIZE,
  MAX_CONTACT_LENGTH,
  MAX_NAME_LENGTH,
  MAX_PAGE_SIZE,
  MIN_PASSWORD_LENGTH,
} from "../constants.js";

export const nameSchema = z.string().trim().min(1).max(MAX_NAME_LENGTH);

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(MAX_CONTACT_LENGTH)
  .pipe(z.email());
export const passwordSchema = z
  .string()
  .min(
    MIN_PASSWORD_LENGTH,
    `At least ${MIN_PASSWORD_LENGTH} characters required`,
  )
  .max(200);

export const paginationSchema = z.object({
  pageIndex: z.number().int().min(0),
  pageSize: z.number().int().min(1).max(MAX_PAGE_SIZE),
});
export type Pagination = z.infer<typeof paginationSchema>;

export const DEFAULT_PAGINATION: Pagination = {
  pageIndex: 0,
  pageSize: DEFAULT_PAGE_SIZE,
};

export type Page<TRow> = {
  rows: TRow[];
  rowCount: number;
};
