import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { addOption, loadDecisionDetail, setReaction, type Db } from "@/features/decisions/data";
import { schemas } from "@/features/decisions/schemas";
import type { DecisionDetailView } from "@/features/decisions/types";
import { anonClient, createWedding, type TestClient, type TestWedding } from "../support/supabase";

/**
 * T12 review: the server actions are the trust boundary. They run for real (zod, session, data
 * layer, RLS) against the local stack; only the cookie client and `revalidatePath` are replaced.
 */
const state = vi.hoisted(() => ({ client: null as unknown, revalidate: [] as unknown[][] }));

vi.mock("@/lib/supabase/server", () => ({ createClient: async () => state.client }));
vi.mock("next/cache", () => ({
  revalidatePath: (...args: unknown[]) => {
    state.revalidate.push(args);
  },
}));

import {
  addNoteAction,
  chooseOptionAction,
  reopenDecisionAction,
  setReactionAction,
  updateScenarioAction,
} from "@/features/decisions/actions";

const UUID = "00000000-0000-4000-8000-000000000000";

describe("decisions server actions", () => {
  let wedding: TestWedding;
  let date: DecisionDetailView;
  let aId: string;
  let bId: string;

  async function load(key: "date" | "location") {
    const view = await loadDecisionDetail(wedding.founderClient, key, {
      userId: wedding.founder.id,
      today: "2026-11-24",
    });
    if (!view) throw new Error("missing");
    return view;
  }

  beforeAll(async () => {
    wedding = await createWedding();
    const done = await wedding.founderClient.rpc("complete_onboarding", {
      p_scenarios: [
        { kind: "fixed", date_from: "2027-09-03", label: "A" },
        { kind: "fixed", date_from: "2028-05-14", label: "B" },
      ],
    });
    if (done.error) throw new Error(done.error.message);
    date = await load("date");
    aId = date.options.find((o) => o.title === "A")!.id;
    bId = date.options.find((o) => o.title === "B")!.id;
  });

  beforeEach(() => {
    state.client = wedding.founderClient as TestClient;
    state.revalidate = [];
  });

  it("rejects malformed input before touching the database", async () => {
    const bad = [
      await setReactionAction({ optionId: "not-a-uuid", reaction: "prefer" }),
      await setReactionAction({ optionId: aId, reaction: "love" }),
      await chooseOptionAction({ decisionId: date.id, optionId: aId, expectedVersion: 0 }),
      await reopenDecisionAction({
        decisionId: date.id,
        reason: "x".repeat(501),
        expectedVersion: 1,
      }),
      await addNoteAction({ decisionId: date.id, note: "x".repeat(1001) }),
      await updateScenarioAction({
        scenarioId: UUID,
        version: 1,
        scenario: { kind: "fixed", dateFrom: "2028-13-45", dateTo: null, locationOptionId: null },
      }),
    ];
    for (const result of bad) expect(result).toMatchObject({ ok: false, code: "invalid" });
    expect(state.revalidate).toEqual([]);
    expect(
      schemas.addOption.safeParse({
        decisionId: UUID,
        option: {
          title: "x",
          comune: null,
          link: "ftp://x",
          notes: null,
          pros: [],
          cons: [],
          costCents: null,
        },
      }).success,
    ).toBe(false);
  });

  it("without a session nothing is written and nothing is revalidated", async () => {
    state.client = anonClient();
    const result = await setReactionAction({ optionId: aId, reaction: "prefer" });
    expect(result).toMatchObject({ ok: false, code: "session" });
    expect(state.revalidate).toEqual([]);
    const rows = await wedding.founderClient
      .from("option_reactions")
      .select("id")
      .eq("option_id", aId);
    expect(rows.data).toEqual([]);
  });

  it("a reaction revalidates only Scelte", async () => {
    expect(await setReactionAction({ optionId: aId, reaction: "prefer" })).toMatchObject({
      ok: true,
    });
    expect(state.revalidate).toEqual([["/scelte"], ["/scelte/[key]", "page"]]);
  });

  it("a failed write revalidates nothing", async () => {
    const result = await addNoteAction({ decisionId: date.id, note: "   " });
    expect(result).toMatchObject({ ok: false, code: "note_required" });
    expect(state.revalidate).toEqual([]);
  });

  it("choosing also revalidates Percorso and Home; a stale version is refused", async () => {
    const stale = await chooseOptionAction({
      decisionId: date.id,
      optionId: bId,
      expectedVersion: date.version + 3,
    });
    expect(stale).toMatchObject({ ok: false, code: "version_conflict" });
    expect(state.revalidate).toEqual([]);

    const ok = await chooseOptionAction({
      decisionId: date.id,
      optionId: bId,
      expectedVersion: date.version,
    });
    expect(ok).toMatchObject({ ok: true });
    expect(state.revalidate).toEqual([
      ["/scelte"],
      ["/scelte/[key]", "page"],
      ["/percorso"],
      ["/"],
    ]);
  });

  it("on a taken decision only the location link can be edited, through locationOnly (review question)", async () => {
    const taken = await load("date");
    const scenario = taken.options.find((o) => o.id === bId)!.scenario!;
    const loc = await addOption(wedding.founderClient, {
      decisionId: (await load("location")).id,
      option: {
        title: "Villa",
        comune: null,
        link: null,
        notes: null,
        pros: [],
        cons: [],
        costCents: null,
      },
    });
    if (!loc.ok) throw new Error(loc.message);

    // dates: refused by the database trigger, whatever the client says
    const moved = await updateScenarioAction({
      scenarioId: scenario.id,
      version: scenario.version,
      scenario: { kind: "fixed", dateFrom: "2028-05-15", dateTo: null, locationOptionId: null },
    });
    expect(moved).toMatchObject({ ok: false, code: "decision_taken" });

    // even with locationOnly the dates in the payload are ignored: only the link is written
    const linked = await updateScenarioAction({
      scenarioId: scenario.id,
      version: scenario.version,
      scenario: {
        kind: "fixed",
        dateFrom: "2030-01-01",
        dateTo: null,
        locationOptionId: loc.data.optionId,
      },
      locationOnly: true,
    });
    expect(linked).toMatchObject({ ok: true });
    const after = (await load("date")).options.find((o) => o.id === bId)!.scenario!;
    expect(after.locationOptionId).toBe(loc.data.optionId);
    expect(after.dateFrom).toBe("2028-05-14");
  });

  it("reopen with a reason works and revalidates wide", async () => {
    const current = await load("date");
    state.revalidate = [];
    const result = await reopenDecisionAction({
      decisionId: current.id,
      reason: "Ripensiamoci",
      expectedVersion: current.version,
    });
    expect(result).toMatchObject({ ok: true });
    expect(state.revalidate).toContainEqual(["/percorso"]);
  });
});

