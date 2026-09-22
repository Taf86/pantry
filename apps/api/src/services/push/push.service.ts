import { randomUUID } from "node:crypto";

import {
  MAX_PUSH_SUBSCRIPTIONS_PER_USER,
  PUSH_SUBSCRIPTION_TTL_DAYS,
  UserRole,
  UserStatus,
  type PushNotification,
  type PushSubscriptionInput,
} from "@pantry/shared";
import { TRPCError } from "@trpc/server";
import { and, asc, eq, inArray, lt } from "drizzle-orm";
import type { Logger } from "pino";

import type { AppConfig } from "../../config/env.js";
import type { Database } from "../../db/client.js";
import { pushSubscriptions } from "../../db/schema/push-subscriptions.js";
import { users } from "../../db/schema/users.js";
import {
  isAllowedPushEndpoint,
  sendWebPush,
  type PushSender,
} from "./webpush.js";

export interface PushDeps {
  db: Database;
  config: AppConfig;
  logger: Logger;
  send?: PushSender;
}

const MS_PER_DAY = 86_400_000;

export const registerSubscription = async (
  deps: Pick<PushDeps, "db">,
  userId: string,
  input: PushSubscriptionInput,
): Promise<void> => {
  if (!isAllowedPushEndpoint(input.endpoint)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Unrecognised push service.",
    });
  }

  await deps.db
    .insert(pushSubscriptions)
    .values({
      id: randomUUID(),
      userId,
      endpoint: input.endpoint,
      p256dh: input.keys.p256dh,
      auth: input.keys.auth,
      userAgent: input.userAgent ?? null,
    })
    .onConflictDoUpdate({
      target: pushSubscriptions.endpoint,
      set: {
        userId,
        p256dh: input.keys.p256dh,
        auth: input.keys.auth,
        userAgent: input.userAgent ?? null,
        lastSeenAt: new Date(),
      },
    });

  await evictOldestOverCap(deps.db, userId);
};

const evictOldestOverCap = async (
  db: Database,
  userId: string,
): Promise<void> => {
  const owned = await db
    .select({ id: pushSubscriptions.id })
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.userId, userId))
    .orderBy(asc(pushSubscriptions.lastSeenAt));

  const surplus = owned.slice(
    0,
    Math.max(0, owned.length - MAX_PUSH_SUBSCRIPTIONS_PER_USER),
  );
  if (surplus.length === 0) return;

  await db.delete(pushSubscriptions).where(
    inArray(
      pushSubscriptions.id,
      surplus.map((row) => row.id),
    ),
  );
};

export const removeSubscription = async (
  deps: Pick<PushDeps, "db">,
  userId: string,
  endpoint: string,
): Promise<void> => {
  await deps.db
    .delete(pushSubscriptions)
    .where(
      and(
        eq(pushSubscriptions.userId, userId),
        eq(pushSubscriptions.endpoint, endpoint),
      ),
    );
};

export const notifyAdmins = async (
  deps: PushDeps,
  notification: PushNotification,
): Promise<void> => {
  const vapid = deps.config.push;
  if (!vapid) return;

  const targets = await deps.db
    .select({
      endpoint: pushSubscriptions.endpoint,
      p256dh: pushSubscriptions.p256dh,
      auth: pushSubscriptions.auth,
    })
    .from(pushSubscriptions)
    .innerJoin(users, eq(users.id, pushSubscriptions.userId))
    .where(
      and(eq(users.role, UserRole.admin), eq(users.status, UserStatus.active)),
    );

  if (targets.length === 0) return;

  const send = deps.send ?? sendWebPush;
  const payload = JSON.stringify(notification);

  const settled = await Promise.allSettled(
    targets.map((target) =>
      send(vapid, target, payload, {
        ttl: 3600,
        topic: notification.tag,
      }),
    ),
  );

  const gone: string[] = [];
  for (const [index, result] of settled.entries()) {
    const endpoint = targets[index]?.endpoint;
    if (endpoint === undefined) continue;

    if (result.status === "rejected") {
      deps.logger.warn(
        { error: result.reason },
        "Push delivery failed to reach the service.",
      );
      continue;
    }

    const { status } = result.value;
    if (status === 404 || status === 410) {
      gone.push(endpoint);
    } else if (status >= 400) {
      deps.logger.error({ status }, "Push service refused a notification.");
    }
  }

  if (gone.length > 0) {
    await deps.db
      .delete(pushSubscriptions)
      .where(inArray(pushSubscriptions.endpoint, gone));
  }
};

export const sweepStalePushSubscriptions = async (
  db: Database,
): Promise<number> => {
  const cutoff = new Date(Date.now() - PUSH_SUBSCRIPTION_TTL_DAYS * MS_PER_DAY);

  const removed = await db
    .delete(pushSubscriptions)
    .where(lt(pushSubscriptions.lastSeenAt, cutoff))
    .returning({ id: pushSubscriptions.id });

  return removed.length;
};
