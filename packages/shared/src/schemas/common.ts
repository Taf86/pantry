import z from "zod";
import { MAX_NAME_LENGTH, MIN_PASSWORD_LENGTH } from "../constants.js";

export const nameSchema = z.string().trim().min(1).max(MAX_NAME_LENGTH);
export const emailSchema = z.string().trim().toLowerCase().pipe(z.email());
export const passwordSchema = z
  .string()
  .min(
    MIN_PASSWORD_LENGTH,
    `At least ${MIN_PASSWORD_LENGTH} characters required`,
  )
  .max(200);
