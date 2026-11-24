import { beforeAll, describe, expect, it } from "vitest";
import {
  addNote,
  addOption,
  chooseOption,
  loadDecisionDetail,
  loadDecisionList,
  removeOption,
  reopenDecision,
  setReaction,
  setReference,
  updateOption,
  updateScenario,
} from "@/features/decisions/data";
import type { DecisionDetailView, OptionInput } from "@/features/decisions/types";
import {
  addPartnerB,
  createWedding,
  serviceClient,
  type TestPartnerB,
  type TestWedding,
} from "../support/supabase";

/**
 * T12: the data layer of Scelte against the real database, with the user's clients (RLS and the
 * T8 triggers/RPCs decide). Nothing here mocks Supabase.
 */
const TODAY = "2026-11-24";

const place = (title: string, extra: Partial<OptionInput> = {}): OptionInput => ({
  title,
  comune: "Lucca",
  link: null,
  notes: null,
  pros: ["Giardino"],
  cons: [],
  costCents: 500000,
  ...extra,
});

describe("Scelte data layer", () => {
  let wedding: TestWedding;
  let partnerB: TestPartnerB;
  let aId: string;
  let bId: string;

  async function detail(
    key: "date" | "location",
    as: "a" | "b" = "a",
  ): Promise<DecisionDetailView> {
    const client = as === "a" ? wedding.founderClient : partnerB.client;
    const userId = as === "a" ? wedding.founder.id : partnerB.user.id;
    const view = await loadDecisionDetail(client, key, { userId, today: TODAY });
    if (!view) throw new Error(`decision ${key} missing`);
    return view;
  }

  beforeAll(async () => {
    wedding = await createWedding();
    partnerB = await addPartnerB(wedding);
    await wedding.founderClient
      .from("wedding_partners")
      .update({ first_name: "Tony" })
      .eq("user_id", wedding.founder.id);
    await serviceClient()
      .from("wedding_partners")
      .update({ first_name: "Jessica" })
      .eq("user_id", partnerB.user.id);

    const done = await wedding.founderClient.rpc("complete_onboarding", {
      p_scenarios: [
        { kind: "fixed", date_from: "2027-09-03", label: "3 settembre 2027" },
        {
          kind: "period",
          date_from: "2028-05-01",
          date_to: "2028-06-30",
          label: "Maggio-giugno 2028",
        },
      ],
    });
    if (done.error) throw new Error(`complete_onboarding failed: ${done.error.message}`);
  });

  it("lists the two standard decisions, date first, open", async () => {
    const items = await loadDecisionList(wedding.founderClient);
    expect(items.map((i) => [i.key, i.state, i.optionCount])).toEqual([
      ["date", "open", 2],
      ["location", "open", 0],
    ]);
  });

  it("the date detail resolves the automatic reference and names the partner", async () => {
    const view = await detail("date");
    aId = view.options.find((o) => o.title === "3 settembre 2027")!.id;
    bId = view.options.find((o) => o.title === "Maggio-giugno 2028")!.id;
    expect(view.reference).toMatchObject({
      optionId: aId,
      status: "provisional",
      source: "automatic",
    });
    expect(view.partnerName).toBe("Jessica");
    expect(view.meName).toBe("Tony");
  });

  it("adds a location, and a date linked to it (AC60); the link shows by name", async () => {
    const loc = await addOption(wedding.founderClient, {
      decisionId: (await detail("location")).id,
      option: place("Mamma Rosa"),
    });
    expect(loc.ok).toBe(true);
    if (!loc.ok) return;

    const dateDecision = await detail("date");
    const date = await addOption(wedding.founderClient, {
      decisionId: dateDecision.id,
      option: { ...place(""), comune: null, pros: [], costCents: null },
      scenario: {
        kind: "fixed",
        dateFrom: "2028-09-02",
        dateTo: null,
        locationOptionId: loc.data.optionId,
      },
    });
    expect(date.ok).toBe(true);
    const after = await detail("date");
    const added = after.options.find((o) => o.id === (date.ok ? date.data.optionId : ""))!;
    expect(added.title).toBe("2 settembre 2028");
    expect(added.scenario?.locationName).toBe("Mamma Rosa");
    expect(after.locationChoices.map((c) => c.title)).toEqual(["Mamma Rosa"]);
    // choosing/linking a location never chooses it
    expect((await detail("location")).status).toBe("open");
  });

  it("a date whose second insert fails leaves no half-created option behind", async () => {
    const before = await detail("date");
    const result = await addOption(wedding.founderClient, {
      decisionId: before.id,
      option: place("Rotta"),
      // a date option cannot link to another date option: the trigger refuses (invalid_location)
      scenario: { kind: "fixed", dateFrom: "2028-10-01", dateTo: null, locationOptionId: aId },
    });
    expect(result).toMatchObject({ ok: false, code: "invalid_location" });
    const after = await detail("date");
    expect(after.options.map((o) => o.id).sort()).toEqual(before.options.map((o) => o.id).sort());
  });

  it("reactions: one per partner, visible to the other, removable (AC22)", async () => {
    expect(
      (
        await setReaction(wedding.founderClient, wedding.founder.id, {
          optionId: aId,
          reaction: "prefer",
        })
      ).ok,
    ).toBe(true);
    expect(
      (await setReaction(partnerB.client, partnerB.user.id, { optionId: aId, reaction: "doubt" }))
        .ok,
    ).toBe(true);
    // change of mind: update path, not a duplicate
    expect(
      (
        await setReaction(wedding.founderClient, wedding.founder.id, {
          optionId: aId,
          reaction: "doubt",
        })
      ).ok,
    ).toBe(true);

    const seenByB = (await detail("date", "b")).options.find((o) => o.id === aId)!;
    expect(seenByB.reactions.map((r) => [r.name, r.reaction, r.mine]).sort()).toEqual([
      ["Jessica", "doubt", true],
      ["Tony", "doubt", false],
    ]);
    expect(
      (
        await setReaction(wedding.founderClient, wedding.founder.id, {
          optionId: aId,
          reaction: null,
        })
      ).ok,
    ).toBe(true);
    const after = (await detail("date", "b")).options.find((o) => o.id === aId)!;
    expect(after.reactions.map((r) => r.name)).toEqual(["Jessica"]);
    // a reaction does not change the decision
    expect((await detail("date")).status).toBe("open");
  });

  it("editing with a stale version reports who changed it and does not overwrite (AC40)", async () => {
    const loc = (await detail("location")).options[0]!;
    const first = await updateOption(wedding.founderClient, wedding.founder.id, {
      optionId: loc.id,
      version: loc.version,
      option: place("Mamma Rosa", { comune: "Pisa" }),
    });
    expect(first.ok).toBe(true);

    const stale = await updateOption(partnerB.client, partnerB.user.id, {
      optionId: loc.id,
      version: loc.version,
      option: place("Mamma Rosa", { comune: "Siena" }),
    });
    expect(stale).toMatchObject({
      ok: false,
      code: "conflict",
      conflict: { changedByName: "Tony" },
    });
    if (!stale.ok && "conflict" in stale) {
      expect(stale.conflict.current).toMatchObject({ comune: "Pisa" });
      const currentVersion = stale.conflict.current!["version"] as number;
      const forced = await updateOption(partnerB.client, partnerB.user.id, {
        optionId: loc.id,
        version: currentVersion,
        option: place("Mamma Rosa", { comune: "Siena" }),
      });
      expect(forced.ok).toBe(true);
    }
    expect((await detail("location")).options[0]!.comune).toBe("Siena");
  });

  it("manual reference, with the event in the history, and back to automatic (AC24)", async () => {
    const set = await setReference(wedding.founderClient, bId);
    expect(set).toMatchObject({
      ok: true,
      data: { previousOptionId: null },
    });
    expect(set).toMatchObject({
      ok: true,
      data: { optionId: bId, status: "provisional", source: "manual", referenceDate: "2028-05-01" },
    });
    let view = await detail("date");
    expect(view.reference).toMatchObject({ optionId: bId, source: "manual", setByName: "Tony" });
    expect(view.manualReferenceId).toBe(bId);
    expect(view.events.at(-1)).toMatchObject({ kind: "reference_set", actorName: "Tony" });

    const auto = await setReference(wedding.founderClient, null);
    expect(auto).toMatchObject({ ok: true, data: { source: "automatic" } });
    view = await detail("date");
    expect(view.reference?.source).toBe("automatic");
    expect(view.events.at(-1)?.kind).toBe("reference_auto");

    expect(
      await setReference(wedding.founderClient, "00000000-0000-0000-0000-000000000000"),
    ).toMatchObject({
      ok: false,
      code: "invalid_option",
    });
  });

  it("choosing a period without the day is refused; with a day outside it too (AC64)", async () => {
    const view = await detail("date");
    const missing = await chooseOption(wedding.founderClient, wedding.founder.id, {
      decisionId: view.id,
      optionId: bId,
      expectedVersion: view.version,
    });
    expect(missing).toMatchObject({ ok: false, code: "exact_date_required" });
    const outside = await chooseOption(wedding.founderClient, wedding.founder.id, {
      decisionId: view.id,
      optionId: bId,
      expectedVersion: view.version,
      exactDate: "2028-08-01",
    });
    expect(outside).toMatchObject({ ok: false, code: "exact_date_out_of_period" });
  });

  it("a stale decision version is a conflict, not an overwrite", async () => {
    const view = await detail("date");
    const result = await chooseOption(wedding.founderClient, wedding.founder.id, {
      decisionId: view.id,
      optionId: aId,
      expectedVersion: view.version + 5,
    });
    expect(result).toMatchObject({ ok: false, code: "version_conflict" });
    if (!result.ok) expect(result.message).toMatch(/^Jessica /);
  });

  it("chooses the period with an exact day: it becomes a fixed date, the history keeps the period (D33)", async () => {
    const view = await detail("date");
    const result = await chooseOption(wedding.founderClient, wedding.founder.id, {
      decisionId: view.id,
      optionId: bId,
      expectedVersion: view.version,
      exactDate: "2028-05-20",
    });
    expect(result).toMatchObject({ ok: true, data: { referenceDate: "2028-05-20" } });

    const taken = await detail("date");
    expect(taken.state).toBe("taken");
    expect(taken.chosenByName).toBe("Tony");
    expect(taken.reference).toMatchObject({
      optionId: bId,
      status: "definitive",
      source: "chosen",
    });
    const chosen = taken.options.find((o) => o.id === bId)!;
    expect(chosen.scenario).toMatchObject({ kind: "fixed", dateFrom: "2028-05-20", dateTo: null });
    expect(taken.options.filter((o) => o.status === "discarded").length).toBeGreaterThan(0);
    const event = taken.events.find((e) => e.kind === "chosen")!;
    expect(event.payload["period"]).toMatchObject({
      date_from: "2028-05-01",
      date_to: "2028-06-30",
    });
    // AC60: choosing a date does not choose the location
    expect((await detail("location")).status).toBe("open");
  });

  it("after the choice: no new candidates, no reference change, no removal of the chosen, dates frozen but the location link editable", async () => {
    const view = await detail("date");
    expect(
      await addOption(wedding.founderClient, {
        decisionId: view.id,
        option: place(""),
        scenario: { kind: "fixed", dateFrom: "2029-01-01", dateTo: null, locationOptionId: null },
      }),
    ).toMatchObject({ ok: false, code: "decision_taken" });
    expect(await setReference(wedding.founderClient, aId)).toMatchObject({
      ok: false,
      code: "decision_taken",
    });

    const chosen = view.options.find((o) => o.id === bId)!;
    expect(
      await removeOption(wedding.founderClient, wedding.founder.id, {
        optionId: bId,
        version: chosen.version,
      }),
    ).toMatchObject({ ok: false, code: "option_chosen" });

    const scenario = chosen.scenario!;
    const moved = await updateScenario(wedding.founderClient, wedding.founder.id, {
      scenarioId: scenario.id,
      version: scenario.version,
      scenario: { kind: "fixed", dateFrom: "2028-05-21", dateTo: null, locationOptionId: null },
    });
    expect(moved).toMatchObject({ ok: false, code: "decision_taken" });

    const location = (await detail("location")).options[0]!;
    const linked = await updateScenario(wedding.founderClient, wedding.founder.id, {
      scenarioId: scenario.id,
      version: scenario.version,
      scenario: {
        kind: "fixed",
        dateFrom: "2028-05-20",
        dateTo: null,
        locationOptionId: location.id,
      },
      locationOnly: true,
    });
    expect(linked.ok).toBe(true);
    expect((await detail("date")).options.find((o) => o.id === bId)!.scenario?.locationName).toBe(
      "Mamma Rosa",
    );
  });

  it("reopening needs a reason; then the same scenario stays the provisional reference (AC19, D28)", async () => {
    const view = await detail("date");
    expect(
      await reopenDecision(wedding.founderClient, wedding.founder.id, {
        decisionId: view.id,
        reason: "   ",
        expectedVersion: view.version,
      }),
    ).toMatchObject({ ok: false, code: "reason_required" });
    expect(
      await reopenDecision(wedding.founderClient, wedding.founder.id, {
        decisionId: view.id,
        reason: "x".repeat(501),
        expectedVersion: view.version,
      }),
    ).toMatchObject({ ok: false, code: "reason_too_long" });

    const ok = await reopenDecision(partnerB.client, partnerB.user.id, {
      decisionId: view.id,
      reason: "La location non è libera",
      expectedVersion: view.version,
    });
    expect(ok.ok).toBe(true);

    const reopened = await detail("date");
    expect(reopened.state).toBe("review");
    expect(reopened.reference).toMatchObject({ optionId: bId, status: "provisional" });
    expect(reopened.options.every((o) => o.status === "candidate")).toBe(true);
    const event = reopened.events.at(-1)!;
    expect(event).toMatchObject({
      kind: "reopened",
      actorName: "Jessica",
      reason: "La location non è libera",
    });
    expect(
      await reopenDecision(wedding.founderClient, wedding.founder.id, {
        decisionId: view.id,
        reason: "ancora",
        expectedVersion: reopened.version,
      }),
    ).toMatchObject({ ok: false, code: "not_taken" });
  });

  it("notes are appended to the history and empty ones are refused", async () => {
    const view = await detail("location");
    expect(
      (await addNote(wedding.founderClient, { decisionId: view.id, note: "Chiamare lunedì" })).ok,
    ).toBe(true);
    expect(await addNote(wedding.founderClient, { decisionId: view.id, note: "  " })).toMatchObject(
      {
        ok: false,
        code: "note_required",
      },
    );
    const after = await detail("location");
    expect(after.events.at(-1)).toMatchObject({
      kind: "note",
      reason: "Chiamare lunedì",
      actorName: "Tony",
    });
  });

  it("an option can be removed and put back", async () => {
    const dateDecision = await detail("date");
    const extra = await addOption(wedding.founderClient, {
      decisionId: dateDecision.id,
      option: place("Da togliere"),
      scenario: { kind: "fixed", dateFrom: "2029-02-02", dateTo: null, locationOptionId: null },
    });
    if (!extra.ok) throw new Error(extra.message);
    const row = (await detail("date")).options.find((o) => o.id === extra.data.optionId)!;
    const removed = await removeOption(wedding.founderClient, wedding.founder.id, {
      optionId: row.id,
      version: row.version,
    });
    expect(removed.ok).toBe(true);
    expect((await detail("date")).options.some((o) => o.id === row.id)).toBe(false);
  });
});
