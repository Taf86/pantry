import type { ServerEvent } from "@pantry/shared";

export interface EventBus {
  publish(event: ServerEvent): void;
  revoke(listId: string, userId: string): void;
  disconnectUser(userId: string): void;
  disconnectSession(sessionId: string): void;
}

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

export const createRecordingEventBus = (): RecordingEventBus => {
  const events: ServerEvent[] = [];
  const revoked: Array<{ listId: string; userId: string }> = [];
  const disconnectedUsers: string[] = [];
  const disconnectedSessions: string[] = [];
  return {
    events,
    revoked,
    disconnectedSessions,
    disconnectedUsers,
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
