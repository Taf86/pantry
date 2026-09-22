import type { PushSubscriptionInput } from "@pantry/shared";

export const PUSH_NAVIGATE_MESSAGE = "pantry:navigate";

export type PushSupport = "supported" | "install-first" | "unsupported";

export const pushSupport = (): PushSupport => {
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    return "unsupported";
  }
  if (!("serviceWorker" in navigator) || !("Notification" in window)) {
    return "unsupported";
  }
  if (!("PushManager" in window)) return "install-first";
  return "supported";
};

export const isPushSupported = (): boolean => pushSupport() === "supported";

export const notificationPermission = (): NotificationPermission => {
  if (typeof window === "undefined" || !("Notification" in window)) {
    return "denied";
  }
  return Notification.permission;
};

export const urlBase64ToUint8Array = (
  base64: string,
): Uint8Array<ArrayBuffer> => {
  const padded = base64.padEnd(
    base64.length + ((4 - (base64.length % 4)) % 4),
    "=",
  );
  const binary = atob(padded.replace(/-/g, "+").replace(/_/g, "/"));

  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
};

const registration = async (): Promise<ServiceWorkerRegistration | null> => {
  if (!("serviceWorker" in navigator)) return null;
  return (await navigator.serviceWorker.getRegistration()) ?? null;
};

export const getSubscription = async (): Promise<PushSubscription | null> => {
  const worker = await registration();
  return (await worker?.pushManager.getSubscription()) ?? null;
};

export const subscribeToPush = async (
  publicKey: string,
): Promise<PushSubscription> => {
  const worker = await registration();
  if (!worker) throw new Error("No service worker registration");

  return worker.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(publicKey),
  });
};

export const toSubscribeInput = (
  subscription: PushSubscription,
): PushSubscriptionInput => {
  const json = subscription.toJSON();
  const p256dh = json.keys?.["p256dh"];
  const auth = json.keys?.["auth"];

  if (!json.endpoint || !p256dh || !auth) {
    throw new Error("Incomplete push subscription");
  }

  return {
    endpoint: json.endpoint,
    keys: { p256dh, auth },
    ...(typeof navigator === "undefined"
      ? {}
      : { userAgent: navigator.userAgent.slice(0, 300) }),
  };
};
