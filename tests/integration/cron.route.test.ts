import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { addDays, todayInRome } from "@/lib/dates/plain-date";
import { createWedding, serviceClient, stackEnv } from "../support/supabase";
import { GET } from "@/app/api/cron/daily/route";

/**
 * T16: the cron route handler for real, against the local stack (AC44). Emails are OFF here
 * (`EMAIL_TRANSPORT` unset): the route must still sync the timeline and record the heartbeat, and
 * must never claim or send.
 */

const SECRET = "integration-cron-secret-0123456789";
const service = serviceClient();

function request(authorization?: string): Request {
  return new Request("http://localhost/api/cron/daily", {
    headers: authorization === undefined ? {} : { authorization },
  });
}

async function heartbeatCount(): Promise<number> {
  const { count, error } = await service
    .from("heartbeats")
    .select("id", { count: "exact", head: true })
    .eq("source", "daily_job");
  if (error) throw new Error(error.message);
  return count ?? 0;
}

beforeEach(() => {
  const stack = stackEnv();
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", stack.url);
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", stack.publishableKey);
  vi.stubEnv("SUPABASE_SECRET_KEY", stack.secretKey);
  vi.stubEnv("CRON_SECRET", SECRET);
  vi.stubEnv("EMAIL_TRANSPORT", "");
  vi.stubEnv("EMAIL_LINK_SECRET", "integration-test-link-secret-0123456789");
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("GET /api/cron/daily: authentication", () => {
  it("answers 401 without the bearer secret and writes nothing", async () => {
    const before = await heartbeatCount();
    for (const header of [undefined, "", "Bearer wrong", "Basic " + SECRET, SECRET]) {
      const response = await GET(request(header));
      expect(response.status).toBe(401);
      expect(await response.text()).toBe("");
    }
    expect(await heartbeatCount()).toBe(before);
  });

  it("fails closed when CRON_SECRET is not configured", async () => {
    vi.stubEnv("CRON_SECRET", "");
    const before = await heartbeatCount();
    expect((await GET(request("Bearer "))).status).toBe(401);
    expect((await GET(request("Bearer anything"))).status).toBe(401);
    expect(await heartbeatCount()).toBe(before);
  });
});

describe("GET /api/cron/daily: emails off (AC44, AC59)", () => {
  it("syncs, records the heartbeat, claims nothing and sends nothing", async () => {
    const w = await createWedding();
    const today = todayInRome(new Date());
    // A task that would be reminded today if emails were on.
    const task = await service
      .from("tasks")
      .insert({ wedding_id: w.weddingId, title: "Scade oggi", due_date: today });
    expect(task.error).toBeNull();
    const before = await heartbeatCount();

    const response = await GET(request(`Bearer ${SECRET}`));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    const body = (await response.json()) as Record<string, unknown>;
    expect(body).toMatchObject({
      ok: true,
      emailEnabled: false,
      reminders: { sent: 0 },
      digests: { sent: 0 },
    });
    expect(body["weddingsSynced"]).toBeGreaterThanOrEqual(1);

    expect(await heartbeatCount()).toBe(before + 1);
    const last = await service
      .from("heartbeats")
      .select("details")
      .eq("source", "daily_job")
      .order("ran_at", { ascending: false })
      .limit(1);
    expect(last.data?.[0]?.details).toMatchObject({ ok: true, email_enabled: false });

    const claims = await service.from("notification_log").select("id").eq("user_id", w.founder.id);
    expect(claims.data).toEqual([]);
  });

  it("the heartbeat is readable by a member through last_heartbeat (Altro > Info)", async () => {
    const w = await createWedding();
    await GET(request(`Bearer ${SECRET}`));
    const { data, error } = await w.founderClient.rpc("last_heartbeat");
    expect(error).toBeNull();
    expect(typeof data).toBe("string");
    expect(Date.now() - new Date(data as string).getTime()).toBeLessThan(60_000);
  });

  it("the sync recalculates references as time passes (a real database query)", async () => {
    const w = await createWedding();
    const done = await w.founderClient.rpc("complete_onboarding", {
      p_scenarios: [
        { kind: "fixed", date_from: addDays(todayInRome(new Date()), 400), label: "A" },
      ],
    });
    expect(done.error).toBeNull();
    const response = await GET(request(`Bearer ${SECRET}`));
    expect(response.status).toBe(200);
  });
});

describe("GET /api/cron/daily: failures are reported to the scheduler", () => {
  it("answers 500 when the database cannot be reached, with no detail in the body", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:1");
    const response = await GET(request(`Bearer ${SECRET}`));
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ ok: false });
  });

  it("answers 500 when the secret key is missing", async () => {
    vi.stubEnv("SUPABASE_SECRET_KEY", "");
    const response = await GET(request(`Bearer ${SECRET}`));
    expect(response.status).toBe(500);
  });
});
