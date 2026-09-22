import { keys } from "@/lib/keys";
import {
  getSubscription,
  notificationPermission,
  pushSupport,
  subscribeToPush,
  toSubscribeInput,
  type PushSupport,
} from "@/lib/push";
import { trpc } from "@/lib/trpc";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useState } from "react";

export type PushOutcome =
  | "enabled"
  | "disabled"
  | "unavailable"
  | "denied"
  | "install-first"
  | "unsupported"
  | "error";

export interface PushNotificationsState {
  support: PushSupport;
  permission: NotificationPermission;
  enabled: boolean | null;
  isPending: boolean;
  toggle: () => Promise<PushOutcome>;
}

export default function usePushNotifications(): PushNotificationsState {
  const support = pushSupport();
  const [permission, setPermission] = useState(notificationPermission);
  const [subscribed, setSubscribed] = useState<boolean | null>(null);

  const config = useQuery({
    queryKey: keys.pushConfig(),
    queryFn: () => trpc.push.config.query(),
    enabled: support === "supported",
    staleTime: 30_000,
  });
  const publicKey = config.data?.publicKey ?? null;
  const configSettled = config.isSuccess || config.isError;

  const subscribe = useMutation({
    mutationFn: (subscription: PushSubscription) =>
      trpc.push.subscribe.mutate(toSubscribeInput(subscription)),
  });
  const unsubscribe = useMutation({
    mutationFn: (endpoint: string) =>
      trpc.push.unsubscribe.mutate({ endpoint }),
  });

  const possible =
    support === "supported" && publicKey !== null && permission === "granted";

  const enabled: boolean | null =
    support !== "supported"
      ? false
      : !configSettled
        ? null
        : !possible
          ? false
          : subscribed;

  useEffect(() => {
    if (!possible) return;

    let cancelled = false;
    void (async () => {
      let subscription: PushSubscription | null = null;
      try {
        subscription = await getSubscription();
      } catch {
        //
      }
      if (cancelled) return;

      setSubscribed(subscription !== null);
      if (!subscription) return;
      try {
        await trpc.push.subscribe.mutate(toSubscribeInput(subscription));
      } catch {
        //
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [possible]);

  const enable = useCallback(async (): Promise<PushOutcome> => {
    if (publicKey === null) return config.isError ? "error" : "unavailable";

    try {
      const granted = await Notification.requestPermission();
      setPermission(granted);
      if (granted !== "granted") return "denied";

      const subscription = await subscribeToPush(publicKey);
      await subscribe.mutateAsync(subscription);
      setSubscribed(true);
      return "enabled";
    } catch {
      return "error";
    }
  }, [publicKey, config.isError, subscribe]);

  const disable = useCallback(async (): Promise<PushOutcome> => {
    try {
      const subscription = await getSubscription();
      if (subscription) {
        await unsubscribe.mutateAsync(subscription.endpoint);
        await subscription.unsubscribe();
      }
      setSubscribed(false);
      return "disabled";
    } catch {
      return "error";
    }
  }, [unsubscribe]);

  const toggle = useCallback((): Promise<PushOutcome> => {
    if (support !== "supported") return Promise.resolve(support);
    if (permission === "denied") return Promise.resolve("denied");
    return enabled === true ? disable() : enable();
  }, [support, permission, enabled, disable, enable]);

  return {
    support,
    permission,
    enabled,
    isPending: subscribe.isPending || unsubscribe.isPending,
    toggle,
  };
}
