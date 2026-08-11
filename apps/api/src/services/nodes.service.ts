import { TRPCError } from "@trpc/server";
import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import {
  CONFLICT_CODE,
  MAX_PANTRY_DEPTH,
  type ConsumeNodeInput,
  type CreateNodeInput,
  type DeleteNodeInput,
  type MoveNodeInput,
  type PantryNode,
  type UpdateNodeInput,
} from "pantry-shared";

import type { Executor } from "../db/client.js";
import { pantryNodes } from "../db/schema/pantries.js";
import { toPantryNode } from "./mappers.js";
import { claimMutation } from "./mutations.js";
import type { ServiceDeps } from "./types.js";

const findRow = async (tx: Executor, id: string) => {
  const [row] = await tx
    .select()
    .from(pantryNodes)
    .where(eq(pantryNodes.id, id))
    .limit(1);
  return row ?? null;
};

const requireRow = async (tx: Executor, id: string) => {
  const row = await findRow(tx, id);
  if (!row) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Nodo inesistente" });
  }
  return row;
};

/**
 * L'albero viaggia piatto e viene materializzato dal client con `buildTree`.
 *
 * È deliberato: gli eventi real-time notificano singoli nodi, quindi il client
 * deve saper ricostruire l'albero comunque. Farlo fare anche al server
 * significherebbe due implementazioni della stessa struttura, che è esattamente
 * la duplicazione che `packages/shared` esiste per evitare.
 */
export const getTree = async (
  deps: ServiceDeps,
  pantryId: string,
): Promise<PantryNode[]> => {
  const rows = await deps.db
    .select()
    .from(pantryNodes)
    .where(
      and(eq(pantryNodes.pantryId, pantryId), isNull(pantryNodes.deletedAt)),
    )
    .orderBy(asc(pantryNodes.sortOrder), asc(pantryNodes.name));

  return rows.map(toPantryNode);
};

/**
 * Discendenti di un nodo, estremi inclusi.
 *
 * Adjacency list + CTE ricorsiva: una dispensa ha decine di nodi, non milioni,
 * e in cambio lo schema resta leggibile.
 */
const subtreeIds = async (tx: Executor, nodeId: string): Promise<string[]> => {
  const rows = await tx.execute<{ id: string }>(sql`
    WITH RECURSIVE subtree AS (
      SELECT id FROM pantry_nodes WHERE id = ${nodeId}
      UNION ALL
      SELECT n.id FROM pantry_nodes n JOIN subtree s ON n.parent_id = s.id
    )
    SELECT id FROM subtree
  `);
  return [...rows].map((row) => row.id);
};

/** Profondità di un nodo contando gli antenati, 0 per una radice. */
const depthOfNode = async (tx: Executor, nodeId: string): Promise<number> => {
  const rows = await tx.execute<{ depth: number }>(sql`
    WITH RECURSIVE ancestors AS (
      SELECT id, parent_id, 0 AS depth FROM pantry_nodes WHERE id = ${nodeId}
      UNION ALL
      SELECT n.id, n.parent_id, a.depth + 1
        FROM pantry_nodes n JOIN ancestors a ON n.id = a.parent_id
    )
    SELECT MAX(depth)::int AS depth FROM ancestors
  `);
  return [...rows][0]?.depth ?? 0;
};

/** Altezza del sottoalbero radicato in `nodeId`. */
const heightOfSubtree = async (
  tx: Executor,
  nodeId: string,
): Promise<number> => {
  const rows = await tx.execute<{ height: number }>(sql`
    WITH RECURSIVE subtree AS (
      SELECT id, 0 AS depth FROM pantry_nodes WHERE id = ${nodeId}
      UNION ALL
      SELECT n.id, s.depth + 1
        FROM pantry_nodes n JOIN subtree s ON n.parent_id = s.id
    )
    SELECT MAX(depth)::int AS height FROM subtree
  `);
  return [...rows][0]?.height ?? 0;
};

