import { randomUUID } from "node:crypto";
import {
  MAX_OPEN_REQUESTS,
  MAX_OPEN_REQUESTS_PER_IP,
  REQUEST_PENDING_TTL_DAYS,
  REQUEST_RETENTION_DAYS,
  RequestStatus,
  RequestType,
  serializeDates,
  type ApproveRequestResult,
  type CreateRequestInput,
  type ListRequestsFilters,
  type ListRequestsInput,
  type ListRequestsResult,
  type RequestExtended,
  type RequestSort,
  type RequestSortField,
} from "@pantry/shared";
import {
  and,
  asc,
  count,
  desc,
  eq,
  ilike,
  inArray,
  lt,
  ne,
  sql,
  type SQL,
} from "drizzle-orm";
import { alias, type PgColumn } from "drizzle-orm/pg-core";
import { TRPCError } from "@trpc/server";
import type { Logger } from "pino";

import type { Database, Executor } from "../../db/client.js";
import { requests } from "../../db/schema/requests.js";
import { users } from "../../db/schema/users.js";
import type { AdminNotifier } from "../notifications/admin-notifier.js";
import { createUserTx, requireUser } from "./admin.service.js";
import { issueInviteTx } from "./invites.service.js";

export const createRequest = async (
  deps: RequestDeps,
  input: CreateRequestInput,
): Promise<{ id: string }> => {
  const open = await countOpenRequests(deps, deps.requesterHash);
  if (
    open.total >= MAX_OPEN_REQUESTS ||
    open.mine >= MAX_OPEN_REQUESTS_PER_IP
  ) {
    throw new TRPCError({
      code: "TOO_MANY_REQUESTS",
      message: "Too many requests are waiting for an answer.",
    });
  }

  const [inserted] = await deps.db
    .insert(requests)
    .values({
      id: randomUUID(),
      type: input.type,
      email: input.email,
      displayName: input.type === RequestType.signup ? input.displayName : null,
      requesterHash: deps.requesterHash ?? null,
    })
    .onConflictDoNothing({
      target: requests.email,
      where: openIndexPredicate,
    })
    .returning({ id: requests.id });

  if (inserted) {
    notifyQueued(deps);
    return { id: inserted.id };
  }

  const [existing] = await deps.db
    .select({ id: requests.id })
    .from(requests)
    .where(
      and(
        eq(requests.email, input.email),
        eq(requests.status, RequestStatus.pending),
      ),
    )
    .limit(1);

  if (!existing) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Request not stored.",
    });
  }
  return { id: existing.id };
};

const notifyQueued = (deps: RequestDeps): void => {
  try {
    deps.notifier?.requestQueued();
  } catch (error: unknown) {
    deps.logger?.error({ error }, "Admin notification could not be started.");
  }
};

export const listRequests = async (
  deps: RequestDeps,
  input: ListRequestsInput,
): Promise<ListRequestsResult> => {
  const { pageIndex, pageSize } = input.pagination;
  const where = buildRequestFilters(input.filters);

  const [rows, rowCount] = await Promise.all([
    deps.db
      .select(requestSelection)
      .from(requests)
      .leftJoin(subjects, eq(subjects.id, requests.userId))
      .leftJoin(deciders, eq(deciders.id, requests.decidedBy))
      .where(where)
      .orderBy(...buildRequestOrder(input.sorting))
      .limit(pageSize)
      .offset(pageIndex * pageSize),
    countRequests(deps, where),
  ]);

  return { rows: rows.map(serializeDates), rowCount };
};

export const requireRequest = async (
  deps: RequestDeps,
  requestId: string,
): Promise<RequestExtended> => {
  const [row] = await deps.db
    .select(requestSelection)
    .from(requests)
    .leftJoin(subjects, eq(subjects.id, requests.userId))
    .leftJoin(deciders, eq(deciders.id, requests.decidedBy))
    .where(eq(requests.id, requestId))
    .limit(1);

  if (!row) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Request not existing.",
    });
  }
  return serializeDates(row);
};

export const approveRequest = async (
  deps: RequestDeps,
  actorId: string,
  requestId: string,
): Promise<ApproveRequestResult> => {
  const { userId, invite } = await deps.db.transaction(async (tx) => {
    const decided = await decideTx(
      tx,
      requestId,
      RequestStatus.approved,
      actorId,
    );

    const userId =
      decided.type === RequestType.signup
        ? await createSignupUser(tx, decided.email, decided.displayName)
        : await resolveResetTarget(tx, decided.email);

    await tx.update(requests).set({ userId }).where(eq(requests.id, requestId));

    return { userId, invite: await issueInviteTx(tx, userId, actorId) };
  });

  return {
    request: await requireRequest(deps, requestId),
    user: await requireUser(deps, userId),
    invite,
  };
};

export const rejectRequest = async (
  deps: RequestDeps,
  actorId: string,
  requestId: string,
): Promise<RequestExtended> => {
  await decideTx(deps.db, requestId, RequestStatus.rejected, actorId);
  return requireRequest(deps, requestId);
};

