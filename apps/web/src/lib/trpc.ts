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

export const isRetriable = (error: unknown): boolean => {
  const code = isApiError(error) ? (error.data?.code ?? null) : null;
  return (
    code === null || code === "INTERNAL_SERVER_ERROR" || code === "TIMEOUT"
  );
};