describe("data layer failure paths (no database)", () => {
  /** Chainable stub: every call returns itself, awaiting yields `result`. */
  function chain(result: unknown): unknown {
    const handler: ProxyHandler<object> = {
      get: (_t, prop) =>
        prop === "then"
          ? (resolve: (v: unknown) => void) => resolve(result)
          : () => new Proxy({}, handler),
    };
    return new Proxy({}, handler);
  }

  it("addOption: a failing compensation is a retryable error, logged without data", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const calls: string[] = [];
    const db = {
      from(table: string) {
        calls.push(table);
        if (table === "decisions")
          return chain({ data: { wedding_id: "w", type: "date" }, error: null });
        if (table === "date_scenarios")
          return chain({ error: { code: "23514", message: "secret" } });
        // first decision_options call = insert, second = compensating update
        const nth = calls.filter((c) => c === "decision_options").length;
        return nth === 1
          ? chain({ data: { id: "o1" }, error: null })
          : chain({ error: { code: "08006", message: "secret" } });
      },
    } as unknown as Db;
    const result = await addOption(db, {
      decisionId: UUID,
      option: {
        title: "t",
        comune: null,
        link: null,
        notes: null,
        pros: [],
        cons: [],
        costCents: null,
      },
      scenario: { kind: "fixed", dateFrom: "2028-05-14", dateTo: null, locationOptionId: null },
    });
    expect(result).toMatchObject({ ok: false, code: "compensation_failed" });
    const logged = JSON.stringify(log.mock.calls);
    expect(logged).toContain("08006");
    expect(logged).not.toContain("secret");
    log.mockRestore();
  });

  it("setReaction: a concurrent insert (23505) is absorbed by one more update", async () => {
    let updates = 0;
    const db = {
      from() {
        return {
          update: () => ({
            eq: () => ({
              eq: () => {
                updates += 1;
                // 1st update (awaited through .select): no rows; 2nd (the retry): success
                return Object.assign(Promise.resolve({ data: null, error: null }), {
                  select: () => Promise.resolve({ data: [], error: null }),
                });
              },
            }),
          }),
          select: () => chain({ data: { wedding_id: "w" }, error: null }),
          insert: () => chain({ error: { code: "23505", message: "dup" } }),
        };
      },
    } as unknown as Db;
    const result = await setReaction(db, "u", { optionId: UUID, reaction: "prefer" });
    expect(result).toEqual({ ok: true, data: undefined });
    expect(updates).toBe(2);
  });
});
