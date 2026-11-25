"use server";

import { revalidatePath } from "next/cache";
import type { ActionResult, VersionedResult } from "@/features/decisions/types";
import { createClient } from "@/lib/supabase/server";
import type { Db } from "./data";
import { addTable, tableInvalidMessage, tableSchemas, updateTable } from "./tables-data";

/**
 * Server actions for creating and editing a table. Delete, restore and delete for good are the
 * generic entity actions of `actions.ts` (kind "table"). Session from the cookies, shape check,
 * then the data function with the user's client; results carry fixed texts only (ADR-0002).
 */

const expired = {
  ok: false,
  code: "session",
  message: "La sessione è scaduta. Entra di nuovo: non hai perso nulla.",
} as const;

async function session(): Promise<{ db: Db; userId: string } | null> {
  const db = (await createClient()) as unknown as Db;
  const { data } = await db.auth.getClaims();
  const userId = data?.claims?.sub;
  return userId ? { db, userId } : null;
}

function refreshed<T extends { ok: boolean }>(result: T): T {
  if (result.ok) revalidatePath("/invitati");
  return result;
}

export async function addTableAction(input: unknown): Promise<ActionResult<{ tableId: string }>> {
  const parsed = tableSchemas.add.safeParse(input);
  if (!parsed.success) {
    return { ok: false, code: "invalid", message: tableInvalidMessage(parsed.error) };
  }
  const ctx = await session();
  if (!ctx) return expired;
  return refreshed(await addTable(ctx.db, parsed.data));
}

export async function updateTableAction(input: unknown): Promise<VersionedResult> {
  const parsed = tableSchemas.update.safeParse(input);
  if (!parsed.success) {
    return { ok: false, code: "invalid", message: tableInvalidMessage(parsed.error) };
  }
  const ctx = await session();
  if (!ctx) return expired;
  return refreshed(await updateTable(ctx.db, ctx.userId, parsed.data));
}