export const sweepDecidedRequests = async (db: Database): Promise<number> => {
  const cutoff = new Date(Date.now() - REQUEST_RETENTION_DAYS * MS_PER_DAY);

  const removed = await db
    .delete(requests)
    .where(
      and(
        ne(requests.status, RequestStatus.pending),
        lt(requests.decidedAt, cutoff),
      ),
    )
    .returning({ id: requests.id });

  return removed.length;
};

export const sweepStalePendingRequests = async (
  db: Database,
): Promise<number> => {
  const cutoff = new Date(Date.now() - REQUEST_PENDING_TTL_DAYS * MS_PER_DAY);

  const expired = await db
    .update(requests)
    .set({ status: RequestStatus.rejected, decidedAt: new Date() })
    .where(
      and(
        eq(requests.status, RequestStatus.pending),
        lt(requests.createdAt, cutoff),
      ),
    )
    .returning({ id: requests.id });

  return expired.length;
};

interface RequestDeps {
  db: Database;
  requesterHash?: string;
  notifier?: AdminNotifier;
  logger?: Logger;
}

const decideTx = async (
  tx: Executor,
  requestId: string,
  status: typeof RequestStatus.approved | typeof RequestStatus.rejected,
  actorId: string,
) => {
  const [decided] = await tx
    .update(requests)
    .set({ status, decidedBy: actorId, decidedAt: new Date() })
    .where(
      and(
        eq(requests.id, requestId),
        eq(requests.status, RequestStatus.pending),
      ),
    )
    .returning();

  if (!decided) {
    const [existing] = await tx
      .select({ id: requests.id })
      .from(requests)
      .where(eq(requests.id, requestId))
      .limit(1);

    throw existing
      ? new TRPCError({
          code: "CONFLICT",
          message: "Request already decided.",
        })
      : new TRPCError({ code: "NOT_FOUND", message: "Request not existing." });
  }

  return decided;
};

const createSignupUser = async (
  tx: Executor,
  email: string,
  displayName: string | null,
): Promise<string> => {
  if (!displayName) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "The request carries no name to create the account with.",
    });
  }

  const { userId } = await createUserTx(tx, {
    email,
    displayName,
    role: "user",
  });
  return userId;
};

const resolveResetTarget = async (
  tx: Executor,
  email: string,
): Promise<string> => {
  const [user] = await tx
    .select({ id: users.id, status: users.status })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (!user) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "No account with this email.",
    });
  }
  if (user.status === "suspended") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Suspended account." });
  }

  return user.id;
};

const subjects = alias(users, "subjects");
const deciders = alias(users, "deciders");

const requestSelection = {
  id: requests.id,
  type: requests.type,
  status: requests.status,
  email: requests.email,
  displayName: requests.displayName,
  user: {
    id: subjects.id,
    email: subjects.email,
    displayName: subjects.displayName,
  },
  decidedBy: {
    id: deciders.id,
    email: deciders.email,
    displayName: deciders.displayName,
  },
  decidedAt: requests.decidedAt,
  createdAt: requests.createdAt,
};

const sortableColumns = {
  email: requests.email,
  type: requests.type,
  status: requests.status,
  createdAt: requests.createdAt,
} satisfies Record<RequestSortField, PgColumn>;

const buildRequestOrder = (sorting: RequestSort[]): SQL[] => {
  const order = sorting.map((sort) =>
    sort.desc ? desc(sortableColumns[sort.id]) : asc(sortableColumns[sort.id]),
  );
  return order.length > 0
    ? [...order, asc(requests.id)]
    : [desc(requests.createdAt), asc(requests.id)];
};

const contains = (term: string) => `%${term.replace(/[\\%_]/g, "\\$&")}%`;

const buildRequestFilters = (filters: ListRequestsFilters): SQL | undefined => {
  const conditions: SQL[] = [];
  if (filters.email) {
    conditions.push(ilike(requests.email, contains(filters.email)));
  }
  if (filters.type && filters.type.length > 0) {
    conditions.push(inArray(requests.type, filters.type));
  }
  if (filters.status && filters.status.length > 0) {
    conditions.push(inArray(requests.status, filters.status));
  }
  return and(...conditions);
};

const countRequests = async (deps: RequestDeps, where: SQL | undefined) => {
  const [row] = await deps.db
    .select({ value: count() })
    .from(requests)
    .where(where);
  return row?.value ?? 0;
};

export const countOpenRequests = async (
  deps: RequestDeps,
  requesterHash?: string,
): Promise<{ total: number; mine: number }> => {
  const [row] = await deps.db
    .select({
      total: count(),
      mine: sql<number>`count(*) filter (
        where ${requests.requesterHash} is not distinct from ${requesterHash ?? null}
      )`.mapWith(Number),
    })
    .from(requests)
    .where(eq(requests.status, RequestStatus.pending));

  return { total: row?.total ?? 0, mine: row?.mine ?? 0 };
};

const openIndexPredicate = sql`${requests.status} = ${sql.raw(
  `'${RequestStatus.pending}'`,
)}`;
const MS_PER_DAY = 86_400_000;
