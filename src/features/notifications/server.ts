import "server-only";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { Db } from "./data";

/** Request context of Promemoria: the user's client (RLS decides) and who the user is. */
export async function pageContext(): Promise<{ db: Db; userId: string }> {
  // Per-user data: never prerendered at build time.
  await connection();
  const db = (await createClient()) as unknown as Db;
  const { data } = await db.auth.getClaims();
  const userId = data?.claims?.sub;
  if (!userId) redirect("/accesso");
  return { db, userId };
}
