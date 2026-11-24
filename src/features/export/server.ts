import "server-only";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { getNow } from "@/lib/clock";
import { todayInRome, type PlainDate } from "@/lib/dates/plain-date";
import { createClient } from "@/lib/supabase/server";
import type { Db } from "./data";

/** Request context of Esportazione: the user's client, who the user is and "today" in Rome. */
export async function pageContext(): Promise<{ db: Db; userId: string; today: PlainDate }> {
  // Per-user data: never prerendered at build time.
  await connection();
  const db = (await createClient()) as unknown as Db;
  const { data } = await db.auth.getClaims();
  const userId = data?.claims?.sub;
  if (!userId) redirect("/accesso");
  return { db, userId, today: todayInRome(await getNow()) };
}
