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
  /**
   * Close every socket of a user whose sessions are all gone — suspended,
   * deactivated, deleted. A socket is authenticated once, at the handshake, so
   * without this it would keep receiving events after the account was shut.
   */
  disconnectUser(userId: string): void;
  /** Close the sockets opened with one session: a sign-out on one device. */
  disconnectSession(sessionId: string): void;
}

/** An inert bus: used in tests, and before the realtime server is built. */
export const nullEventBus: EventBus = {
  publish: () => undefined,
  revoke: () => undefined,
  disconnectUser: () => undefined,
  disconnectSession: () => undefined,
};

export interface RecordingEventBus extends EventBus {
  events: ServerEvent[];
  revoked: Array<{ listId: string; userId: string }>;
  disconnectedUsers: string[];
  disconnectedSessions: string[];
  reset(): void;
}

/** A bus that records what it was given, so a test can assert on it. */
export const createRecordingEventBus = (): RecordingEventBus => {
  const events: ServerEvent[] = [];
  const revoked: Array<{ listId: string; userId: string }> = [];
  const disconnectedUsers: string[] = [];
  const disconnectedSessions: string[] = [];

  return {
    events,
    revoked,
    disconnectedUsers,
    disconnectedSessions,
    publish: (event) => {
      events.push(event);
    },
    revoke: (listId, userId) => {
      revoked.push({ listId, userId });
    },
    disconnectUser: (userId) => {
      disconnectedUsers.push(userId);
    },
    disconnectSession: (sessionId) => {
      disconnectedSessions.push(sessionId);
    },
    reset: () => {
      events.length = 0;
      revoked.length = 0;
      disconnectedUsers.length = 0;
      disconnectedSessions.length = 0;
    },
  };
};