const assertParentIsContainer = async (
  tx: Executor,
  pantryId: string,
  parentId: string | null | undefined,
): Promise<void> => {
  if (!parentId) return;

  const parent = await findRow(tx, parentId);
  if (!parent || parent.pantryId !== pantryId || parent.deletedAt !== null) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Contenitore di destinazione inesistente",
    });
  }
  if (parent.kind !== "container") {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Si può annidare solo dentro un contenitore",
    });
  }
};

export const createNode = async (
  deps: ServiceDeps,
  userId: string,
  input: CreateNodeInput,
): Promise<PantryNode> => {
  const row = await deps.db.transaction(async (tx) => {
    if (!(await claimMutation(tx, input.mutationId, userId))) {
      return requireRow(tx, input.id);
    }

    await assertParentIsContainer(tx, input.pantryId, input.parentId);

    if (input.parentId) {
      const depth = await depthOfNode(tx, input.parentId);
      if (depth + 1 >= MAX_PANTRY_DEPTH) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `L'albero non può superare i ${MAX_PANTRY_DEPTH} livelli`,
        });
      }
    }

    const [created] = await tx
      .insert(pantryNodes)
      .values({
        id: input.id,
        pantryId: input.pantryId,
        parentId: input.parentId ?? null,
        kind: input.kind,
        name: input.name,
        sortOrder: input.sortOrder ?? 0,
        quantity: input.kind === "item" ? (input.quantity ?? null) : null,
        unit: input.kind === "item" ? (input.unit ?? null) : null,
        categoryId: input.kind === "item" ? (input.categoryId ?? null) : null,
        expiresAt: input.kind === "item" ? (input.expiresAt ?? null) : null,
        minQuantity: input.kind === "item" ? (input.minQuantity ?? null) : null,
      })
      .onConflictDoNothing({ target: pantryNodes.id })
      .returning();

    return created ?? requireRow(tx, input.id);
  });

  const node = toPantryNode(row);
  deps.events.publish({
    type: "pantry.node.upserted",
    pantryId: node.pantryId,
    node,
  });
  return node;
};

export const updateNode = async (
  deps: ServiceDeps,
  userId: string,
  input: UpdateNodeInput,
): Promise<PantryNode> => {
  const row = await deps.db.transaction(async (tx) => {
    if (!(await claimMutation(tx, input.mutationId, userId))) {
      return requireRow(tx, input.id);
    }

    const [updated] = await tx
      .update(pantryNodes)
      .set({
        ...(input.name === undefined ? {} : { name: input.name }),
        ...(input.sortOrder === undefined
          ? {}
          : { sortOrder: input.sortOrder }),
        ...(input.quantity === undefined ? {} : { quantity: input.quantity }),
        ...(input.unit === undefined ? {} : { unit: input.unit }),
        ...(input.categoryId === undefined
          ? {}
          : { categoryId: input.categoryId }),
        ...(input.expiresAt === undefined
          ? {}
          : { expiresAt: input.expiresAt }),
        ...(input.minQuantity === undefined
          ? {}
          : { minQuantity: input.minQuantity }),
        version: sql`${pantryNodes.version} + 1`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(pantryNodes.id, input.id),
          eq(pantryNodes.pantryId, input.pantryId),
          eq(pantryNodes.version, input.version),
          isNull(pantryNodes.deletedAt),
        ),
      )
      .returning();

    if (updated) return updated;

    const current = await findRow(tx, input.id);
    throw new TRPCError({
      code: "CONFLICT",
      message: "Qualcuno ha modificato questo nodo",
      cause: {
        code: CONFLICT_CODE,
        current: current ? toPantryNode(current) : null,
      },
    });
  });

  const node = toPantryNode(row);
  deps.events.publish({
    type: "pantry.node.upserted",
    pantryId: node.pantryId,
    node,
  });
  return node;
};

/**
 * Cancellare un contenitore cancella ciò che contiene: lasciare i figli vivi
 * ma irraggiungibili sarebbe peggio di entrambe le alternative.
 */
