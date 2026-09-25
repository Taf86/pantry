import type { ServerEvent } from "@pantry/shared";

/**
 * The notification channel, as the services see it.
 *
 * Services do not know Socket.IO exists: they publish an event and move on.
 * That is what lets them be tested against a recording bus, and what would let
 * the transport change without touching a line of domain logic.
 */
export interface EventBus {
  publish(event: ServerEvent): void;
  /**
   * Force a user out of a list's room.
   *
   * Publishing that a member was removed is not enough: their socket is still
   * joined, and would keep receiving every subsequent item event for a list
   * they can no longer read.
   */
  revoke(listId: string, userId: string): void;
}

/** An inert bus: used in tests, and before the realtime server is built. */
export const nullEventBus: EventBus = {
  publish: () => undefined,
  revoke: () => undefined,
};

export interface RecordingEventBus extends EventBus {
  events: ServerEvent[];
  revoked: Array<{ listId: string; userId: string }>;
  reset(): void;
}

/** A bus that records what it was given, so a test can assert on it. */
export const createRecordingEventBus = (): RecordingEventBus => {
  const events: ServerEvent[] = [];
  const revoked: Array<{ listId: string; userId: string }> = [];

  return {
    events,
    revoked,
    publish: (event) => {
      events.push(event);
    },
    revoke: (listId, userId) => {
      revoked.push({ listId, userId });
    },
    reset: () => {
      events.length = 0;
      revoked.length = 0;
    },
  };
};
