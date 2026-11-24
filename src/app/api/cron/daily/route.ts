import { NextResponse } from "next/server";
import { readEmailCaps, readJobSecrets } from "@/lib/app-config";
import { getNow } from "@/lib/clock";
import { getEmailSender } from "@/lib/email";
import { createAdminJobDb, runDailyJob } from "@/features/jobs";
import { isAuthorizedCron } from "@/features/jobs/cron-auth";

/**
 * Daily job (plan §7, AC44): Vercel Cron calls it with `Authorization: Bearer $CRON_SECRET`.
 * It syncs the timeline (a real database query = keep-alive), records the heartbeat and, only when
 * emails are on, sends reminders and the Monday digest.
 *
 * - 401 without the right secret (constant-time check, fails closed when none is configured).
 * - 500 when anything failed, so the scheduler reports it; the body carries counters only: no
 *   address, no name, no error text.
 * - Never cached, never logs the request.
 */
export const maxDuration = 60;

const NO_STORE = { "Cache-Control": "private, no-store" } as const;

export async function GET(request: Request): Promise<Response> {
  const { cronSecret } = readJobSecrets();
  if (!cronSecret) console.error("[cron] CRON_SECRET is not configured: refusing every call");
  if (!isAuthorizedCron(request.headers.get("authorization"), cronSecret)) {
    return new NextResponse(null, { status: 401, headers: NO_STORE });
  }

  try {
    const now = await getNow();
    const summary = await runDailyJob({
      clock: { now: () => now },
      sender: getEmailSender(),
      db: createAdminJobDb(),
      caps: readEmailCaps(),
    });
    return NextResponse.json(summary, { status: summary.ok ? 200 : 500, headers: NO_STORE });
  } catch {
    // `runDailyJob` has already logged the failure class and recorded the heartbeat.
    return NextResponse.json({ ok: false }, { status: 500, headers: NO_STORE });
  }
}
