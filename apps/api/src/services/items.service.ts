import { TRPCError } from "@trpc/server";
import { and, asc, eq, isNull, lte, sql } from "drizzle-orm";
import { CONFLICT_CODE } from "pantry-shared";
import type {
  AddItemInput,
  CheckItemInput,
  CheckManyInput,
  DeleteItemInput,
  ListItem,
  UncheckItemInput,
  UpdateItemInput,
} from "pantry-shared";

import type { Executor } from "../db/client.js";
import { listItems } from "../db/schema/lists.js";
import { toListItem } from "./mappers.js";
import { claimMutation } from "./mutations.js";
import type { ServiceDeps } from "./types.js";

const findRow = async (tx: Executor, id: string) => {
  const [row] = await tx
    .select()
    .from(listItems)
    .where(eq(listItems.id, id))
    .limit(1);
  return row ?? null;
};

const requireRow = async (tx: Executor, id: string) => {
  const row = await findRow(tx, id);
  if (!row) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Prodotto inesistente" });
  }
  return row;
};

/**
 * `COALESCE(checked_at, updated_at)` è il riferimento del last-write-wins.
 *
 * L'istante che conta è quello registrato dal dispositivo che ha agito, non
 * quello di arrivo al server: una spunta fatta in negozio alle 18:03 e
 * sincronizzata alle 18:40 non deve sovrascrivere una de-spunta delle 18:20.
 *
 * Il prezzo di questa formula è che anche una modifica di contenuto sposta il
 * riferimento. È il compromesso della specifica: nessuna colonna in più, e la
 * stessa regola valutata identica da client (`resolveCheck`) e server.
 */
const lastWriteWins = (at: Date) =>
  lte(sql`COALESCE(${listItems.checkedAt}, ${listItems.updatedAt})`, at);

export const listItemsOfList = async (
  deps: ServiceDeps,
  listId: string,
  includeDeleted: boolean,
): Promise<ListItem[]> => {
  const rows = await deps.db
    .select()
    .from(listItems)
    .where(
      includeDeleted
        ? eq(listItems.listId, listId)
        : and(eq(listItems.listId, listId), isNull(listItems.deletedAt)),
    )
    .orderBy(asc(listItems.sortOrder), asc(listItems.createdAt));

  return rows.map(toListItem);
};

/**
 * Due aggiunte concorrenti sono due prodotti diversi, ed è corretto così.
 * Il ritentativo della *stessa* aggiunta invece non deve duplicare nulla: lo
 * garantiscono la primary key generata dal client e il `mutationId`.
 */
export const addItem = async (
  deps: ServiceDeps,
  userId: string,
  input: AddItemInput,
): Promise<ListItem> => {
  const row = await deps.db.transaction(async (tx) => {
    if (!(await claimMutation(tx, input.mutationId, userId))) {
      return requireRow(tx, input.id);
    }

    const [inserted] = await tx
      .insert(listItems)
      .values({
        id: input.id,
        listId: input.listId,
        name: input.name,
        quantity: input.quantity ?? null,
        unit: input.unit ?? null,
        categoryId: input.categoryId ?? null,
        note: input.note ?? null,
        sortOrder: input.sortOrder ?? 0,
      })
      .onConflictDoNothing({ target: listItems.id })
      .returning();

    return inserted ?? requireRow(tx, input.id);
  });

  const item = toListItem(row);
  deps.events.publish({ type: "item.upserted", listId: item.listId, item });
  return item;
};

/**
 * Locking ottimistico: qui il lost update è reale, perché due persone possono
 * correggere la stessa quantità partendo dallo stesso valore.
 */
export const updateItem = async (
  deps: ServiceDeps,
  userId: string,
  input: UpdateItemInput,
): Promise<ListItem> => {
  const row = await deps.db.transaction(async (tx) => {
    if (!(await claimMutation(tx, input.mutationId, userId))) {
      return requireRow(tx, input.id);
    }

    const [updated] = await tx
      .update(listItems)
      .set({
        ...(input.name === undefined ? {} : { name: input.name }),
        ...(input.quantity === undefined ? {} : { quantity: input.quantity }),
        ...(input.unit === undefined ? {} : { unit: input.unit }),
        ...(input.categoryId === undefined
          ? {}
          : { categoryId: input.categoryId }),
        ...(input.note === undefined ? {} : { note: input.note }),
        ...(input.sortOrder === undefined
          ? {}
          : { sortOrder: input.sortOrder }),
        version: sql`${listItems.version} + 1`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(listItems.id, input.id),
          eq(listItems.listId, input.listId),
          eq(listItems.version, input.version),
          isNull(listItems.deletedAt),
        ),
      )
      .returning();

    if (updated) return updated;

    // Nessuna riga aggiornata: o la versione è vecchia, o la riga non c'è più.
    const current = await findRow(tx, input.id);
    throw new TRPCError({
      code: "CONFLICT",
      message: "Qualcuno ha modificato questo prodotto",
      cause: {
        code: CONFLICT_CODE,
        current: current ? toListItem(current) : null,
      },
    });
  });

  const item = toListItem(row);
  deps.events.publish({ type: "item.upserted", listId: item.listId, item });
  return item;
};

