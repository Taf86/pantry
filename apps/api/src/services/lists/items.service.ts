import {
  MAX_ITEMS_PER_LIST,
  UNCATEGORIZED_SORT_ORDER,
  WriteOutcome,
  serializeDates,
  type AddItemInput,
  type DeleteItemInput,
  type ItemWriteResult,
  type ListItem,
  type ListItemsInput,
  type UpdateItemInput,
} from "@pantry/shared";
import { TRPCError } from "@trpc/server";
import { and, asc, count, eq, isNull, lte, sql } from "drizzle-orm";

import type { Database, Executor } from "../../db/client.js";
import { categories } from "../../db/schema/categories.js";
import { listItems } from "../../db/schema/list-items.js";
import { lists } from "../../db/schema/lists.js";
import type { EventBus } from "../../realtime/events.js";
import { clampToNow } from "./clock.js";
import { claimMutation } from "./mutations.js";
import { resolveProduct } from "./products.service.js";

export interface ItemDeps {
  db: Database;
  events: EventBus;
}

type ItemRow = typeof listItems.$inferSelect;

/**
 * The wire shape of an item.
 *
 * `productId` and `checkedIn` are deliberately absent: the catalogue is an
 * internal index the client must never learn identifiers from, and the session
 * an item was ticked in only matters to the pantry bridge, server-side.
 */
export const toListItem = (row: ItemRow): ListItem =>
  serializeDates({
    id: row.id,
    listId: row.listId,
    rawText: row.rawText,
    name: row.name,
    quantity: row.quantity,
    unit: row.unit,
    unitText: row.unitText,
    note: row.note,
    categoryId: row.categoryId,
    contentUpdatedAt: row.contentUpdatedAt,
    checkedAt: row.checkedAt,
    checkedBy: row.checkedBy,
    checkUpdatedAt: row.checkUpdatedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    deletedAt: row.deletedAt,
  });

export const requireItem = async (
  db: Executor,
  listId: string,
  itemId: string,
): Promise<ItemRow> => {
  const [row] = await db
    .select()
    .from(listItems)
    .where(and(eq(listItems.id, itemId), eq(listItems.listId, listId)))
    .limit(1);

  if (!row) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Item not existing." });
  }
  return row;
};

/**
 * The aisle order: by category, then by id.
 *
 * Ids are UUID v7, so ordering by id IS ordering by creation — which is why
 * there is no position column to renumber, and why two devices adding items
 * offline produce a stable order without ever agreeing on one.
 */
export const listItemsOf = async (
  deps: ItemDeps,
  input: ListItemsInput,
): Promise<ListItem[]> => {
  const rows = await deps.db
    .select({ item: listItems })
    .from(listItems)
    .leftJoin(categories, eq(categories.id, listItems.categoryId))
    .where(
      input.includeDeleted
        ? eq(listItems.listId, input.listId)
        : and(eq(listItems.listId, input.listId), isNull(listItems.deletedAt)),
    )
    .orderBy(
      asc(sql`COALESCE(${categories.sortOrder}, ${UNCATEGORIZED_SORT_ORDER})`),
      asc(listItems.id),
    );

  return rows.map((row) => toListItem(row.item));
};

const result = (
  outcome: WriteOutcome,
  row: ItemRow,
  now: Date,
): ItemWriteResult => ({
  outcome,
  item: toListItem(row),
  serverTime: now.toISOString(),
});

/**
 * Adds an item under the id the client already generated.
 *
 * The insert is idempotent on that id, so a queue that retries cannot produce
 * two rows. Two people adding the same product at once DO produce two rows,
 * and that is correct: two separate intentions, two separate ids.
 */
export const addItem = async (
  deps: ItemDeps,
  actorId: string,
  input: AddItemInput,
): Promise<ItemWriteResult> => {
  const now = new Date();
  const at = clampToNow(new Date(input.contentUpdatedAt), now);

  const outcome = await deps.db.transaction(async (tx) => {
    if (!(await claimMutation(tx, input.mutationId, actorId))) {
      return {
        outcome: WriteOutcome.deduplicated,
        row: await requireItem(tx, input.listId, input.id),
      };
    }

    const [items] = await tx
      .select({ total: count() })
      .from(listItems)
      .where(
        and(eq(listItems.listId, input.listId), isNull(listItems.deletedAt)),
      );

    if ((items?.total ?? 0) >= MAX_ITEMS_PER_LIST) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "List is full." });
    }

    const product = await resolveProduct(tx, input.listId, {
      name: input.name,
      quantity: input.quantity,
      unit: input.unit,
      unitText: input.unitText,
      at,
    });

    const [inserted] = await tx
      .insert(listItems)
      .values({
        id: input.id,
        listId: input.listId,
        rawText: input.rawText,
        name: input.name,
        quantity: input.quantity,
        unit: input.unit,
        unitText: input.unitText,
        note: input.note,
        // What the client picked wins; the catalogue only fills a gap, so a
        // deliberate choice is never quietly overwritten by a remembered one.
        categoryId: input.categoryId ?? product?.categoryId ?? null,
        productId: product?.id ?? null,
        contentUpdatedAt: at,
        checkUpdatedAt: at,
        createdBy: actorId,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoNothing()
      .returning();

    if (inserted) {
      await touchList(tx, input.listId, now);
      return { outcome: WriteOutcome.applied, row: inserted };
    }

    // The id is already there: a retry that lost its mutation id, or a
    // genuinely duplicated request. Either way the row stands.
    return {
      outcome: WriteOutcome.stale,
      row: await requireItem(tx, input.listId, input.id),
    };
  });

  if (outcome.outcome === WriteOutcome.applied) {
    deps.events.publish({
      type: "item.upserted",
      listId: input.listId,
      item: toListItem(outcome.row),
    });
  }
  return result(outcome.outcome, outcome.row, now);
};

