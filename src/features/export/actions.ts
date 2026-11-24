"use server";

import { revalidatePath } from "next/cache";
import { getNow } from "@/lib/clock";
import { createClient } from "@/lib/supabase/server";
import { prepareExport, type Db, type PrepareExportResult } from "./data";

/**
 * Server action of Altro > Esportazione. The data is read with the USER'S session (RLS decides
 * what is visible) and returned as text for the browser to save: nothing is stored on the server.
 */
export async function prepareExportAction(): Promise<PrepareExportResult> {
  const db = (await createClient()) as unknown as Db;
  const { data } = await db.auth.getClaims();
  if (!data?.claims?.sub) {
    return {
      ok: false,
      code: "unknown",
      message: "La sessione è scaduta. Entra di nuovo: non hai perso nulla.",
    };
  }
  const result = await prepareExport(db, await getNow());
  // "ultimo export" shows on Home and on this page.
  if (result.ok) {
    revalidatePath("/");
    revalidatePath("/altro/esporta");
  }
  return result;
}
