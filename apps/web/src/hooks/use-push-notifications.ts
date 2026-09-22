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

export interface PushNotificationsState {
  support: PushSupport;
  permission: NotificationPermission;
  enabled: boolean;
  isPending: boolean;
  unavailable: boolean;
  failed: boolean;
  enable: () => Promise<void>;
  disable: () => Promise<void>;
}

export default function usePushNotifications(): PushNotificationsState {
  const support = pushSupport();
  const [permission, setPermission] = useState(notificationPermission);
  const [enabled, setEnabled] = useState(false);
  const [failed, setFailed] = useState(false);

  const config = useQuery({
    queryKey: keys.pushConfig(),
    queryFn: () => trpc.push.config.query(),
    enabled: support === "supported",
    staleTime: Infinity,
  });
  const publicKey = config.data?.publicKey ?? null;

  const subscribe = useMutation({
    mutationFn: (subscription: PushSubscription) =>
      trpc.push.subscribe.mutate(toSubscribeInput(subscription)),
  });
  const unsubscribe = useMutation({
    mutationFn: (endpoint: string) =>
      trpc.push.unsubscribe.mutate({ endpoint }),
  });

  useEffect(() => {
    if (support !== "supported" || publicKey === null) return;
    if (notificationPermission() !== "granted") return;

    let cancelled = false;
    void (async () => {
      const subscription = await getSubscription();
      if (cancelled || !subscription) return;
      setEnabled(true);
      try {
        await trpc.push.subscribe.mutate(toSubscribeInput(subscription));
      } catch {
        // A refresh that fails changes nothing the user can act on.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [support, publicKey]);

  const enable = useCallback(async () => {
    setFailed(false);
    if (publicKey === null) return;

    try {
      const granted = await Notification.requestPermission();
      setPermission(granted);
      if (granted !== "granted") return;

      const subscription = await subscribeToPush(publicKey);
      await subscribe.mutateAsync(subscription);
      setEnabled(true);
    } catch {
      setFailed(true);
    }
  }, [publicKey, subscribe]);

  const disable = useCallback(async () => {
    setFailed(false);
    try {
      const subscription = await getSubscription();
      if (subscription) {
        await unsubscribe.mutateAsync(subscription.endpoint);
        await subscription.unsubscribe();
      }
      setEnabled(false);
    } catch {
      setFailed(true);
    }
  }, [unsubscribe]);

  return {
    support,
    permission,
    enabled,
    isPending: subscribe.isPending || unsubscribe.isPending,
    unavailable: config.isSuccess && publicKey === null,
    failed,
    enable,
    disable,
  };
}
