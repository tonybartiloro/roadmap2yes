"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ActionResult, VersionedResult } from "@/features/decisions/types";
import { GENERIC_ERROR, type Db } from "@/features/guests/data";
import { readRsvpLinkSecret, readSiteUrl } from "@/lib/app-config";
import { getNow } from "@/lib/clock";
import { createClient } from "@/lib/supabase/server";
import { LINK_ERROR, type SharedPrevious } from "./constants";
import * as data from "./data";

/**
 * Server actions of the couple side of RSVP. Each one: session from the cookies (never a token
 * argument), shape check, then the data function with the USER'S client (RLS and the RPCs decide).
 * `now` is `getNow()` (the e2e cookie only where allowed), never a parameter. The secret is read
 * here at call time and never logged or returned: a missing or weak one is the same fixed
 * "Non sono riuscito a creare il link" (the public page does not depend on it).
 *
 * PERSONAL DATA RULE: nothing here logs; a result carries fixed texts only (no token, no hash).
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
const secretFailure = { ok: false, code: "secret", message: LINK_ERROR } as const;

function readSecret(): string | null {
  try {
    return readRsvpLinkSecret();
  } catch {
    return null;
  }
}

/** Only on success: the list of /invitati shows the states. */
function refreshed<T extends { ok: boolean }>(result: T): T {
  if (result.ok) revalidatePath("/invitati");
  return result;
}

const id = z.string().uuid();
const target = z.union([z.object({ groupId: id }).strict(), z.object({ guestId: id }).strict()]);
const schemas = {
  create: z.object({ targets: z.array(target).min(1).max(5000) }).strict(),
  link: z.object({ linkId: id }).strict(),
  previous: z
    .object({
      linkId: id,
      previous: z
        .object({
          shared_at: z.string().nullable(),
          shared_by: z.string().nullable(),
          people: z.array(id).max(1000),
        })
        .strict(),
    })
    .strict(),
  mode: z
    .object({
      groupId: id,
      version: z.number().int().positive(),
      mode: z.enum(["together", "separate"]),
    })
    .strict(),
};

/** "Crea link" (one target) and "Crea link per tutti" (many). */
export async function createLinksAction(
  input: unknown,
): Promise<ActionResult<{ created: number }>> {
  const parsed = schemas.create.safeParse(input);
  if (!parsed.success) return invalid;
  const ctx = await session();
  if (!ctx) return expired;
  const secret = readSecret();
  if (!secret) return secretFailure;
  return refreshed(
    await data.createLinks(ctx.db, { secret, now: await getNow(), targets: parsed.data.targets }),
  );
}

/** Read only: the URL the link sheet shows and copies. */
export async function getLinkUrlAction(input: unknown): Promise<ActionResult<{ url: string }>> {
  const parsed = schemas.link.safeParse(input);
  if (!parsed.success) return invalid;
  const ctx = await session();
  if (!ctx) return expired;
  const secret = readSecret();
  if (!secret) return secretFailure;
  let siteUrl: string;
  try {
    siteUrl = readSiteUrl();
  } catch {
    return secretFailure;
  }
  return data.getLinkUrl(ctx.db, { secret, siteUrl, linkId: parsed.data.linkId });
}

export async function rotateLinkAction(input: unknown): Promise<ActionResult<{ linkId: string }>> {
  const parsed = schemas.link.safeParse(input);
  if (!parsed.success) return invalid;
  const ctx = await session();
  if (!ctx) return expired;
  const secret = readSecret();
  if (!secret) return secretFailure;
  return refreshed(
    await data.rotateLink(ctx.db, { secret, now: await getNow(), linkId: parsed.data.linkId }),
  );
}

export async function revokeLinkAction(input: unknown): Promise<ActionResult<{ linkId: string }>> {
  const parsed = schemas.link.safeParse(input);
  if (!parsed.success) return invalid;
  const ctx = await session();
  if (!ctx) return expired;
  return refreshed(await data.revokeLink(ctx.db, { linkId: parsed.data.linkId }));
}

/** After a successful copy or share only (QA-12); the result holds what Annulla needs. */
export async function markSharedAction(
  input: unknown,
): Promise<ActionResult<{ previous: SharedPrevious }>> {
  const parsed = schemas.link.safeParse(input);
  if (!parsed.success) return invalid;
  const ctx = await session();
  if (!ctx) return expired;
  return refreshed(
    await data.markShared(ctx.db, { linkId: parsed.data.linkId, now: await getNow() }),
  );
}

export async function unmarkSharedAction(
  input: unknown,
): Promise<ActionResult<{ linkId: string }>> {
  const parsed = schemas.previous.safeParse(input);
  if (!parsed.success) return invalid;
  const ctx = await session();
  if (!ctx) return expired;
  return refreshed(await data.unmarkShared(ctx.db, parsed.data));
}

/** "Come rispondono" of a group, with the version of the row the person saw. */
export async function setGroupModeAction(input: unknown): Promise<VersionedResult> {
  const parsed = schemas.mode.safeParse(input);
  if (!parsed.success) return invalid;
  const ctx = await session();
  if (!ctx) return expired;
  return refreshed(await data.setGroupMode(ctx.db, ctx.userId, parsed.data));
}
