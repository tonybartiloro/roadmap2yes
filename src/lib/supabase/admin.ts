import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { readSupabasePublicConfig, readSupabaseSecretKey } from "@/lib/app-config";

/**
 * Supabase client with the SECRET key: bypasses RLS. It lives only here, server-only, and the
 * ESLint rule `no-restricted-imports` allows importing this module from 4 scopes only:
 *   1. src/features/auth/{login,bootstrap}.ts
 *   2. src/features/accounts/admin-ops.ts   (authorized FIRST by the DB: `authorize_account_op`)
 *   3. src/features/jobs/**
 *   4. src/app/(public)/email/**
 * Do not add scopes without an ADR-0001 update and a security review.
 */
export function createAdminClient() {
  const { url } = readSupabasePublicConfig();
  return createSupabaseClient(url, readSupabaseSecretKey(), {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
