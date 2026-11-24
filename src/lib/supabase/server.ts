import "server-only";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { readSupabasePublicConfig } from "@/lib/app-config";
import { authCookieOptions } from "./cookie-options";

/**
 * Supabase client for server components and server actions: runs with the USER'S JWT (session
 * cookies), so RLS is the only authorization boundary. Never use the secret key here.
 * (Typed with `Database` once T2 generates `database.types.ts`.)
 */
export async function createClient() {
  const { url, publishableKey } = readSupabasePublicConfig();
  const cookieStore = await cookies();

  return createServerClient(url, publishableKey, {
    cookieOptions: authCookieOptions(),
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Called from a Server Component, where cookies are read-only: the proxy refreshes
          // the session, so ignoring the write here is safe and intentional.
        }
      },
    },
  });
}
