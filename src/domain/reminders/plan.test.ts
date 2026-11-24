import { describe, expect, it } from "vitest";
import { dueTodayKey, planReminders, sevenDayKey } from "./plan";
import type { PlanRecipient, PlanTask } from "./types";

const TODAY = "2027-03-10";
const A: PlanRecipient = { userId: "ua", slot: "A", remindersEnabled: true, digestEnabled: true };
const B: PlanRecipient = { userId: "ub", slot: "B", remindersEnabled: true, digestEnabled: true };

function task(id: string, dueDate: string | null, extra: Partial<PlanTask> = {}): PlanTask {
  return {
    id,
    title: `Compito ${id}`,
    dueDate,
    status: "todo",
    assignee: "both",
    remindersEnabled: true,
    deletedAt: null,
    ...extra,
  };
}

const plan = (
  tasks: PlanTask[],
  recipients: PlanRecipient[] = [A, B],
  extra: Partial<Parameters<typeof planReminders>[0]> = {},
) => planReminders({ today: TODAY, recipients, tasks, provisional: false, ...extra });

describe("planReminders: windows", () => {
  it("puts tasks due in 1..7 days in 'tra 7 giorni' and today's in 'oggi'", () => {
    const [p] = plan(
      [
        task("t8", "2027-03-18"), // 8 days: not yet
        task("t7", "2027-03-17"),
        task("t1", "2027-03-11"),
        task("t0", TODAY),
        task("past", "2027-03-09"),
      ],
      [A],
    );
    expect(p?.sevenDays.map((t) => t.id)).toEqual(["t1", "t7"]);
    expect(p?.today.map((t) => t.id)).toEqual(["t0"]);
    expect(p?.itemKeys).toEqual([
      sevenDayKey("t1", "2027-03-11"),
      sevenDayKey("t7", "2027-03-17"),
      dueTodayKey("t0", TODAY),
    ]);
  });

  it("recovers a skipped cron run: a task due in 6 days still gets its 7-day reminder", () => {
    const [p] = plan([task("t6", "2027-03-16")], [A]);
    expect(p?.sevenDays.map((t) => t.id)).toEqual(["t6"]);
  });

  it("does not recover a missed 'oggi' (the digest lists it as to recover)", () => {
    expect(plan([task("yesterday", "2027-03-09")], [A])).toEqual([]);
  });

  it("returns nothing for users without anything to remind", () => {
    expect(plan([task("far", "2027-06-01")])).toEqual([]);
  });
});

describe("planReminders: exclusions", () => {
  it("skips done, deleted, undated and switched-off tasks (AC50, AC61)", () => {
    const due = "2027-03-12";
    expect(
      plan(
        [
          task("done", due, { status: "done" }),
          task("deleted", due, { deletedAt: "2027-03-01T00:00:00Z" }),
          task("nodate", null),
          task("off", due, { remindersEnabled: false }),
        ],
        [A],
      ),
    ).toEqual([]);
  });

  it("never reminds twice: keys already claimed or sent by other batches are skipped", () => {
    const due = "2027-03-12";
    const done = new Map([["ua", new Set([sevenDayKey("t", due)])]]);
    expect(plan([task("t", due)], [A], { doneKeys: done })).toEqual([]);
    // the same task still goes to the other user
    expect(plan([task("t", due)], [A, B], { doneKeys: done }).map((p) => p.userId)).toEqual(["ub"]);
  });

  it("a 7-day reminder already sent does not stop the 'oggi' one", () => {
    const done = new Map([["ua", new Set([sevenDayKey("t", TODAY)])]]);
    const [p] = plan([task("t", TODAY)], [A], { doneKeys: done });
    expect(p?.today.map((t) => t.id)).toEqual(["t"]);
  });

  it("skips users who switched reminders off (AC52)", () => {
    expect(plan([task("t", "2027-03-12")], [{ ...A, remindersEnabled: false }])).toEqual([]);
  });
});

describe("planReminders: audience (AC50, D44)", () => {
  const tasks = [
    task("both", "2027-03-12"),
    task("onlyA", "2027-03-12", { assignee: "A" }),
    task("onlyB", "2027-03-12", { assignee: "B" }),
  ];

  it("'both' goes to both partners, A/B only to that partner", () => {
    const plans = plan(tasks);
    expect(
      plans
        .find((p) => p.userId === "ua")
        ?.sevenDays.map((t) => t.id)
        .sort(),
    ).toEqual(["both", "onlyA"]);
    expect(
      plans
        .find((p) => p.userId === "ub")
        ?.sevenDays.map((t) => t.id)
        .sort(),
    ).toEqual(["both", "onlyB"]);
  });

  it("partner B without a membership is not a recipient: shared tasks go only to A, B's own to nobody", () => {
    const plans = plan(tasks, [A]);
    expect(plans.map((p) => p.userId)).toEqual(["ua"]);
    expect(plans[0]?.sevenDays.map((t) => t.id).sort()).toEqual(["both", "onlyA"]);
  });
});

describe("planReminders: no catch-up at entry (D44)", () => {
  const due = "2027-03-14"; // window opened 2027-03-07
  it("skips the 7-day reminder whose window opened before the user joined", () => {
    expect(plan([task("t", due)], [{ ...B, joinedOn: "2027-03-08" }])).toEqual([]);
  });

  it("keeps it when the user joined on or before the day the window opened", () => {
    expect(plan([task("t", due)], [{ ...B, joinedOn: "2027-03-07" }])).toHaveLength(1);
    expect(plan([task("t", due)], [{ ...B, joinedOn: "2027-01-01" }])).toHaveLength(1);
  });

  it("never blocks 'oggi'", () => {
    const [p] = plan([task("t", TODAY)], [{ ...B, joinedOn: TODAY }]);
    expect(p?.today.map((t) => t.id)).toEqual(["t"]);
  });
});

describe("planReminders: dates set or changed inside the window (D38)", () => {
  const due = "2027-03-14"; // window opens 2027-03-07
  it("no 7-day reminder when the date was set on or after the window opened", () => {
    expect(plan([task("t", due)], [A], { dueChangedOn: new Map([["t", "2027-03-07"]]) })).toEqual(
      [],
    );
    expect(plan([task("t", due)], [A], { dueChangedOn: new Map([["t", "2027-03-09"]]) })).toEqual(
      [],
    );
  });

  it("a date set before the window opened still gets it", () => {
    const [p] = plan([task("t", due)], [A], { dueChangedOn: new Map([["t", "2027-03-06"]]) });
    expect(p?.sevenDays.map((t) => t.id)).toEqual(["t"]);
  });

  it("does not affect the 'oggi' reminder", () => {
    const [p] = plan([task("t", TODAY)], [A], { dueChangedOn: new Map([["t", TODAY]]) });
    expect(p?.today.map((t) => t.id)).toEqual(["t"]);
  });
});

describe("planReminders: provisional note", () => {
  it("marks planned tasks as provisional when the date decision is open", () => {
    const [p] = plan([task("t", "2027-03-12")], [A], { provisional: true });
    expect(p?.sevenDays[0]?.provisional).toBe(true);
  });
});

describe("planReminders: volume", () => {
  it("40 tasks in the window make ONE plan per user, with at most 200 item keys", () => {
    const tasks = Array.from({ length: 250 }, (_, i) => task(`t${i}`, "2027-03-12"));
    const plans = plan(tasks, [A]);
    expect(plans).toHaveLength(1);
    expect(plans[0]?.itemKeys.length).toBe(200);
  });
});
