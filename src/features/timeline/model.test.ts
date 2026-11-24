import { describe, expect, it } from "vitest";
import { diffFields } from "@/components/ConflictDialog";
import type { Tables } from "@/lib/supabase/database.types";
import { dueExactText, relativeDue } from "./copy";
import { TASK_FIELD_LABELS, taskFieldFormatter, taskToFields } from "./field-labels";
import { assigneeName, initialsOf, rowToTask } from "./model";
import { makeData, task } from "./test-fixtures";

const row: Tables<"tasks"> = {
  advice: "Consiglio",
  assignee: "B",
  category: "catering",
  completed_at: null,
  completed_by: null,
  created_at: "2026-11-01T00:00:00Z",
  created_by: null,
  deleted_at: null,
  deleted_by: null,
  due_date: "2027-03-12",
  due_overridden: true,
  id: "t1",
  needs_review: true,
  notes: "nota",
  reminders_enabled: false,
  source: "template",
  status: "done",
  template_key: "scegli-catering",
  template_offset: { months: 11 },
  template_version: 1,
  title: "Scegliere il catering",
  updated_at: "2026-11-02T00:00:00Z",
  updated_by: "u1",
  version: 4,
  wedding_id: "w1",
};

describe("rowToTask", () => {
  it("maps DB columns to the engine task and the view fields", () => {
    const t = rowToTask(row);
    expect(t).toMatchObject({
      id: "t1",
      status: "done",
      dueDate: "2027-03-12",
      dueOverridden: true,
      source: "template",
      templateKey: "scegli-catering",
      deleted: false,
      assignee: "B",
      remindersEnabled: false,
      needsReview: true,
      version: 4,
    });
  });

  it("a soft-deleted row is `deleted`; an unknown assignee falls back to Entrambi", () => {
    const t = rowToTask({
      ...row,
      deleted_at: "2026-11-03T00:00:00Z",
      assignee: "x",
      due_date: null,
    });
    expect(t.deleted).toBe(true);
    expect(t.assignee).toBe("both");
    expect(t.dueDate).toBeNull();
  });
});

describe("names and copy", () => {
  const { partners } = makeData();

  it("shows Entrambi or the partner name, with initials", () => {
    expect(assigneeName(partners, "both")).toBe("Entrambi");
    expect(assigneeName(partners, "B")).toBe("Jessica");
    expect(assigneeName([], "A")).toBe("il tuo partner");
    expect(initialsOf("Maria Rossi")).toBe("MR");
    expect(initialsOf("tony")).toBe("T");
  });

  it("relative deadlines in Italian, exact date for screen readers", () => {
    const today = "2026-11-24";
    expect(relativeDue("2026-11-24", today)).toBe("oggi");
    expect(relativeDue("2026-11-25", today)).toBe("domani");
    expect(relativeDue("2026-11-23", today)).toBe("ieri");
    expect(relativeDue("2026-11-27", today)).toBe("tra 3 giorni");
    expect(relativeDue("2026-12-15", today)).toBe("tra 3 settimane");
    expect(relativeDue("2027-03-24", today)).toBe("tra 4 mesi");
    expect(relativeDue("2026-11-03", today)).toBe("3 settimane fa");
    expect(dueExactText("2026-12-15", today)).toBe("tra 3 settimane (15 dic 2026)");
  });
});

describe("conflict labels (AC40, DES-29)", () => {
  it("lists only the fields that differ, in Italian, with readable values", () => {
    const { partners } = makeData();
    const mine = {
      ...taskToFields(task("a", { dueDate: "2026-12-01", title: "Fiori" })),
      title: "Fiori e candele",
    };
    const theirs = taskToFields(
      task("a", { dueDate: "2026-12-15", title: "Fiori", assignee: "B" }),
    );
    const rows = diffFields(TASK_FIELD_LABELS, mine, theirs, taskFieldFormatter(partners));
    expect(rows.map((r) => [r.label, r.mine, r.theirs])).toEqual([
      ["Titolo", "Fiori e candele", "Fiori"],
      ["Scadenza", "1 dic 2026", "15 dic 2026"],
      ["Chi se ne occupa", "Entrambi", "Jessica"],
    ]);
  });
});
