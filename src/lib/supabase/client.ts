import { createBrowserClient } from "@supabase/ssr";

/**
 * Browser client (publishable key only). The two `NEXT_PUBLIC_*` reads MUST stay literal so the
 * bundler can inline them.
 */
export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !publishableKey) {
    throw new Error(
      "Missing Supabase configuration: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    );
  }
  return createBrowserClient(url, publishableKey);
}
