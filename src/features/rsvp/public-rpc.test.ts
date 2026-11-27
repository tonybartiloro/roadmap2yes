import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.fn();
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ rpc }) }));

const { rsvpGate, rsvpLoadPage, rsvpSubmit } = await import("./public-rpc");
const { hashRsvpToken } = await import("./token");
const { rsvpIpKey } = await import("./limiter");

const TOKEN = "B".repeat(43);
const NOW = new Date("2027-05-01T10:00:00.000Z");
const ANSWERS = [{ id: "p1", status: "yes" as const, diet: [], diet_note: null, seen_at: null }];
const PERSON = {
  id: "p1",
  first_name: "Anna",
  last_name: null,
  category: "adult",
  status: null,
  diet: [],
  diet_note: null,
  answered_at: null,
};

let logs: ReturnType<typeof vi.spyOn>[];

beforeEach(() => {
  vi.stubEnv("SUPABASE_SECRET_KEY", "sb_secret_fake_for_the_rsvp_ip_key_0123456789");
  rpc.mockReset();
  logs = (["log", "info", "warn", "error", "debug"] as const).map((m) =>
    vi.spyOn(console, m).mockImplementation(() => undefined),
  );
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

const noLogs = () => logs.forEach((spy) => expect(spy).not.toHaveBeenCalled());

describe("rsvpSubmit", () => {
  it("passes p_ip_key: null explicitly when there is no IP (no default in SQL)", async () => {
    rpc.mockResolvedValue({ data: { ok: true, people: [PERSON], changed_meanwhile: [] }, error: null });
    await rsvpSubmit({ token: TOKEN, ip: null, answers: ANSWERS, now: NOW });
    const args = rpc.mock.calls[0]?.[1] as Record<string, unknown>;
    expect("p_ip_key" in args).toBe(true);
    expect(args["p_ip_key"]).toBeNull();
    expect(args["p_token_hash"]).toBe(hashRsvpToken(TOKEN));
    expect(args["p_now"]).toBe(NOW.toISOString());
  });

  it("passes the keyed digest of the IP, never the IP", async () => {
    rpc.mockResolvedValue({ data: { ok: false }, error: null });
    await rsvpSubmit({ token: TOKEN, ip: "203.0.113.7", answers: ANSWERS, now: NOW });
    const args = rpc.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(args["p_ip_key"]).toBe(rsvpIpKey(process.env["SUPABASE_SECRET_KEY"]!, "203.0.113.7"));
    expect(JSON.stringify(args)).not.toContain("203.0.113.7");
  });

  it("maps the DB answers to closed states", async () => {
    rpc.mockResolvedValueOnce({
      data: { ok: true, people: [PERSON], changed_meanwhile: ["p1"] },
      error: null,
    });
    expect(await rsvpSubmit({ token: TOKEN, ip: null, answers: ANSWERS, now: NOW })).toEqual({
      state: "ok",
      people: [PERSON],
      changedMeanwhile: ["p1"],
    });
    rpc.mockResolvedValueOnce({ data: { ok: false }, error: null });
    expect(await rsvpSubmit({ token: TOKEN, ip: null, answers: ANSWERS, now: NOW })).toEqual({
      state: "neutral",
    });
    rpc.mockResolvedValueOnce({
      data: { ok: false, blocked: true, retry_after_seconds: 12.2 },
      error: null,
    });
    expect(await rsvpSubmit({ token: TOKEN, ip: null, answers: ANSWERS, now: NOW })).toEqual({
      state: "blocked",
      retryAfterSeconds: 13,
    });
  });

  it("invalid_answers is its own state; every other error (NUL, unknown) is a generic retry", async () => {
    const answer = () => rsvpSubmit({ token: TOKEN, ip: null, answers: ANSWERS, now: NOW });
    rpc.mockResolvedValueOnce({ data: null, error: { code: "P0001", message: "invalid_answers" } });
    expect(await answer()).toEqual({ state: "invalid" });
    rpc.mockResolvedValueOnce({
      data: null,
      error: { code: "22P05", message: "unsupported Unicode escape sequence \\u0000 cannot be converted to text" },
    });
    expect(await answer()).toEqual({ state: "retry" });
    rpc.mockResolvedValueOnce({ data: null, error: { code: "P0001", message: "invalid_key" } });
    expect(await answer()).toEqual({ state: "retry" });
    rpc.mockResolvedValueOnce({ data: null, error: { code: "XX000", message: "boom" } });
    expect(await answer()).toEqual({ state: "retry" });
    rpc.mockRejectedValueOnce(new TypeError("fetch failed"));
    expect(await answer()).toEqual({ state: "retry" });
    rpc.mockResolvedValueOnce({ data: "garbage", error: null });
    expect(await answer()).toEqual({ state: "retry" });
  });

  it("never forwards or logs Postgres messages, token, hash, IP or answers", async () => {
    const secretNote = "my-private-note";
    const message = `bad row for ${hashRsvpToken(TOKEN)} ${secretNote} 203.0.113.7 ${TOKEN}`;
    rpc.mockResolvedValue({ data: null, error: { code: "22P05", message, details: secretNote } });
    const result = await rsvpSubmit({
      token: TOKEN,
      ip: "203.0.113.7",
      answers: [{ ...ANSWERS[0]!, diet_note: secretNote }],
      now: NOW,
    });
    const text = JSON.stringify(result);
    for (const leak of [secretNote, TOKEN, "203.0.113.7", "22P05", "bad row"]) {
      expect(text).not.toContain(leak);
    }
    noLogs();
  });

  it("a malformed token never reaches the DB (QA-15)", async () => {
    for (const token of ["", "short", "A".repeat(44), `${"A".repeat(42)}!`, "é".repeat(43)]) {
      expect(await rsvpSubmit({ token, ip: null, answers: ANSWERS, now: NOW })).toEqual({
        state: "neutral",
      });
    }
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe("rsvpLoadPage", () => {
  const PAGE = { ok: true, couple: ["A", "B"], date: null, location: null, theme_id: "giardino", people: [PERSON] };

  it("returns the page, the neutral state, or a generic retry", async () => {
    rpc.mockResolvedValueOnce({ data: PAGE, error: null });
    expect(await rsvpLoadPage({ token: TOKEN, ip: null, now: NOW })).toEqual({
      state: "ok",
      page: PAGE,
    });
    rpc.mockResolvedValueOnce({ data: { ok: false }, error: null });
    expect(await rsvpLoadPage({ token: TOKEN, ip: null, now: NOW })).toEqual({ state: "neutral" });
    rpc.mockResolvedValueOnce({ data: null, error: { code: "XX000", message: "secret detail" } });
    expect(await rsvpLoadPage({ token: TOKEN, ip: null, now: NOW })).toEqual({ state: "retry" });
    rpc.mockResolvedValueOnce({ data: { ok: true }, error: null });
    expect(await rsvpLoadPage({ token: TOKEN, ip: null, now: NOW })).toEqual({ state: "retry" });
    rpc.mockRejectedValueOnce(new Error("down"));
    expect(await rsvpLoadPage({ token: TOKEN, ip: null, now: NOW })).toEqual({ state: "retry" });
    noLogs();
  });

  it("skips the DB for a malformed token and omits the IP key when there is no IP", async () => {
    expect(await rsvpLoadPage({ token: "nope", ip: null, now: NOW })).toEqual({ state: "neutral" });
    expect(rpc).not.toHaveBeenCalled();
    rpc.mockResolvedValue({ data: { ok: false }, error: null });
    await rsvpLoadPage({ token: TOKEN, ip: null, now: NOW });
    expect((rpc.mock.calls[0]?.[1] as Record<string, unknown>)["p_ip_key"]).toBeUndefined();
  });
});

describe("rsvpGate", () => {
  const abortable = { abortSignal: vi.fn() };

  it("returns the gate answer, bounded by a timeout", async () => {
    abortable.abortSignal.mockResolvedValue({
      data: { blocked: true, retry_after_seconds: 30, theme_id: null },
      error: null,
    });
    rpc.mockReturnValue(abortable);
    expect(await rsvpGate({ token: TOKEN, ip: "203.0.113.7", now: NOW, timeoutMs: 3000 })).toEqual({
      blocked: true,
      retryAfterSeconds: 30,
      themeId: null,
    });
    expect(abortable.abortSignal).toHaveBeenCalledWith(expect.any(AbortSignal));
  });

  it("is null (fail-open) on error, bad data, a throw or a malformed token, with no log", async () => {
    rpc.mockReturnValue(abortable);
    abortable.abortSignal.mockResolvedValueOnce({ data: null, error: { code: "X", message: "m" } });
    expect(await rsvpGate({ token: TOKEN, ip: null, now: NOW, timeoutMs: 3000 })).toBeNull();
    abortable.abortSignal.mockResolvedValueOnce({ data: [], error: null });
    expect(await rsvpGate({ token: TOKEN, ip: null, now: NOW, timeoutMs: 3000 })).toBeNull();
    abortable.abortSignal.mockRejectedValueOnce(new Error("timeout"));
    expect(await rsvpGate({ token: TOKEN, ip: null, now: NOW, timeoutMs: 3000 })).toBeNull();
    rpc.mockClear();
    expect(await rsvpGate({ token: "bad", ip: null, now: NOW, timeoutMs: 3000 })).toBeNull();
    expect(rpc).not.toHaveBeenCalled();
    noLogs();
  });
});
