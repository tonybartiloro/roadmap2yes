import type { PercorsoData, ScenarioRow, TaskView } from "./model";

/** Test builders (not imported by the app). Fixed names: Tony = slot A (me), Jessica = slot B. */
export const ME = "00000000-0000-4000-8000-00000000000a";
export const PARTNER = "00000000-0000-4000-8000-00000000000b";

export function task(id: string, overrides: Partial<TaskView> = {}): TaskView {
  return {
    id,
    title: id,
    status: "todo",
    dueDate: null,
    dueOverridden: false,
    source: "user",
    templateKey: null,
    templateVersion: null,
    category: null,
    deleted: false,
    notes: null,
    advice: null,
    assignee: "both",
    remindersEnabled: true,
    needsReview: false,
    version: 1,
    updatedAt: "2026-11-20T10:00:00Z",
    updatedBy: null,
    deletedAt: null,
    completedAt: null,
    ...overrides,
  };
}

export function templateTask(key: string, overrides: Partial<TaskView> = {}): TaskView {
  return task(`t-${key}`, {
    source: "template",
    templateKey: key,
    templateVersion: 1,
    title: key,
    ...overrides,
  });
}

export function scenario(
  id: string,
  dateFrom: string,
  overrides: Partial<ScenarioRow> = {},
): ScenarioRow {
  return {
    optionId: id,
    label: "",
    kind: "fixed",
    dateFrom,
    dateTo: null,
    locationOptionId: null,
    status: "candidate",
    ...overrides,
  };
}

export function makeData(overrides: Partial<PercorsoData> = {}): PercorsoData {
  return {
    weddingId: "w-1",
    userId: ME,
    mySlot: "A",
    rite: "civile",
    manualReferenceId: null,
    partners: [
      { slot: "A", name: "Tony", userId: ME },
      { slot: "B", name: "Jessica", userId: PARTNER },
    ],
    dateDecision: { id: "d-date", status: "open" },
    scenarios: [],
    locations: [],
    tasks: [],
    dismissals: [],
    events: [],
    previousSeenAt: null,
    ...overrides,
  };
}
