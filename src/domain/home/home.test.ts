import { describe, expect, it } from "vitest";
import { todayInRome } from "@/lib/dates/plain-date";
import { tasksFor, userTask } from "@/domain/timeline/test-helpers";
import { resolveReference } from "@/domain/timeline/reference";
import { countdown, countdownAt } from "./countdown";
import { nextSteps } from "./next-step";

const ref = (date: string, state: "open" | "chosen" = "open") =>
  resolveReference({ scenarios: [{ id: "s", dateFrom: date, state }] });

describe("countdown (AC26)", () => {
  it("none without a reference", () => {
    expect(countdown(null, "2026-11-24")).toEqual({ kind: "none" });
  });

  it("provisional / definitive with days and floored weeks", () => {
    expect(countdown(ref("2027-09-03"), "2026-11-24")).toMatchObject({
      kind: "provisional",
      days: 283,
      weeks: 40,
      phase: "upcoming",
    });
    expect(countdown(ref("2027-09-03", "chosen"), "2026-11-24").kind).toBe("definitive");
  });

  it("today and past", () => {
    expect(countdown(ref("2027-09-03"), "2027-09-03")).toMatchObject({
      days: 0,
      weeks: 0,
      phase: "today",
    });
    expect(countdown(ref("2027-09-03"), "2027-09-10")).toMatchObject({
      days: -7,
      weeks: -1,
      phase: "past",
    });
  });

  it("uses the Europe/Rome day: 23:30 UTC the evening before is already the next day", () => {
    const r = ref("2027-09-03");
    expect(countdownAt(r, new Date("2026-11-24T22:30:00Z"))).toMatchObject({ days: 283 });
    expect(countdownAt(r, new Date("2026-11-24T23:30:00Z"))).toMatchObject({ days: 282 });
  });

  it("is stable across the DST changes (28/03/2027, 31/10/2027)", () => {
    const r = ref("2027-04-01");
    expect(countdownAt(r, new Date("2027-03-27T12:00:00Z"))?.kind).toBe("provisional");
    expect(countdownAt(r, new Date("2027-03-27T12:00:00Z"))).toMatchObject({ days: 5 });
    expect(countdownAt(r, new Date("2027-03-28T23:30:00Z"))).toMatchObject({ days: 3 });
    const r2 = ref("2027-11-05");
    expect(countdownAt(r2, new Date("2027-10-31T22:30:00Z"))).toMatchObject({ days: 5 });
    expect(countdownAt(r2, new Date("2027-10-31T23:30:00Z"))).toMatchObject({ days: 4 });
    expect(todayInRome(new Date("2027-10-31T23:30:00Z"))).toBe("2027-11-01");
  });
});

describe("nextSteps (AC27)", () => {
  const TODAY = "2026-11-24";
  const base = { openDecisions: [], payments: [], today: TODAY };

  it("spec §5.1: date decision open → first; then overdue by priority; max 1+2", () => {
    const r = nextSteps({
      ...base,
      openDecisions: [
        { id: "loc", kind: "location", title: "Location" },
        { id: "date", kind: "date", title: "Data" },
      ],
      tasks: tasksFor("civile", "2027-09-03"),
    });
    expect(r.primary).toMatchObject({ kind: "decision", id: "date" });
    expect(r.secondary.map((s) => s.id)).toEqual(["loc", "conferma-location-e-caparra"]);
  });

  it("decision taken: overdue tasks by priority, then tasks due within 30 days", () => {
    const r = nextSteps({ ...base, tasks: tasksFor("civile", "2027-09-03") });
    expect(r.primary).toMatchObject({ kind: "overdue-task", id: "conferma-location-e-caparra" });
    expect(r.secondary.map((s) => s.id)).toEqual([
      "contatta-comune-celebrazione",
      "scegli-catering",
    ]);
  });

  it("order across kinds: overdue task > payment ≤14d or overdue > task ≤30d", () => {
    const r = nextSteps({
      ...base,
      tasks: [userTask("soon", "2026-12-10"), userTask("late", "2026-11-01")],
      payments: [
        { id: "p-far", title: "Lontano", dueDate: "2026-12-30" },
        { id: "p-late", title: "Scaduto", dueDate: "2026-11-20" },
        { id: "p-near", title: "Vicino", dueDate: "2026-12-08" },
      ],
    });
    expect(r.primary).toMatchObject({ kind: "overdue-task", id: "late" });
    expect(r.secondary).toEqual([
      expect.objectContaining({ kind: "payment", id: "p-late", overdue: true }),
      expect.objectContaining({ kind: "payment", id: "p-near", overdue: false }),
    ]);
  });

  it("payment window: day 14 in, day 15 out; task window: day 30 in, 31 out", () => {
    const r = nextSteps({
      ...base,
      tasks: [userTask("t30", "2026-12-24"), userTask("t31", "2026-12-25")],
      payments: [
        { id: "p14", title: "14", dueDate: "2026-12-08" },
        { id: "p15", title: "15", dueDate: "2026-12-09" },
      ],
    });
    expect([r.primary?.id, ...r.secondary.map((s) => s.id)]).toEqual(["p14", "t30"]);
  });

  it("empty, completed, deleted and dateless tasks are ignored", () => {
    expect(nextSteps({ ...base, tasks: [] })).toEqual({ primary: null, secondary: [] });
    const r = nextSteps({
      ...base,
      tasks: [
        userTask("done", "2026-11-01", { status: "done" }),
        userTask("gone", "2026-11-01", { deleted: true }),
        userTask("nodate", null),
        ...tasksFor("civile", null),
      ],
    });
    expect(r.primary).toBeNull();
  });
});
