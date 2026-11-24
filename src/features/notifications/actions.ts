"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { setPreference, type Db, type SaveResult } from "./data";

/** Server action of Altro > Promemoria: session from the cookies, shape check, then the data function. */

const inputSchema = z.object({
  kind: z.enum(["reminders", "digest"]),
  enabled: z.boolean(),
});

export async function setPreferenceAction(input: unknown): Promise<SaveResult> {
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      code: "invalid",
      message: "Non sono riuscito a salvare. Riprova tra un attimo.",
    };
  }
  const db = (await createClient()) as unknown as Db;
  const { data } = await db.auth.getClaims();
  const userId = data?.claims?.sub;
  if (!userId) {
    return {
      ok: false,
      code: "forbidden",
      message: "La sessione è scaduta. Entra di nuovo: non hai perso nulla.",
    };
  }
  const result = await setPreference(db, userId, parsed.data.kind, parsed.data.enabled);
  if (result.ok) revalidatePath("/altro/promemoria");
  return result;
}
