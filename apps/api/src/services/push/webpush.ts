import webpush from "web-push";

import type { PushConfig } from "../../config/env.js";

export interface PushTarget {
  endpoint: string;
  p256dh: string;
  auth: string;
}

export interface PushSendOptions {
  ttl?: number;
  topic?: string;
}

export interface PushResult {
  endpoint: string;
  status: number;
}

export type PushSender = (
  vapid: PushConfig,
  target: PushTarget,
  payload: string,
  options?: PushSendOptions,
) => Promise<PushResult>;

const SEND_TIMEOUT_MS = 5_000;

const ALLOWED_PUSH_HOSTS = [
  "fcm.googleapis.com",
  "updates.push.services.mozilla.com",
  ".push.services.mozilla.com",
  ".notify.windows.com",
  "web.push.apple.com",
] as const;

export const isAllowedPushEndpoint = (endpoint: string): boolean => {
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }
  if (url.protocol !== "https:") return false;

  return ALLOWED_PUSH_HOSTS.some((host) =>
    host.startsWith(".") ? url.hostname.endsWith(host) : url.hostname === host,
  );
};

export const sendWebPush: PushSender = async (
  vapid,
  target,
  payload,
  options = {},
) => {
  if (!isAllowedPushEndpoint(target.endpoint)) {
    return { endpoint: target.endpoint, status: 403 };
  }

  const details = webpush.generateRequestDetails(
    {
      endpoint: target.endpoint,
      keys: { p256dh: target.p256dh, auth: target.auth },
    },
    payload,
    {
      contentEncoding: "aes128gcm",
      vapidDetails: {
        subject: vapid.subject,
        publicKey: vapid.publicKey,
        privateKey: vapid.privateKey,
      },
      ...(options.ttl === undefined ? {} : { TTL: options.ttl }),
      ...(options.topic === undefined ? {} : { topic: options.topic }),
    },
  );

  const response = await fetch(details.endpoint, {
    method: "POST",
    headers: details.headers as Record<string, string>,
    body: new Uint8Array(details.body),
    redirect: "error",
    signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
  });

  return { endpoint: target.endpoint, status: response.status };
};
