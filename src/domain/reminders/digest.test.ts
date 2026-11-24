import { describe, expect, it } from "vitest";
import { planDigest, type PlanDigestInput } from "./digest";
import type { PlanPayment, PlanRecipient, PlanTask } from "./types";

const TODAY = "2027-03-08"; // a Monday
const A: PlanRecipient = { userId: "ua", slot: "A", remindersEnabled: true, digestEnabled: true };

const task = (id: string, dueDate: string | null, extra: Partial<PlanTask> = {}): PlanTask => ({
  id,
  title: `Compito ${id}`,
  dueDate,
  status: "todo",
  assignee: "both",
  remindersEnabled: true,
  deletedAt: null,
  ...extra,
});

const payment = (
  id: string,
  dueDate: string | null,
  extra: Partial<PlanPayment> = {},
): PlanPayment => ({
  id,
  description: `Voce ${id}`,
  amountCents: 10_000,
  dueDate,
  paid: false,
  deletedAt: null,
  itemDeleted: false,
  ...extra,
});

const plan = (extra: Partial<PlanDigestInput>) =>
  planDigest({
    today: TODAY,
    recipient: A,
    tasks: [],
    payments: [],
    news: [],
    provisional: false,
    ...extra,
  });

describe("planDigest", () => {
  it("is null when there is nothing to report (AC51)", () => {
    expect(plan({})).toBeNull();
    expect(
      plan({ tasks: [task("far", "2027-06-01")], payments: [payment("far", "2027-06-01")] }),
    ).toBeNull();
  });

  it("lists overdue and next-7-days tasks, overdue flagged, in date order", () => {
    const result = plan({
      tasks: [
        task("soon", "2027-03-12"),
        task("late", "2027-03-01"),
        task("edge", "2027-03-15"),
        task("out", "2027-03-16"),
      ],
    });
    expect(result?.todo.map((t) => [t.title, t.overdue])).toEqual([
      ["Compito late", true],
      ["Compito soon", false],
      ["Compito edge", false],
    ]);
  });

  it("uses the same audience, switch and status rules as the reminders", () => {
    const result = plan({
      tasks: [
        task("onlyB", "2027-03-10", { assignee: "B" }),
        task("off", "2027-03-10", { remindersEnabled: false }),
        task("done", "2027-03-10", { status: "done" }),
        task("deleted", "2027-03-10", { deletedAt: "2027-03-01T00:00:00Z" }),
        task("nodate", null),
        task("mine", "2027-03-10", { assignee: "A" }),
      ],
    });
    expect(result?.todo.map((t) => t.title)).toEqual(["Compito mine"]);
  });

  it("lists unpaid payments due within 7 days or late, not those of deleted items", () => {
    const result = plan({
      payments: [
        payment("soon", "2027-03-10"),
        payment("late", "2027-03-02"),
        payment("paid", "2027-03-10", { paid: true }),
        payment("deleted", "2027-03-10", { deletedAt: "2027-03-01T00:00:00Z" }),
        payment("itemGone", "2027-03-10", { itemDeleted: true }),
        payment("nodate", null),
        payment("far", "2027-04-10"),
      ],
    });
    expect(result?.payments.map((p) => p.description)).toEqual(["Voce late", "Voce soon"]);
  });

  it("is not empty when only the partner's news exist", () => {
    expect(plan({ news: ["Jessica ha completato «Prenotare»"] })?.news).toHaveLength(1);
  });

  it("carries the provisional flag to the tasks", () => {
    expect(
      plan({ provisional: true, tasks: [task("t", "2027-03-10")] })?.todo[0]?.provisional,
    ).toBe(true);
  });
});
