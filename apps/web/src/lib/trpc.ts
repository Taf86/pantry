import { createTRPCClient, httpBatchLink, TRPCClientError } from "@trpc/client";
import type { AppRouter } from "pantry-api";

export const trpc = createTRPCClient<AppRouter>({
  links: [
    httpBatchLink({
      url: "/api/trpc",
      fetch: (input, init) =>
        fetch(input, { ...init, credentials: "include" } as RequestInit),
    }),
  ],
});

export type ApiError = TRPCClientError<AppRouter>;

export const isApiError = (error: unknown): error is ApiError =>
  error instanceof TRPCClientError;

export const errorCode = (error: unknown): string | null =>
  isApiError(error) ? (error.data?.code ?? null) : null;

export const isRetriable = (error: unknown): boolean => {
  const code = errorCode(error);
  if (code === null) return true;
  return code === "INTERNAL_SERVER_ERROR" || code === "TIMEOUT";
};

export const errorMessage = (error: unknown): string => {
  if (isApiError(error)) return error.message;
  if (error instanceof Error) return error.message;
  return "Unkown error";
};
