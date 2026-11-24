import { describe, expect, it } from "vitest";
import {
  buildSteps,
  needsRegister,
  quietMessage,
  reconcileVisit,
  SESSION_GAP_MS,
  showWelcome,
  stepView,
  type HomeTask,
  type StateRow,
} from "./model";

const TODAY = "2026-11-24";
const NOW = Date.parse("2026-11-24T10:00:00Z");

const row = (over: Partial<StateRow> = {}): StateRow => ({
  last_seen_at: null,
  previous_seen_at: null,
  last_export_at: null,
  welcome_dismissed_at: null,
  ...over,
});

const task = (over: Partial<HomeTask> & { id: string }): HomeTask => ({
  title: `Compito ${over.id}`,
  status: "todo",
  dueDate: null,
  dueOverridden: false,
  source: "user",
  templateKey: null,
  templateVersion: null,
  category: null,
  deleted: false,
  assignee: "both",
  ...over,
});

describe("visit registration (AC41)", () => {
  it("registers when there is no state or no last visit", () => {
    expect(needsRegister(null, NOW)).toBe(true);
    expect(needsRegister(row(), NOW)).toBe(true);
  });

  it("does not register again inside the same session (a reload keeps the news)", () => {
    const last = new Date(NOW - SESSION_GAP_MS + 1000).toISOString();
    expect(needsRegister(row({ last_seen_at: last }), NOW)).toBe(false);
  });

  it("registers again once the gap has passed", () => {
    const last = new Date(NOW - SESSION_GAP_MS).toISOString();
    expect(needsRegister(row({ last_seen_at: last }), NOW)).toBe(true);
  });

  it("keeps the database answer when nobody else registered in between", () => {
    const before = row({ last_seen_at: "2026-11-20T08:00:00+00:00" });
    const after = row({
      last_seen_at: "2026-11-24T10:00:00+00:00",
      previous_seen_at: "2026-11-20T08:00:00.000000+00:00",
    });
    expect(reconcileVisit(before, after).previousSeenAt).toBe("2026-11-20T08:00:00.000000+00:00");
  });

  it("recovers the real previous session when a concurrent request registered first", () => {
    const before = row({ last_seen_at: "2026-11-20T08:00:00+00:00" });
    const after = row({
      last_seen_at: "2026-11-24T10:00:01+00:00",
      previous_seen_at: "2026-11-24T10:00:00+00:00", // the other request's "now"
    });
    expect(reconcileVisit(before, after).previousSeenAt).toBe("2026-11-20T08:00:00+00:00");
  });

  it("a first visit stays a first visit even if a concurrent request registered first", () => {
    const after = row({
      last_seen_at: "2026-11-24T10:00:01+00:00",
      previous_seen_at: "2026-11-24T10:00:00+00:00",
    });
    expect(reconcileVisit(null, after).previousSeenAt).toBeNull();
    expect(reconcileVisit(row(), after).previousSeenAt).toBeNull();
  });

  it("the welcome card is for partner B on a first visit, until closed", () => {
    const first = { previousSeenAt: null, lastExportAt: null, welcomeDismissedAt: null };
    expect(showWelcome(first, "B")).toBe(true);
    expect(showWelcome(first, "A")).toBe(false);
    expect(showWelcome({ ...first, welcomeDismissedAt: "2026-11-24T10:00:00Z" }, "B")).toBe(false);
    expect(showWelcome({ ...first, previousSeenAt: "2026-11-20T08:00:00Z" }, "B")).toBe(false);
  });
});

describe("Prossimo passo, per person (design §3.3)", () => {
  const tasks = [
    task({ id: "a", assignee: "A", dueDate: "2026-11-30" }),
    task({ id: "b", assignee: "B", dueDate: "2026-11-26" }),
    task({ id: "c", assignee: "both", dueDate: "2026-12-05" }),
    task({ id: "d", assignee: "B", dueDate: "2026-11-27", deleted: true }),
  ];

  it("by default keeps only the viewer's and the shared tasks", () => {
    const steps = buildSteps({ openDecisions: [], tasks, payments: [], mySlot: "A", today: TODAY });
    expect(steps.mine.primary?.id).toBe("a");
    expect(steps.mine.secondary.map((s) => s.id)).toEqual(["c"]);
  });

  it("with the switch it adds the partner's, never the deleted ones", () => {
    const steps = buildSteps({ openDecisions: [], tasks, payments: [], mySlot: "A", today: TODAY });
    expect(steps.all.primary?.id).toBe("b");
    expect(steps.all.secondary.map((s) => s.id)).toEqual(["a", "c"]);
    expect(steps.hasPartnerTasks).toBe(true);
  });

  it("the switch is not offered when the partner has nothing open", () => {
    const steps = buildSteps({
      openDecisions: [],
      tasks: tasks.filter((t) => t.assignee !== "B"),
      payments: [],
      mySlot: "A",
      today: TODAY,
    });
    expect(steps.hasPartnerTasks).toBe(false);
  });

  it("an open decision leads, then the payments due within 14 days", () => {
    const steps = buildSteps({
      openDecisions: [{ id: "dec", kind: "date", title: "Scegli la data" }],
      tasks: [],
      payments: [{ id: "p", title: "Acconto catering", dueDate: "2026-12-01" }],
      mySlot: "A",
      today: TODAY,
    });
    expect(steps.mine.primary).toMatchObject({ kind: "decision", decisionKind: "date" });
    expect(steps.mine.secondary).toMatchObject([{ kind: "payment", id: "p" }]);
  });
});

describe("quiet message", () => {
  it("names the next task beyond the 30-day window, in weeks", () => {
    const later = task({ id: "x", title: "Prenotare il fotografo", dueDate: "2027-01-05" });
    expect(quietMessage([later], TODAY)).toBe(
      "Per ora niente di urgente. Il prossimo passo è «Prenotare il fotografo», tra 6 settimane.",
    );
  });

  it("is just the first sentence when there is nothing ahead", () => {
    expect(quietMessage([], TODAY)).toBe("Per ora niente di urgente.");
  });
});

describe("step view", () => {
  it("links a decision to its page and a payment to the budget", () => {
    expect(
      stepView({ kind: "decision", id: "1", title: "Scegli la data", decisionKind: "date" }, TODAY)
        .href,
    ).toBe("/scelte/date");
    expect(
      stepView(
        { kind: "decision", id: "2", title: "Scegli la location", decisionKind: "location" },
        TODAY,
      ).href,
    ).toBe("/scelte/location");
    expect(
      stepView(
        { kind: "payment", id: "3", title: "Acconto", dueDate: "2026-12-01", overdue: false },
        TODAY,
      ),
    ).toMatchObject({ href: "/budget", detail: "Da pagare entro il 1 dic 2026" });
  });

  it("says when a task is due", () => {
    expect(
      stepView({ kind: "upcoming-task", id: "4", title: "T", dueDate: "2026-11-25" }, TODAY).detail,
    ).toBe("Scade il 25 nov 2026 (domani)");
  });
});
