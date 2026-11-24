import "server-only";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { getNow } from "@/lib/clock";
import { todayInRome, type PlainDate } from "@/lib/dates/plain-date";
import { createClient } from "@/lib/supabase/server";
import type { Db } from "./data";

/**
 * Request context of the Scelte pages: the user's client (RLS decides what is visible), who the
 * user is, and "today" in Europe/Rome from the injectable clock. Without a session the proxy has
 * normally redirected already; this is the second line.
 */
export async function pageContext(): Promise<{ db: Db; userId: string; today: PlainDate }> {
  // Per-user data: never prerendered at build time (the client factory reads env before cookies).
  await connection();
  const db = (await createClient()) as unknown as Db;
  const { data } = await db.auth.getClaims();
  const userId = data?.claims?.sub;
  if (!userId) redirect("/accesso");
  return { db, userId, today: todayInRome(await getNow()) };
}
