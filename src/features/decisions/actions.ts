"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { PlainDate } from "@/lib/dates/plain-date";
import * as data from "./data";
import type { Db, ReferenceChange } from "./data";
import { GENERIC_ERROR } from "./model";
import { schemas } from "./schemas";
import type { ActionResult, VersionedResult } from "./types";

/**
 * Server actions of Scelte. Each one: session from the cookies (never a token argument), shape
 * check of the input, then the data function that runs with the USER'S client (RLS decides).
 * After a write the whole app is revalidated: a reference or a choice also changes Home and Percorso.
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
 * Only on success. `scelte`: what only Scelte shows (reactions, notes, option text).
 * `wide`: also Percorso and Home, because the reference or the date options changed.
 */
function refreshed<T extends { ok: boolean }>(result: T, scope: "scelte" | "wide" = "scelte"): T {
  if (result.ok) {
    revalidatePath("/scelte");
    revalidatePath("/scelte/[key]", "page");
    if (scope === "wide") {
      revalidatePath("/percorso");
      revalidatePath("/");
    }
  }
  return result;
}

export async function chooseOptionAction(
  input: unknown,
): Promise<ActionResult<{ referenceDate: PlainDate | null }>> {
  const parsed = schemas.choose.safeParse(input);
  if (!parsed.success) return invalid;
  const ctx = await session();
  if (!ctx) return expired;
  return refreshed(await data.chooseOption(ctx.db, ctx.userId, parsed.data), "wide");
}

export async function reopenDecisionAction(input: unknown): Promise<ActionResult> {
  const parsed = schemas.reopen.safeParse(input);
  if (!parsed.success) return invalid;
  const ctx = await session();
  if (!ctx) return expired;
  return refreshed(await data.reopenDecision(ctx.db, ctx.userId, parsed.data), "wide");
}

export async function addNoteAction(input: unknown): Promise<ActionResult> {
  const parsed = schemas.note.safeParse(input);
  if (!parsed.success) return invalid;
  const ctx = await session();
  if (!ctx) return expired;
  return refreshed(await data.addNote(ctx.db, parsed.data));
}

export async function setReferenceAction(input: unknown): Promise<ActionResult<ReferenceChange>> {
  const parsed = schemas.reference.safeParse(input);
  if (!parsed.success) return invalid;
  const ctx = await session();
  if (!ctx) return expired;
  return refreshed(await data.setReference(ctx.db, parsed.data.optionId), "wide");
}

export async function addOptionAction(input: unknown): Promise<ActionResult<{ optionId: string }>> {
  const parsed = schemas.addOption.safeParse(input);
  if (!parsed.success) return invalid;
  const ctx = await session();
  if (!ctx) return expired;
  return refreshed(await data.addOption(ctx.db, parsed.data), "wide");
}

export async function updateOptionAction(input: unknown): Promise<VersionedResult> {
  const parsed = schemas.updateOption.safeParse(input);
  if (!parsed.success) return invalid;
  const ctx = await session();
  if (!ctx) return expired;
  return refreshed(await data.updateOption(ctx.db, ctx.userId, parsed.data));
}

export async function updateScenarioAction(input: unknown): Promise<VersionedResult> {
  const parsed = schemas.updateScenario.safeParse(input);
  if (!parsed.success) return invalid;
  const ctx = await session();
  if (!ctx) return expired;
  return refreshed(await data.updateScenario(ctx.db, ctx.userId, parsed.data), "wide");
}

export async function removeOptionAction(input: unknown): Promise<VersionedResult> {
  const parsed = schemas.versioned.safeParse(input);
  if (!parsed.success) return invalid;
  const ctx = await session();
  if (!ctx) return expired;
  return refreshed(await data.removeOption(ctx.db, ctx.userId, parsed.data), "wide");
}

export async function restoreOptionAction(input: unknown): Promise<VersionedResult> {
  const parsed = schemas.versioned.safeParse(input);
  if (!parsed.success) return invalid;
  const ctx = await session();
  if (!ctx) return expired;
  return refreshed(await data.restoreOption(ctx.db, ctx.userId, parsed.data), "wide");
}

export async function setReactionAction(input: unknown): Promise<ActionResult> {
  const parsed = schemas.reaction.safeParse(input);
  if (!parsed.success) return invalid;
  const ctx = await session();
  if (!ctx) return expired;
  return refreshed(await data.setReaction(ctx.db, ctx.userId, parsed.data));
}
