import { PUSH_NOTIFIER, requestQueuedNotification } from "@pantry/shared";
import type { PushNotification } from "@pantry/shared";
import type { Logger } from "pino";

import type { AppConfig } from "../../config/env.js";
import type { Database } from "../../db/client.js";
import { countOpenRequests } from "../admin/requests.service.js";
import { notifyAdmins } from "../push/push.service.js";
import type { PushSender } from "../push/webpush.js";

export interface AdminNotifier {
  requestQueued: () => void;
  stop: () => Promise<void>;
}

export interface NotifierOptions {
  cooldownMs?: number;
  maxPerHour?: number;
  now?: () => number;
  setTimer?: (fn: () => void, ms: number) => NodeJS.Timeout;
  clearTimer?: (timer: NodeJS.Timeout) => void;
}

export const createNotifier = (
  deps: {
    countPending: () => Promise<number>;
    notify: (notification: PushNotification) => Promise<void>;
    logger: Pick<Logger, "error">;
  },
  options: NotifierOptions = {},
): AdminNotifier => {
  const cooldownMs = options.cooldownMs ?? PUSH_NOTIFIER.cooldownMs;
  const maxPerHour = options.maxPerHour ?? PUSH_NOTIFIER.maxPerHour;
  const now = options.now ?? Date.now;
  const setTimer = options.setTimer ?? setTimeout;
  const clearTimer = options.clearTimer ?? clearTimeout;

  let lastSentAt = Number.NEGATIVE_INFINITY;
  let pending = false;
  let timer: NodeJS.Timeout | undefined;
  let inFlight: Promise<void> | undefined;
  let sentAt: number[] = [];
  let stopped = false;

  const withinCeiling = (): boolean => {
    const cutoff = now() - 3_600_000;
    sentAt = sentAt.filter((at) => at > cutoff);
    return sentAt.length < maxPerHour;
  };

  const send = (): void => {
    lastSentAt = now();
    sentAt.push(lastSentAt);
    inFlight = deps
      .countPending()
      .then((total) =>
        total > 0 ? deps.notify(requestQueuedNotification(total)) : undefined,
      )
      .catch((error: unknown) => {
        deps.logger.error({ error }, "Admin notification failed.");
      })
      .finally(() => {
        inFlight = undefined;
      });
  };

  const schedule = (): void => {
    if (timer !== undefined) return;
    timer = setTimer(
      () => {
        timer = undefined;
        if (stopped || !pending) return;
        pending = false;
        if (withinCeiling()) send();
      },
      Math.max(0, lastSentAt + cooldownMs - now()),
    );
    timer.unref?.();
  };

  return {
    requestQueued: () => {
      if (stopped) return;
      if (now() - lastSentAt >= cooldownMs && withinCeiling()) {
        send();
        return;
      }
      pending = true;
      schedule();
    },

    stop: async () => {
      stopped = true;
      pending = false;
      if (timer !== undefined) {
        clearTimer(timer);
        timer = undefined;
      }
      await inFlight;
    },
  };
};

export const createAdminNotifier = (
  deps: {
    db: Database;
    config: AppConfig;
    logger: Logger;
    send?: PushSender;
  },
  options: NotifierOptions = {},
): AdminNotifier =>
  createNotifier(
    {
      countPending: async () =>
        (await countOpenRequests({ db: deps.db })).total,
      notify: (notification) => notifyAdmins(deps, notification),
      logger: deps.logger,
    },
    options,
  );