interface CheckArgs {
  listId: string;
  id: string;
  /** Istante dell'azione sul dispositivo. */
  at: Date;
  /** Valore da scrivere: la data per una spunta, `null` per una de-spunta. */
  checkedAt: Date | null;
  userId: string;
}

const applyCheck = async (tx: Executor, args: CheckArgs) => {
  const [updated] = await tx
    .update(listItems)
    .set({
      checkedAt: args.checkedAt,
      checkedBy: args.checkedAt === null ? null : args.userId,
      updatedAt: args.at,
    })
    .where(
      and(
        eq(listItems.id, args.id),
        eq(listItems.listId, args.listId),
        isNull(listItems.deletedAt),
        lastWriteWins(args.at),
      ),
    )
    .returning();

  // Nessun conflitto da segnalare: il LWW ha semplicemente deciso che la
  // scrittura arrivata è più vecchia dello stato corrente.
  return updated ?? (await findRow(tx, args.id));
};

/**
 * La spunta non tocca `version`: il locking ottimistico protegge il contenuto
 * del prodotto, non il fatto che sia nel carrello. Altrimenti chi fa la spesa
 * invaliderebbe di continuo le modifiche di chi è a casa.
 */
export const checkItem = async (
  deps: ServiceDeps,
  userId: string,
  input: CheckItemInput,
): Promise<ListItem> => {
  const at = new Date(input.checkedAt);
  const row = await deps.db.transaction(async (tx) => {
    if (!(await claimMutation(tx, input.mutationId, userId))) {
      return requireRow(tx, input.id);
    }
    return (
      (await applyCheck(tx, {
        listId: input.listId,
        id: input.id,
        at,
        checkedAt: at,
        userId,
      })) ?? requireRow(tx, input.id)
    );
  });

  const item = toListItem(row);
  deps.events.publish({ type: "item.upserted", listId: item.listId, item });
  return item;
};

export const uncheckItem = async (
  deps: ServiceDeps,
  userId: string,
  input: UncheckItemInput,
): Promise<ListItem> => {
  const at = new Date(input.at);
  const row = await deps.db.transaction(async (tx) => {
    if (!(await claimMutation(tx, input.mutationId, userId))) {
      return requireRow(tx, input.id);
    }
    return (
      (await applyCheck(tx, {
        listId: input.listId,
        id: input.id,
        at,
        checkedAt: null,
        userId,
      })) ?? requireRow(tx, input.id)
    );
  });

  const item = toListItem(row);
  deps.events.publish({ type: "item.upserted", listId: item.listId, item });
  return item;
};

/**
 * Svuotamento della coda offline: un solo round-trip e una sola transazione
 * per tutte le spunte accumulate fra gli scaffali.
 */
export const checkMany = async (
  deps: ServiceDeps,
  userId: string,
  input: CheckManyInput,
): Promise<ListItem[]> => {
  const rows = await deps.db.transaction(async (tx) => {
    if (!(await claimMutation(tx, input.mutationId, userId))) {
      const existing = await Promise.all(
        input.checks.map((check) => findRow(tx, check.id)),
      );
      return existing.filter((row) => row !== null);
    }

    const results = [];
    for (const check of input.checks) {
      const at =
        check.checkedAt === null ? new Date() : new Date(check.checkedAt);
      const row = await applyCheck(tx, {
        listId: check.listId,
        id: check.id,
        at,
        checkedAt: check.checkedAt === null ? null : at,
        userId,
      });
      if (row) results.push(row);
    }
    return results;
  });

  const items = rows.map(toListItem);
  for (const item of items) {
    deps.events.publish({ type: "item.upserted", listId: item.listId, item });
  }
  return items;
};

/**
 * Tombstone, mai una DELETE fisica: senza, un client offline che riparte non
 * ha modo di sapere che la riga è sparita, e la ricrea.
 */
export const deleteItem = async (
  deps: ServiceDeps,
  userId: string,
  input: DeleteItemInput,
): Promise<{ id: string }> => {
  await deps.db.transaction(async (tx) => {
    if (!(await claimMutation(tx, input.mutationId, userId))) return;

    await tx
      .update(listItems)
      .set({
        deletedAt: new Date(),
        updatedAt: new Date(),
        version: sql`${listItems.version} + 1`,
      })
      .where(
        and(
          eq(listItems.id, input.id),
          eq(listItems.listId, input.listId),
          isNull(listItems.deletedAt),
        ),
      );
  });

  deps.events.publish({
    type: "item.deleted",
    listId: input.listId,
    itemId: input.id,
  });
  return { id: input.id };
};