export const deleteNode = async (
  deps: ServiceDeps,
  userId: string,
  input: DeleteNodeInput,
): Promise<{ ids: string[] }> => {
  const ids = await deps.db.transaction(async (tx) => {
    if (!(await claimMutation(tx, input.mutationId, userId))) {
      return subtreeIds(tx, input.id);
    }

    const node = await findRow(tx, input.id);
    if (!node || node.pantryId !== input.pantryId) return [];

    const affected = await subtreeIds(tx, input.id);
    if (affected.length === 0) return [];

    await tx
      .update(pantryNodes)
      .set({
        deletedAt: new Date(),
        updatedAt: new Date(),
        version: sql`${pantryNodes.version} + 1`,
      })
      .where(
        and(inArray(pantryNodes.id, affected), isNull(pantryNodes.deletedAt)),
      );

    return affected;
  });

  for (const id of ids) {
    deps.events.publish({
      type: "pantry.node.deleted",
      pantryId: input.pantryId,
      nodeId: id,
    });
  }
  return { ids };
};

/**
 * Lo spostamento è l'unica operazione con un'invariante strutturale.
 *
 * Il controllo dei cicli e lo spostamento stanno nella stessa transazione: se
 * fossero due chiamate separate, due riparentamenti concorrenti potrebbero
 * passare entrambi il controllo e creare comunque un ciclo.
 */
export const moveNode = async (
  deps: ServiceDeps,
  userId: string,
  input: MoveNodeInput,
): Promise<PantryNode> => {
  const row = await deps.db.transaction(async (tx) => {
    if (!(await claimMutation(tx, input.mutationId, userId))) {
      return requireRow(tx, input.id);
    }

    const node = await requireRow(tx, input.id);
    if (node.pantryId !== input.pantryId || node.deletedAt !== null) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Nodo inesistente" });
    }

    if (input.parentId !== null) {
      if (input.parentId === input.id) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Un nodo non può contenere sé stesso",
        });
      }

      await assertParentIsContainer(tx, input.pantryId, input.parentId);

      const descendants = await subtreeIds(tx, input.id);
      if (descendants.includes(input.parentId)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Non si può spostare un contenitore dentro sé stesso",
        });
      }

      const targetDepth = await depthOfNode(tx, input.parentId);
      const height = await heightOfSubtree(tx, input.id);
      if (targetDepth + 1 + height >= MAX_PANTRY_DEPTH) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `L'albero non può superare i ${MAX_PANTRY_DEPTH} livelli`,
        });
      }
    }

    const [moved] = await tx
      .update(pantryNodes)
      .set({
        parentId: input.parentId,
        ...(input.sortOrder === undefined
          ? {}
          : { sortOrder: input.sortOrder }),
        version: sql`${pantryNodes.version} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(pantryNodes.id, input.id))
      .returning();

    if (!moved) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Nodo inesistente" });
    }
    return moved;
  });

  const node = toPantryNode(row);
  deps.events.publish({
    type: "pantry.node.upserted",
    pantryId: node.pantryId,
    node,
  });
  return node;
};

/**
 * `quantity = quantity - delta` valutato dal database.
 *
 * Un `SELECT` seguito da `UPDATE quantity = <valore letto> - 1` è la race
 * condition da manuale: due consumi concorrenti ne perderebbero uno. La
 * differenza è gratis, basta scriverlo bene.
 */
export const consumeNode = async (
  deps: ServiceDeps,
  userId: string,
  input: ConsumeNodeInput,
): Promise<PantryNode> => {
  const row = await deps.db.transaction(async (tx) => {
    if (!(await claimMutation(tx, input.mutationId, userId))) {
      return requireRow(tx, input.id);
    }

    const [updated] = await tx
      .update(pantryNodes)
      .set({
        // GREATEST evita le giacenze negative senza bisogno di rileggere.
        quantity: sql`GREATEST(COALESCE(${pantryNodes.quantity}, 0) - ${input.delta}, 0)`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(pantryNodes.id, input.id),
          eq(pantryNodes.pantryId, input.pantryId),
          eq(pantryNodes.kind, "item"),
          isNull(pantryNodes.deletedAt),
        ),
      )
      .returning();

    if (!updated) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Prodotto inesistente nella dispensa",
      });
    }
    return updated;
  });

  const node = toPantryNode(row);
  deps.events.publish({
    type: "pantry.node.upserted",
    pantryId: node.pantryId,
    node,
  });
  return node;
};
