import * as z from "zod";

export const ADMIN_REQUESTS_PATH = "/admin/requests";

export const PUSH_TAG_REQUESTS = "pantry-requests";

export const MAX_PUSH_ENDPOINT_LENGTH = 1000;

export const pushSubscriptionInputSchema = z.object({
  endpoint: z.url().max(MAX_PUSH_ENDPOINT_LENGTH),
  keys: z.object({
    p256dh: z.string().min(1).max(200),
    auth: z.string().min(1).max(50),
  }),
  userAgent: z.string().max(300).optional(),
});
export type PushSubscriptionInput = z.infer<typeof pushSubscriptionInputSchema>;

export const pushEndpointInputSchema = z.object({
  endpoint: z.url().max(MAX_PUSH_ENDPOINT_LENGTH),
});
export type PushEndpointInput = z.infer<typeof pushEndpointInputSchema>;

export type PushConfigResult = { publicKey: string | null };

export type PushNotification = {
  title: string;
  body: string;
  url: string;
  tag: string;
};

export const requestQueuedNotification = (
  pending: number,
): PushNotification => ({
  title: "Pantry",
  body:
    pending === 1
      ? "1 richiesta in attesa di approvazione."
      : `${String(pending)} richieste in attesa di approvazione.`,
  url: ADMIN_REQUESTS_PATH,
  tag: PUSH_TAG_REQUESTS,
});
