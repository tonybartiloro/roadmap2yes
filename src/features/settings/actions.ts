"use server";

import { revalidatePath } from "next/cache";
import type { VersionedResult } from "@/features/decisions/types";
import { createClient } from "@/lib/supabase/server";
import { loadProfiles, loadSettings, savePerson, saveSettings, type Db } from "./data";
import { GENERIC_ERROR, SESSION_EXPIRED } from "./model";
import { personSchema, settingsSchema } from "./schemas";

/**
 * Server actions of Impostazioni nozze and Profili. Session from the cookies (never a token
 * argument), shape check of the input, then the data function that runs with the USER's client (RLS
 * and column grants decide). Only fixed messages go back.
 */

async function session(): Promise<{ db: Db; userId: string } | null> {
  const db = (await createClient()) as unknown as Db;
  const { data } = await db.auth.getClaims();
  const userId = data?.claims?.sub;
  return userId ? { db, userId } : null;
}

const expired = { ok: false, code: "session", message: SESSION_EXPIRED } as const;
const invalid = { ok: false, code: "invalid", message: GENERIC_ERROR } as const;

export async function saveSettingsAction(input: unknown): Promise<VersionedResult> {
  const parsed = settingsSchema.safeParse(input);
  if (!parsed.success) return invalid;
  const ctx = await session();
  if (!ctx) return expired;

  let current;
  try {
    current = await loadSettings(ctx.db, ctx.userId);
  } catch {
    return { ok: false, code: "unknown", message: GENERIC_ERROR };
  }
  const result = await saveSettings(ctx.db, {
    ...parsed.data,
    id: current.weddingId,
    hasBudget: current.budgetCents !== null,
    currentUnknown: current.unknown,
  });
  if (result.ok) {
    // A new rite changes the suggestions of the Percorso; guests, style and place feed Home and the
    // export only through a fresh read. Narrow list: no layout-wide revalidation.
    revalidatePath("/altro/impostazioni");
    revalidatePath("/percorso");
    revalidatePath("/");
  }
  return result;
}

export async function savePersonAction(input: unknown): Promise<VersionedResult> {
  const parsed = personSchema.safeParse(input);
  if (!parsed.success) return invalid;
  const ctx = await session();
  if (!ctx) return expired;
  if (parsed.data.firstName === null) {
    // Your own first name is required (it is how the app names you); the partner's may be empty.
    try {
      const { me } = await loadProfiles(ctx.db, ctx.userId);
      if (me.id === parsed.data.partnerId) {
        return { ok: false, code: "invalid", message: "Scrivi il tuo nome." };
      }
    } catch {
      return { ok: false, code: "unknown", message: GENERIC_ERROR };
    }
  }
  const result = await savePerson(ctx.db, parsed.data);
  if (result.ok) {
    // Names appear in the greeting, in the task rows and in the invite panel.
    revalidatePath("/altro/profili");
    revalidatePath("/altro/invito");
    revalidatePath("/");
    revalidatePath("/percorso");
  }
  return result;
}
