import z from "zod";
import { MAX_NAME_LENGTH } from "../constants.js";

export const nameSchema = z.string().trim().min(1).max(MAX_NAME_LENGTH);
export const emailSchema = z.string().trim().toLowerCase().pipe(z.email());
