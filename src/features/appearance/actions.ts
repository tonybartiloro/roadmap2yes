"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { saveTheme, type Db, type SaveThemeResult } from "./data";

/** Server action of Altro > Aspetto: session from the cookies, shape check, then the data function. */

const themeSchema = z.string().regex(/^[a-z0-9-]{1,40}$/);

const SESSION_EXPIRED = "La sessione è scaduta. Entra di nuovo: non hai perso nulla.";

export async function saveThemeAction(themeId: unknown): Promise<SaveThemeResult> {
  const parsed = themeSchema.safeParse(themeId);
  if (!parsed.success) {
    return { ok: false, code: "invalid", message: "Non sono riuscito a salvare il tema. Riprova." };
  }
  const db = (await createClient()) as unknown as Db;
  const { data } = await db.auth.getClaims();
  if (!data?.claims?.sub) return { ok: false, code: "forbidden", message: SESSION_EXPIRED };
  const result = await saveTheme(db, parsed.data);
  // The shell reads the theme at request time: only this page's own copy needs refreshing.
  if (result.ok) revalidatePath("/altro/aspetto");
  return result;
}
