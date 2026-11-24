import { NextResponse, type NextRequest } from "next/server";
import { INVITE_ONLY_PATH, resolvePostLogin } from "@/features/auth/post-login";
import { createClient } from "@/lib/supabase/server";
import { classifyDbError } from "@/lib/supabase/errors";

/**
 * Post-login steps for someone who is signed in but has no space yet (the proxy redirects here):
 * accept a pending invitation, or create the space if they are the bootstrap founder, or
 * "su invito" (plan §4.3.4). A GET without side effects other than those idempotent RPCs; the
 * decision is the DB's. Without a session it goes to the login.
 */
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  const target = (path: string) => NextResponse.redirect(new URL(path, request.url));
  if (!claims?.sub) return target("/accesso");

  const result = await resolvePostLogin(supabase, {
    id: claims.sub,
    app_metadata: (claims.app_metadata ?? null) as Record<string, unknown> | null,
  });
  if (result.status === "ok") return target(result.to);
  const outage = classifyDbError(result.error);
  return target(outage ? `/servizio?motivo=${outage}` : INVITE_ONLY_PATH);
}
