import { beforeEach, describe, expect, it, vi } from "vitest";

const submit = vi.fn();
vi.mock("./public-rpc", () => ({ rsvpSubmit: (input: unknown) => submit(input) }));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-forwarded-for": "203.0.113.7" }),
}));
const NOW = new Date("2027-03-10T10:00:00Z");
vi.mock("@/lib/clock", () => ({ getNow: async () => NOW }));

import { submitRsvp } from "./public-actions";
import { IDLE } from "./public/state";

const TOKEN = "D-nIsgqL5dGbgoSIb9_oamFr3fXgA_dVLTkmc1J0vno";
const A = "00000000-0000-4000-8000-00000000000a";

function form(entries: [string, string][]): FormData {
  const data = new FormData();
  for (const [key, value] of entries) data.append(key, value);
  return data;
}
const yes = form([
  ["p", A],
  [`status:${A}`, "yes"],
  [`note:${A}`, "   "],
  [`seen:${A}`, "2027-03-09T08:00:00.5+00:00"],
]);

beforeEach(() => submit.mockReset());

describe("submitRsvp", () => {
  it("sends the bound token, the server clock, the proxy IP, a blank note as null and seen_at untouched", async () => {
    submit.mockResolvedValue({ state: "ok", people: [], changedMeanwhile: [A] });
    const state = await submitRsvp(TOKEN, IDLE, yes);
    expect(state).toEqual({ status: "saved", people: [], changed: [A] });
    expect(submit).toHaveBeenCalledWith({
      token: TOKEN,
      ip: "203.0.113.7",
      now: NOW,
      answers: [
        { id: A, status: "yes", diet: [], diet_note: null, seen_at: "2027-03-09T08:00:00.5+00:00" },
      ],
    });
  });

  it("never touches the DB for a malformed token or zero choices", async () => {
    expect(await submitRsvp("short", IDLE, yes)).toEqual({ status: "unavailable" });
    const none = await submitRsvp(TOKEN, IDLE, form([["p", A]]));
    expect(none).toMatchObject({ status: "error", kind: "none" });
    expect(submit).not.toHaveBeenCalled();
  });

  it.each([
    [{ state: "neutral" }, { status: "unavailable" }],
    [
      { state: "blocked", retryAfterSeconds: 60 },
      { status: "error", kind: "blocked" },
    ],
    [{ state: "invalid" }, { status: "error", kind: "invalid" }],
    [{ state: "retry" }, { status: "error", kind: "save" }],
  ])("maps %j", async (result, expected) => {
    submit.mockResolvedValue(result);
    expect(await submitRsvp(TOKEN, IDLE, yes)).toMatchObject(expected);
  });

  it("keeps the submitted choices on an error and returns nothing but codes", async () => {
    submit.mockResolvedValue({ state: "blocked", retryAfterSeconds: 60 });
    const state = await submitRsvp(TOKEN, IDLE, yes);
    expect(state).toMatchObject({ values: { [A]: { status: "yes" } } });
    expect(JSON.stringify(state)).not.toContain(TOKEN);
  });
});
