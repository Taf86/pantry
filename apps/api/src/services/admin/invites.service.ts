import { createHash, randomBytes, randomUUID } from "node:crypto";
import { INVITE_TTL_DAYS, type InviteLink } from "@pantry/shared";
import type { Executor } from "../../db/client.js";
import { invites } from "../../db/schema/invites.js";
import { and, eq, isNull } from "drizzle-orm";

export const issueInviteTx = async (
  tx: Executor,
  userId: string,
  createdBy: string,
): Promise<InviteLink> => {
  await tx
    .update(invites)
    .set({ usedAt: new Date() })
    .where(and(eq(invites.userId, userId), isNull(invites.usedAt)));

  const token = generateToken();
  const expiresAt = expiryFromNow();

  await tx.insert(invites).values({
    id: randomUUID(),
    userId,
    tokenHash: hashToken(token),
    createdBy,
    expiresAt,
  });

  return { userId, token, expiresAt: expiresAt.toISOString() };
};
const MS_PER_DAY = 86_400_000;
const generateToken = (): string => randomBytes(32).toString("base64url");
const hashToken = (token: string): string =>
  createHash("sha256").update(token).digest("hex");

const expiryFromNow = (): Date =>
  new Date(Date.now() + INVITE_TTL_DAYS * MS_PER_DAY);
