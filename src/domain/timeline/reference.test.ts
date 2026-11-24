import { describe, expect, it } from "vitest";
import { resolveReference, type ScenarioInput } from "./reference";

const TODAY = "2026-11-24";
const s = (
  id: string,
  dateFrom: string,
  state: ScenarioInput["state"] = "open",
  isPeriod = false,
): ScenarioInput => ({ id, dateFrom, state, isPeriod });
const resolve = (
  scenarios: ScenarioInput[],
  manualReferenceId: string | null = null,
  today = TODAY,
) => resolveReference({ scenarios, manualReferenceId, today });

describe("resolveReference (AC24, D28)", () => {
  it("is null without scenarios", () => {
    expect(resolve([])).toBeNull();
  });

  it("a single scenario is the provisional reference", () => {
    expect(resolve([s("a", "2027-09-03")])).toMatchObject({
      scenarioId: "a",
      status: "provisional",
      source: "automatic",
    });
  });

  it("defaults to the nearest (earliest) open scenario", () => {
    const r = resolve([
      s("sep28", "2028-09-01"),
      s("sep27", "2027-09-03"),
      s("mag28", "2028-05-01", "open", true),
    ]);
    expect(r).toMatchObject({ scenarioId: "sep27", date: "2027-09-03", status: "provisional" });
  });

  it("breaks date ties by id", () => {
    expect(resolve([s("b", "2027-09-03"), s("a", "2027-09-03")])?.scenarioId).toBe("a");
  });

  it("a period uses its first day", () => {
    expect(resolve([s("p", "2028-05-01", "open", true)])).toMatchObject({
      date: "2028-05-01",
      isPeriod: true,
    });
  });

  it("an open scenario already in the past is not the automatic default", () => {
    const r = resolve([s("past", "2026-10-01"), s("next", "2027-09-03")]);
    expect(r?.scenarioId).toBe("next");
  });

  it("today itself still counts as upcoming", () => {
    expect(resolve([s("t", TODAY), s("n", "2027-09-03")])?.scenarioId).toBe("t");
  });

  it("if every open scenario is past, falls back to the earliest of them", () => {
    const r = resolve([s("b", "2026-10-01"), s("a", "2026-09-01")]);
    expect(r?.scenarioId).toBe("a");
  });

  it("a manual open scenario wins over the nearest, still provisional (even if past)", () => {
    const scenarios = [s("a", "2027-09-03"), s("b", "2028-05-01")];
    expect(resolve(scenarios, "b")).toMatchObject({
      scenarioId: "b",
      status: "provisional",
      source: "manual",
    });
    expect(resolve([s("a", "2027-09-03"), s("old", "2026-01-01")], "old")?.scenarioId).toBe("old");
  });

  it("'torna automatico' (null) goes back to the nearest", () => {
    expect(resolve([s("a", "2027-09-03"), s("b", "2028-05-01")], null)?.scenarioId).toBe("a");
  });

  it("a manual scenario that is gone or not open falls back to automatic", () => {
    const scenarios = [s("a", "2027-09-03"), s("b", "2028-05-01", "discarded")];
    expect(resolve(scenarios, "b")?.scenarioId).toBe("a");
    expect(resolve(scenarios, "deleted")?.scenarioId).toBe("a");
  });

  it("decided: the chosen scenario is definitive, over nearest and manual", () => {
    const r = resolve([s("a", "2027-09-03", "discarded"), s("b", "2028-05-01", "chosen")], "a");
    expect(r).toMatchObject({ scenarioId: "b", status: "definitive", source: "chosen" });
  });

  it("reopened (no chosen, previous kept as manual): same scenario, provisional", () => {
    const r = resolve([s("a", "2027-09-03"), s("b", "2028-05-01")], "b");
    expect(r).toMatchObject({ scenarioId: "b", date: "2028-05-01", status: "provisional" });
  });

  it("only discarded scenarios → null", () => {
    expect(resolve([s("a", "2027-09-03", "discarded")])).toBeNull();
  });
});
