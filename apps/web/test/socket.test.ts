import { QueryClient } from "@tanstack/react-query";
import {
  Role,
  type ListMember,
  type ListMembers,
  type ListSummary,
  type User,
} from "@pantry/shared";
import { beforeEach, describe, expect, it } from "vitest";

import { keys } from "@/lib/keys";
import { MUTATION } from "@/lib/mutations";
import { applyServerEvent } from "@/lib/socket";

const LIST = "0199a0d0-0000-7000-8000-ffffffffffff";
const ME = "me";
const MATE = "mate";

const aSummary = (overrides: Partial<ListSummary> = {}): ListSummary => ({
  id: LIST,
  name: "Spesa",
  createdBy: ME,
  createdByDisplayName: "Me",
  permissions: Role.Owner,
  ...overrides,
});

const pending = (client: QueryClient, name: string, variables: unknown) => {
  void client
    .getMutationCache()
    .build(client, {
      mutationKey: [name],
      mutationFn: () => new Promise<never>(() => undefined),
    })
    .execute(variables);
};

const isStale = (client: QueryClient, key: readonly unknown[]): boolean =>
  client.getQueryState(key)?.isInvalidated ?? false;

describe("applyServerEvent", () => {
  let client: QueryClient;

  beforeEach(() => {
    client = new QueryClient();
    client.setQueryData<User>(keys.me(), { id: ME } as User);
    const summary = aSummary();
    client.setQueryData<ListSummary[]>(keys.lists(), [summary]);
    client.setQueryData<ListMembers>(keys.listMembers(LIST), {
      listId: summary.id,
      listName: summary.name,
      createdBy: summary.createdBy,
      createdByDisplayName: summary.createdByDisplayName,
      members: [] as ListMember[],
    });
  });

  describe("lists", () => {
    it("renames a list everywhere it is shown", () => {
      applyServerEvent(client, {
        type: "list.updated",
        listId: LIST,
        list: { id: LIST, name: "Spesa grande" },
      });

      expect(client.getQueryData<ListSummary[]>(keys.lists())?.[0]?.name).toBe(
        "Spesa grande",
      );
      expect(
        client.getQueryData<ListMembers>(keys.listMembers(LIST))?.listName,
      ).toBe("Spesa grande");
    });

    it("forgets a list deleted elsewhere, and says so", () => {
      const notice = applyServerEvent(client, {
        type: "list.deleted",
        listId: LIST,
      });

      expect(client.getQueryData(keys.lists())).toEqual([]);
      expect(client.getQueryData(keys.listMembers(LIST))).toBeUndefined();
      expect(notice).toEqual({ kind: "deleted", name: "Spesa" });
    });

    it("says nothing about a delete this device made itself", () => {
      pending(client, MUTATION.listDelete, { listId: LIST });

      const notice = applyServerEvent(client, {
        type: "list.deleted",
        listId: LIST,
      });

      expect(notice).toBeNull();
    });
  });

  describe("members", () => {
    it("refreshes the members of a list when somebody else changes", () => {
      applyServerEvent(client, {
        type: "list.member.changed",
        listId: LIST,
        userId: MATE,
        permissions: Role.Editor,
      });

      expect(isStale(client, keys.listMembers(LIST))).toBe(true);
      expect(isStale(client, keys.lists())).toBe(true);
    });

    it("forgets a list the user was removed from, and says so", () => {
      const notice = applyServerEvent(client, {
        type: "list.member.changed",
        listId: LIST,
        userId: ME,
        permissions: null,
      });

      expect(client.getQueryData(keys.lists())).toEqual([]);
      expect(client.getQueryData(keys.listMembers(LIST))).toBeUndefined();
      expect(notice).toEqual({ kind: "revoked", name: "Spesa" });
    });

    it("says nothing when the user is the one leaving", () => {
      pending(client, MUTATION.listMemberRemove, { listId: LIST, userId: ME });

      const notice = applyServerEvent(client, {
        type: "list.member.changed",
        listId: LIST,
        userId: ME,
        permissions: null,
      });

      expect(notice).toBeNull();
    });

    it("refetches the index when the user is added to a list", () => {
      const other = "0199a0d0-0000-7000-8000-eeeeeeeeeeee";

      const notice = applyServerEvent(client, {
        type: "list.member.changed",
        listId: other,
        userId: ME,
        permissions: Role.Editor,
      });

      expect(isStale(client, keys.lists())).toBe(true);
      expect(notice).toBeNull();
    });
  });
});