/**
 * Rewrites the whole content group, if the incoming write is at least as new.
 *
 * A skipped write is NOT an error and never travels as one. There is no
 * CONFLICT, no cause, no dialog: the server keeps what it has, says `stale`,
 * and hands the row back for the client to adopt. That is the entire reason
 * optimistic locking was dropped — a queue of twenty offline edits produces at
 * most twenty silent `stale` results instead of twenty modal interruptions.
 */
export const updateItem = async (
  deps: ItemDeps,
  actorId: string,
  input: UpdateItemInput,
): Promise<ItemWriteResult> => {
  const now = new Date();
  const at = clampToNow(new Date(input.contentUpdatedAt), now);

  const outcome = await deps.db.transaction(async (tx) => {
    if (!(await claimMutation(tx, input.mutationId, actorId))) {
      return {
        outcome: WriteOutcome.deduplicated,
        row: await requireItem(tx, input.listId, input.id),
      };
    }

    const product = await resolveProduct(tx, input.listId, {
      name: input.name,
      quantity: input.quantity,
      unit: input.unit,
      unitText: input.unitText,
      at,
    });

    const [updated] = await tx
      .update(listItems)
      .set({
        rawText: input.rawText,
        name: input.name,
        quantity: input.quantity,
        unit: input.unit,
        unitText: input.unitText,
        note: input.note,
        categoryId: input.categoryId ?? product?.categoryId ?? null,
        productId: product?.id ?? null,
        contentUpdatedAt: at,
        updatedAt: now,
      })
      .where(
        and(
          eq(listItems.id, input.id),
          eq(listItems.listId, input.listId),
          // A tombstone is terminal: no edit resurrects it.
          isNull(listItems.deletedAt),
          // The pivot. Ties apply, which makes a resend idempotent.
          lte(listItems.contentUpdatedAt, at),
        ),
      )
      .returning();

    if (updated) {
      await touchList(tx, input.listId, now);
      return { outcome: WriteOutcome.applied, row: updated };
    }

    // Nothing was written: the stored content is newer, or the row is a
    // tombstone. Neither is a conflict. A genuinely missing row throws, which
    // rolls back the claim so a mutation that merely arrived early can retry.
    return {
      outcome: WriteOutcome.stale,
      row: await requireItem(tx, input.listId, input.id),
    };
  });

  if (outcome.outcome === WriteOutcome.applied) {
    deps.events.publish({
      type: "item.upserted",
      listId: input.listId,
      item: toListItem(outcome.row),
    });
  }
  return result(outcome.outcome, outcome.row, now);
};

/**
 * Tombstones an item. No last-write-wins pivot, on purpose.
 *
 * Deletion is terminal and idempotent, so an older delete arriving after a
 * newer edit still applies: a delete that could not land would mean the row
 * reappears on the user's device and has to be deleted again, which reads as a
 * broken button. Resurrection is prevented from the other side, by the
 * `deletedAt IS NULL` in every update.
 */
export const deleteItem = async (
  deps: ItemDeps,
  actorId: string,
  input: DeleteItemInput,
): Promise<ItemWriteResult> => {
  const now = new Date();

  const outcome = await deps.db.transaction(async (tx) => {
    if (!(await claimMutation(tx, input.mutationId, actorId))) {
      return {
        outcome: WriteOutcome.deduplicated,
        row: await requireItem(tx, input.listId, input.id),
      };
    }

    const [deleted] = await tx
      .update(listItems)
      .set({ deletedAt: now, updatedAt: now })
      .where(
        and(
          eq(listItems.id, input.id),
          eq(listItems.listId, input.listId),
          isNull(listItems.deletedAt),
        ),
      )
      .returning();

    if (deleted) {
      await touchList(tx, input.listId, now);
      return { outcome: WriteOutcome.applied, row: deleted };
    }
    return {
      outcome: WriteOutcome.stale,
      row: await requireItem(tx, input.listId, input.id),
    };
  });

  if (outcome.outcome === WriteOutcome.applied) {
    deps.events.publish({
      type: "item.deleted",
      listId: input.listId,
      itemId: input.id,
    });
  }
  return result(outcome.outcome, outcome.row, now);
};

/** Keeps the list index ordered by when anything in it last moved. */
const touchList = async (
  tx: Executor,
  listId: string,
  now: Date,
): Promise<void> => {
  await tx.update(lists).set({ updatedAt: now }).where(eq(lists.id, listId));
};
