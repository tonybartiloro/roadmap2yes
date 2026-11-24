import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { createSupabaseJobDb } from "./supabase-job-db";
import type { JobDb } from "./types";

/**
 * The ONLY place where the daily job gets the secret-key client (plan §1: `features/jobs/**` is one
 * of the lint-allowed scopes). The cron route imports this function, never `admin.ts`.
 */
export function createAdminJobDb(): JobDb {
  return createSupabaseJobDb(createAdminClient());
}
