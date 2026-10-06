import "server-only";
import { eq, sql } from "drizzle-orm";
import { v7 } from "uuid";
import { z } from "zod";
import { ApiError } from "../../api-error";
import { creditStatus, lockUser } from "../../ai/credits";
import type { Database } from "../../db/client";
import { creditLedger } from "../../db/schema";
import { audit } from "../moderation";
import { creditInput } from "./schemas";

/**
 * Adds or removes earned credits by hand, for support cases. Runs under the user's lock so it
 * cannot race a reservation or charge, never takes the balance below zero, and is audited with
 * the admin's note. Admins cannot adjust their own balance. Returns the new credit status.
 */
export async function adjustCredits(db: Database, adminId: string, userId: string, input: unknown) {
  const id = z.uuid().parse(userId);
  const { delta, note } = creditInput.parse(input);
  if (id === adminId) throw new ApiError(400, "VALIDATION_ERROR");
  return db.transaction(async (tx) => {
    const [target] = await lockUser(tx, id);
    if (!target) throw new ApiError(404, "NOT_FOUND");
    const before = await creditStatus(tx, id);
    if (before.earned + delta < 0) throw new ApiError(400, "VALIDATION_ERROR");
    const [balance] = await tx
      .select({ raw: sql<number>`coalesce(sum(${creditLedger.delta}), 0)::int` })
      .from(creditLedger)
      .where(eq(creditLedger.userId, id));
    const correction = Math.max(0, -balance.raw);
    const ref = v7();
    // Clawbacks may leave ledger debt while the displayed balance is zero. Record the baseline
    // correction separately so the requested delta changes the displayed earned balance exactly.
    if (correction)
      await tx
        .insert(creditLedger)
        .values({ id: v7(), userId: id, delta: correction, reason: "admin_balance_reset", ref });
    await tx
      .insert(creditLedger)
      .values({ id: v7(), userId: id, delta, reason: "admin_adjust", ref });
    await audit(tx, {
      id: ref,
      actorId: adminId,
      action: "credit_adjust",
      targetType: "user",
      targetId: id,
      meta: { delta, note, ref, baselineCorrection: correction },
    });
    return creditStatus(tx, id);
  });
}
