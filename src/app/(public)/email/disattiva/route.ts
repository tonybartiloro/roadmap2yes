import { createAdminClient } from "@/lib/supabase/admin";
import { UNSUBSCRIBE_KINDS, verifyUnsubscribeToken } from "@/lib/email/unsubscribe-token";
import type { UnsubscribableKind } from "@/lib/email";
import { confirmationPage, donePage, errorPage, invalidPage } from "./html";

/**
 * `/email/disattiva?tipo=<reminders|digest>&t=<token>` (plan §7, AC52).
 *
 * - GET shows a confirmation and changes NOTHING (mail scanners and link prefetchers GET links).
 * - POST changes the preference: it is the form of the page AND the RFC 8058 one-click request of
 *   the mail client (`List-Unsubscribe-Post`), which arrives with no session and no cookies. The
 *   HMAC token (bound to kind and user) is the only credential.
 * - The token lives in the query string, so the response sends `Referrer-Policy: no-referrer`
 *   (also set by the proxy for `/email/*`) and this module NEVER logs the URL or the query.
 * - Unknown, tampered or other-kind tokens all get the same neutral answer (400).
 */

const HEADERS = {
  "Content-Type": "text/html; charset=utf-8",
  "Cache-Control": "private, no-store",
  "Referrer-Policy": "no-referrer",
  "X-Robots-Tag": "noindex, nofollow",
} as const;

function html(body: string, status: number): Response {
  return new Response(body, { status, headers: HEADERS });
}

/** The user id and kind when the query carries a valid token for that kind; otherwise `null`. */
function parse(
  request: Request,
): { userId: string; kind: UnsubscribableKind; token: string } | null {
  const params = new URL(request.url).searchParams;
  const kind = UNSUBSCRIBE_KINDS.find((k) => k === params.get("tipo"));
  const token = params.get("t");
  if (!kind || !token) return null;
  const userId = verifyUnsubscribeToken(token, kind);
  return userId ? { userId, kind, token } : null;
}

export async function GET(request: Request): Promise<Response> {
  const parsed = parse(request);
  if (!parsed) return html(invalidPage(), 400);
  const action = `/email/disattiva?${new URLSearchParams({ tipo: parsed.kind, t: parsed.token })}`;
  return html(confirmationPage(parsed.kind, action), 200);
}

export async function POST(request: Request): Promise<Response> {
  const parsed = parse(request);
  if (!parsed) return html(invalidPage(), 400);
  try {
    const { error } = await createAdminClient().rpc("job_unsubscribe", {
      p_user_id: parsed.userId,
      p_kind: parsed.kind,
    });
    // `not_member` (account without a wedding) gets the same neutral answer as a bad token.
    if (error?.message.includes("not_member")) return html(invalidPage(), 400);
    if (error) return html(errorPage(), 500);
  } catch {
    return html(errorPage(), 500);
  }
  return html(donePage(parsed.kind), 200);
}
