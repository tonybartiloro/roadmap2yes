import "server-only";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { Db } from "./data";

/**
 * Request context of the Invitati pages: the user's client (RLS decides what is visible) and who
 * the user is. Without a session the proxy has normally redirected already; this is the second
 * line. Whether the user may read guests is `canReadGuests(db)` (the "su invito" panel).
 */
export async function pageContext(): Promise<{ db: Db; userId: string }> {
  // Per-user data: never prerendered at build time (the client factory reads env before cookies).
  await connection();
  const db = (await createClient()) as unknown as Db;
  const { data } = await db.auth.getClaims();
  const userId = data?.claims?.sub;
  if (!userId) redirect("/accesso");
  return { db, userId };
}
