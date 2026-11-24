"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { dismissWelcome, type Db } from "./data";
import type { ActionResult } from "./types";

/** Server action of the Home: session from the cookies (never a token argument), then RLS/RPC. */
const SESSION_EXPIRED = "La sessione è scaduta. Entra di nuovo: non hai perso nulla.";

/** "Ho capito" on the welcome card (`dismiss_welcome`). Only the Home shows it: narrow revalidation. */
export async function dismissWelcomeAction(): Promise<ActionResult> {
  const db = (await createClient()) as unknown as Db;
  const { data } = await db.auth.getClaims();
  if (!data?.claims?.sub) return { ok: false, code: "session", message: SESSION_EXPIRED };
  const result = await dismissWelcome(db);
  if (result.ok) revalidatePath("/");
  return result;
}
