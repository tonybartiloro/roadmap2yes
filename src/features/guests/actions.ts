"use server";

import { revalidatePath } from "next/cache";
import type { ActionResult, VersionedResult } from "@/features/decisions/types";
import { createClient } from "@/lib/supabase/server";
import * as data from "./data";
import type { BulkPrevious, Db, EmptyCounts } from "./data";
import { GENERIC_ERROR, BULK_ERROR } from "./data";
import { invalidMessage, schemas } from "./schemas";

/**
 * Server actions of Invitati. Each one: session from the cookies (never a token argument), shape
 * check of the input, then the data function that runs with the USER'S client (RLS decides).
 *
 * PERSONAL DATA RULE (ADR-0002, QA-5): nothing here logs, and a result never carries a database
 * message or a field value: only fixed Italian texts chosen by code.
 */

const SESSION_EXPIRED = "La sessione è scaduta. Entra di nuovo: non hai perso nulla.";

async function session(): Promise<{ db: Db; userId: string } | null> {
  const db = (await createClient()) as unknown as Db;
  const { data: claims } = await db.auth.getClaims();
  const userId = claims?.claims?.sub;
  return userId ? { db, userId } : null;
}

const expired = { ok: false, code: "session", message: SESSION_EXPIRED } as const;
const invalid = (message: string = GENERIC_ERROR) =>
  ({ ok: false, code: "invalid", message }) as const;

/** Only on success: the list and the summary of /invitati (and the settings band) show it. */
function refreshed<T extends { ok: boolean }>(result: T): T {
  if (result.ok) {
    revalidatePath("/invitati");
    revalidatePath("/altro/impostazioni");
  }
  return result;
}

export async function addGuestAction(input: unknown): Promise<ActionResult<{ guestId: string }>> {
  const parsed = schemas.addGuest.safeParse(input);
  if (!parsed.success) return invalid(invalidMessage(parsed.error, GENERIC_ERROR));
  const ctx = await session();
  if (!ctx) return expired;
  return refreshed(await data.addGuest(ctx.db, parsed.data));
}

export async function updateGuestAction(input: unknown): Promise<VersionedResult> {
  const parsed = schemas.updateGuest.safeParse(input);
  if (!parsed.success) return invalid(invalidMessage(parsed.error, GENERIC_ERROR));
  const ctx = await session();
  if (!ctx) return expired;
  return refreshed(await data.updateGuest(ctx.db, ctx.userId, parsed.data));
}

/** Quick assignment of one person (group and/or table). */
export async function assignGuestAction(input: unknown): Promise<ActionResult> {
  const parsed = schemas.assignGuest.safeParse(input);
  if (!parsed.success) return invalid();
  const ctx = await session();
  if (!ctx) return expired;
  return refreshed(await data.assignGuest(ctx.db, parsed.data));
}

export async function addGroupAction(input: unknown): Promise<ActionResult<{ groupId: string }>> {
  const parsed = schemas.addGroup.safeParse(input);
  if (!parsed.success) return invalid(invalidMessage(parsed.error, GENERIC_ERROR));
  const ctx = await session();
  if (!ctx) return expired;
  return refreshed(await data.addGroup(ctx.db, parsed.data));
}

export async function updateGroupAction(input: unknown): Promise<VersionedResult> {
  const parsed = schemas.updateGroup.safeParse(input);
  if (!parsed.success) return invalid(invalidMessage(parsed.error, GENERIC_ERROR));
  const ctx = await session();
  if (!ctx) return expired;
  return refreshed(await data.updateGroup(ctx.db, ctx.userId, parsed.data));
}

/** "Nuova famiglia" / "Aggiungi un gruppo intero": group and people in one transaction. */
export async function createFamilyAction(
  input: unknown,
): Promise<ActionResult<{ groupId: string; guestIds: string[] }>> {
  const parsed = schemas.createFamily.safeParse(input);
  if (!parsed.success) return invalid(invalidMessage(parsed.error, GENERIC_ERROR));
  const ctx = await session();
  if (!ctx) return expired;
  return refreshed(await data.createFamily(ctx.db, parsed.data));
}

/** Soft delete of a person, group or table. */
export async function removeEntityAction(input: unknown): Promise<VersionedResult> {
  const parsed = schemas.entity.safeParse(input);
  if (!parsed.success) return invalid();
  const ctx = await session();
  if (!ctx) return expired;
  return refreshed(await data.removeEntity(ctx.db, ctx.userId, parsed.data));
}

export async function restoreEntityAction(input: unknown): Promise<VersionedResult> {
  const parsed = schemas.entity.safeParse(input);
  if (!parsed.success) return invalid();
  const ctx = await session();
  if (!ctx) return expired;
  return refreshed(await data.restoreEntity(ctx.db, ctx.userId, parsed.data));
}

/** "Elimina definitivamente": physical DELETE, only of something already deleted. */
export async function purgeEntityAction(input: unknown): Promise<ActionResult> {
  const parsed = schemas.purge.safeParse(input);
  if (!parsed.success) return invalid();
  const ctx = await session();
  if (!ctx) return expired;
  return refreshed(await data.purgeEntity(ctx.db, parsed.data));
}

/** "Svuota": physical DELETE of everything already deleted (per section or all). */
export async function emptyDeletedAction(input: unknown): Promise<ActionResult<EmptyCounts>> {
  const parsed = schemas.empty.safeParse(input);
  if (!parsed.success) return invalid();
  const ctx = await session();
  if (!ctx) return expired;
  return refreshed(await data.emptyDeleted(ctx.db, parsed.data));
}

/** Bulk assign / delete / restore. The result's `previous` goes back, unchanged, to the undo. */
export async function bulkGuestsAction(
  input: unknown,
): Promise<ActionResult<{ previous: BulkPrevious[]; changed: number }>> {
  const parsed = schemas.bulk.safeParse(input);
  if (!parsed.success) return invalid(invalidMessage(parsed.error, BULK_ERROR));
  const ctx = await session();
  if (!ctx) return expired;
  return refreshed(await data.bulkGuests(ctx.db, parsed.data));
}

export async function undoBulkAction(input: unknown): Promise<ActionResult<{ restored: number }>> {
  const parsed = schemas.undo.safeParse(input);
  if (!parsed.success) return invalid(invalidMessage(parsed.error, BULK_ERROR));
  const ctx = await session();
  if (!ctx) return expired;
  return refreshed(await data.undoBulk(ctx.db, parsed.data));
}
