"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import * as data from "./data";
import type { Db } from "./data";
import { GENERIC_ERROR } from "./model";
import { schemas } from "./schemas";
import type { ActionResult, VersionedResult } from "./types";

/**
 * Server actions of Budget. Each one: session from the cookies (never a token argument), shape
 * check of the input, then the data function that runs with the USER'S client (RLS decides).
 */

const SESSION_EXPIRED = "La sessione è scaduta. Entra di nuovo: non hai perso nulla.";

async function session(): Promise<{ db: Db; userId: string } | null> {
  const db = (await createClient()) as unknown as Db;
  const { data: claims } = await db.auth.getClaims();
  const userId = claims?.claims?.sub;
  return userId ? { db, userId } : null;
}

const expired = { ok: false, code: "session", message: SESSION_EXPIRED } as const;
const invalid = { ok: false, code: "invalid", message: GENERIC_ERROR } as const;

/**
 * Only on success. `budget`: what only the Budget pages show (names, Assegnato, moves).
 * `wide`: also Home, because the total, an agreed amount or a payment changed.
 */
function refreshed<T extends { ok: boolean }>(result: T, scope: "budget" | "wide" = "budget"): T {
  if (result.ok) {
    revalidatePath("/budget");
    revalidatePath("/budget/[id]", "page");
    if (scope === "wide") revalidatePath("/");
  }
  return result;
}

export async function setTotalAction(input: unknown): Promise<ActionResult> {
  const parsed = schemas.setTotal.safeParse(input);
  if (!parsed.success) return invalid;
  const ctx = await session();
  if (!ctx) return expired;
  return refreshed(await data.setTotal(ctx.db, parsed.data), "wide");
}

export async function addCategoryAction(
  input: unknown,
): Promise<ActionResult<{ categoryId: string }>> {
  const parsed = schemas.addCategory.safeParse(input);
  if (!parsed.success) return invalid;
  const ctx = await session();
  if (!ctx) return expired;
  return refreshed(await data.addCategory(ctx.db, parsed.data));
}

export async function updateCategoryAction(input: unknown): Promise<VersionedResult> {
  const parsed = schemas.updateCategory.safeParse(input);
  if (!parsed.success) return invalid;
  const ctx = await session();
  if (!ctx) return expired;
  return refreshed(await data.updateCategory(ctx.db, ctx.userId, parsed.data));
}

export async function removeCategoryAction(input: unknown): Promise<VersionedResult> {
  const parsed = schemas.versionedCategory.safeParse(input);
  if (!parsed.success) return invalid;
  const ctx = await session();
  if (!ctx) return expired;
  return refreshed(await data.removeCategory(ctx.db, ctx.userId, parsed.data));
}

export async function restoreCategoryAction(input: unknown): Promise<VersionedResult> {
  const parsed = schemas.versionedCategory.safeParse(input);
  if (!parsed.success) return invalid;
  const ctx = await session();
  if (!ctx) return expired;
  return refreshed(await data.restoreCategory(ctx.db, ctx.userId, parsed.data));
}

export async function moveAndDeleteCategoryAction(
  input: unknown,
): Promise<ActionResult<{ moved: number; version: number }>> {
  const parsed = schemas.moveAndDelete.safeParse(input);
  if (!parsed.success) return invalid;
  const ctx = await session();
  if (!ctx) return expired;
  return refreshed(await data.moveAndDeleteCategory(ctx.db, ctx.userId, parsed.data));
}

export async function addItemAction(input: unknown): Promise<ActionResult<{ itemId: string }>> {
  const parsed = schemas.addItem.safeParse(input);
  if (!parsed.success) return invalid;
  const ctx = await session();
  if (!ctx) return expired;
  return refreshed(await data.addItem(ctx.db, parsed.data), "wide");
}

export async function updateItemAction(input: unknown): Promise<VersionedResult> {
  const parsed = schemas.updateItem.safeParse(input);
  if (!parsed.success) return invalid;
  const ctx = await session();
  if (!ctx) return expired;
  return refreshed(await data.updateItem(ctx.db, ctx.userId, parsed.data), "wide");
}

export async function removeItemAction(input: unknown): Promise<VersionedResult> {
  const parsed = schemas.versionedItem.safeParse(input);
  if (!parsed.success) return invalid;
  const ctx = await session();
  if (!ctx) return expired;
  return refreshed(await data.removeItem(ctx.db, ctx.userId, parsed.data), "wide");
}

export async function restoreItemAction(input: unknown): Promise<VersionedResult> {
  const parsed = schemas.versionedItem.safeParse(input);
  if (!parsed.success) return invalid;
  const ctx = await session();
  if (!ctx) return expired;
  return refreshed(await data.restoreItem(ctx.db, ctx.userId, parsed.data), "wide");
}

export async function addPaymentAction(
  input: unknown,
): Promise<ActionResult<{ paymentId: string }>> {
  const parsed = schemas.addPayment.safeParse(input);
  if (!parsed.success) return invalid;
  const ctx = await session();
  if (!ctx) return expired;
  return refreshed(await data.addPayment(ctx.db, parsed.data), "wide");
}

export async function updatePaymentAction(input: unknown): Promise<VersionedResult> {
  const parsed = schemas.updatePayment.safeParse(input);
  if (!parsed.success) return invalid;
  const ctx = await session();
  if (!ctx) return expired;
  return refreshed(await data.updatePayment(ctx.db, ctx.userId, parsed.data), "wide");
}

export async function removePaymentAction(input: unknown): Promise<VersionedResult> {
  const parsed = schemas.versionedPayment.safeParse(input);
  if (!parsed.success) return invalid;
  const ctx = await session();
  if (!ctx) return expired;
  return refreshed(await data.removePayment(ctx.db, ctx.userId, parsed.data), "wide");
}

export async function restorePaymentAction(input: unknown): Promise<VersionedResult> {
  const parsed = schemas.versionedPayment.safeParse(input);
  if (!parsed.success) return invalid;
  const ctx = await session();
  if (!ctx) return expired;
  return refreshed(await data.restorePayment(ctx.db, ctx.userId, parsed.data), "wide");
}
