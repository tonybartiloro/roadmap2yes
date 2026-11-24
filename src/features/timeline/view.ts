import type { PlainDate } from "@/lib/dates/plain-date";
import { diffDays } from "@/lib/dates/plain-date";
import type { Milestone } from "@/content/milestones/types";
import {
  diffSuggestions,
  groupTasks,
  previewDueDates,
  resolveReference,
  type PreviewResult,
  type ResolvedReference,
  type ScenarioInput,
} from "@/domain/timeline";
import { scenarioDateText, type DateScenarioItem } from "@/components/DateScenarioList";
import { applyFilters, countActiveFilters, type Filters } from "./filters";
import {
  nameOfUser,
  type LocationRow,
  type PercorsoData,
  type ScenarioRow,
  type TaskView,
} from "./model";

/** A task as displayed: `task.dueDate` is the shown date (the preview one in preview). */
export interface TaskRowView {
  readonly task: TaskView;
  /** The real date, only when the preview moves it ("12 mar → 20 ago"). */
  readonly previousDue: PlainDate | null;
}

export interface ScenarioDisplay {
  readonly optionId: string;
  readonly label: string;
  readonly kind: "fixed" | "period";
  readonly dateFrom: PlainDate;
  readonly dateText: string;
  /** "Villa Rossi" or "Villa Rossi (scartata)"; null when no location is linked. */
  readonly locationText: string | null;
  readonly isReference: boolean;
}

export interface ReferenceView {
  readonly scenario: ScenarioDisplay;
  readonly status: ResolvedReference["status"];
  readonly source: ResolvedReference["source"];
  /** Who set a manual reference ("scelto da Tony"). */
  readonly setByName: string | null;
}

export type PreviewClosedReason = "gone" | "taken";

export interface PreviewView {
  readonly scenario: ScenarioDisplay;
  readonly changedCount: number;
}

export interface PercorsoView {
  readonly reference: ReferenceView | null;
  /** Open scenarios, to pick one in the "Scenario" selector (visible with ≥ 2 and the decision open). */
  readonly pickerScenarios: readonly ScenarioDisplay[];
  readonly pickerAvailable: boolean;
  readonly preview: PreviewView | null;
  /** The URL asked for a preview that cannot be shown: the screen closes it with a notice. */
  readonly previewClosed: PreviewClosedReason | null;
  readonly decisionTaken: boolean;
  readonly groups: {
    readonly adesso: readonly TaskRowView[];
    readonly daRecuperare: readonly TaskRowView[];
    readonly prossimi3Mesi: readonly TaskRowView[];
    readonly piuAvanti: readonly TaskRowView[];
    readonly fatti: readonly TaskRowView[];
  };
  /** Generated tasks that depend on the date while there is no reference (AC15). */
  readonly hiddenCount: number;
  readonly deleted: readonly TaskView[];
  /** All the live (non deleted) tasks of the wedding, before the filters. */
  readonly totalLive: number;
  readonly shownCount: number;
  readonly activeFilters: number;
  /** "Il prossimo passo è «…», tra 6 settimane": the first future dated task (design §3.4). */
  readonly nextStep: { readonly title: string; readonly due: PlainDate } | null;
  readonly suggestions: {
    readonly additions: readonly Milestone[];
    readonly removals: readonly TaskView[];
  };
  /** The date decision was reopened (AC20). */
  readonly reopened: boolean;
  /** Open tasks flagged "Da rivedere". */
  readonly reviewCount: number;
  /** A partner changed the dates since the previous session (DES-19). */
  readonly recalculated: { readonly byName: string | null } | null;
}

const RECALC_EVENTS = new Set([
  "reference_set",
  "reference_auto",
  "option_added",
  "option_removed",
  "option_updated",
  "chosen",
  "reopened",
]);

function locationText(
  locations: readonly LocationRow[],
  locationOptionId: string | null,
): string | null {
  if (!locationOptionId) return null;
  const location = locations.find((l) => l.id === locationOptionId);
  if (!location) return null;
  return location.status === "discarded" ? `${location.title} (scartata)` : location.title;
}

function display(
  row: ScenarioRow,
  locations: readonly LocationRow[],
  referenceId: string | null,
): ScenarioDisplay {
  const item: DateScenarioItem = {
    id: row.optionId,
    label: row.label,
    kind: row.kind,
    dateFrom: row.dateFrom,
    ...(row.dateTo ? { dateTo: row.dateTo } : {}),
  };
  return {
    optionId: row.optionId,
    label: row.label,
    kind: row.kind,
    dateFrom: row.dateFrom,
    dateText: scenarioDateText(item),
    locationText: locationText(locations, row.locationOptionId),
    isReference: row.optionId === referenceId,
  };
}

function toScenarioInput(row: ScenarioRow): ScenarioInput {
  return {
    id: row.optionId,
    dateFrom: row.dateFrom,
    isPeriod: row.kind === "period",
    state: row.status === "candidate" ? "open" : row.status,
  };
}

/** Reference of the Percorso for a data snapshot: the same rule as the DB (AC24, D28). */
export function resolveDataReference(
  data: PercorsoData,
  today: PlainDate,
): ResolvedReference | null {
  return resolveReference({
    scenarios: data.scenarios.map(toScenarioInput),
    manualReferenceId: data.manualReferenceId,
    today,
  });
}

function dateOf(task: TaskView): number {
  return task.deletedAt ? Date.parse(task.deletedAt) : 0;
}

/**
 * Everything the screen shows, derived from the data, `today` (Europe/Rome calendar date), the
 * `?anteprima` id and the filters. Pure: no clock, no I/O, no writes (AC32).
 */
export function buildPercorsoView(input: {
  data: PercorsoData;
  today: PlainDate;
  previewId: string | null;
  filters: Filters;
}): PercorsoView {
  const { data, today, previewId, filters } = input;
  const decisionTaken = data.dateDecision?.status === "taken";

  const resolved = resolveDataReference(data, today);
  const referenceId = resolved?.scenarioId ?? null;
  const rowById = new Map(data.scenarios.map((s) => [s.optionId, s]));

  let reference: ReferenceView | null = null;
  if (resolved) {
    const row = rowById.get(resolved.scenarioId);
    if (row) {
      const setBy =
        resolved.source === "manual"
          ? data.events.find((e) => e.kind === "reference_set" && e.optionId === row.optionId)
          : undefined;
      reference = {
        scenario: display(row, data.locations, referenceId),
        status: resolved.status,
        source: resolved.source,
        setByName: setBy ? nameOfUser(data.partners, setBy.actorId) : null,
      };
    }
  }

  const candidates = data.scenarios.filter((s) => s.status === "candidate");
  const pickerAvailable = !decisionTaken && candidates.length >= 2;
  const pickerScenarios = candidates.map((s) => display(s, data.locations, referenceId));

  const live = data.tasks.filter((t) => !t.deleted);

  // Preview: valid only for an open scenario that is not the reference, with the decision open.
  let previewRow: ScenarioRow | undefined;
  let previewClosed: PreviewClosedReason | null = null;
  if (previewId && previewId !== referenceId) {
    if (decisionTaken) previewClosed = "taken";
    else {
      previewRow = candidates.find((s) => s.optionId === previewId);
      if (!previewRow) previewClosed = "gone";
    }
  }
  if (previewRow && !pickerAvailable) {
    previewRow = undefined;
    previewClosed = "gone";
  }

  let previewResult: PreviewResult | null = null;
  let effective: TaskView[] = live;
  const previousDue = new Map<string, PlainDate>();
  if (previewRow) {
    previewResult = previewDueDates(live, previewRow.dateFrom);
    const byId = new Map(previewResult.rows.map((r) => [r.taskId, r]));
    effective = live.map((task) => {
      const row = byId.get(task.id);
      if (!row || !row.changed) return task;
      if (task.dueDate) previousDue.set(task.id, task.dueDate);
      return { ...task, dueDate: row.preview };
    });
  }

  const filtered = applyFilters(effective, filters, { mySlot: data.mySlot, today });
  const byTaskId = new Map(filtered.map((t) => [t.id, t]));
  const grouped = groupTasks(filtered, today);
  const rows = (list: readonly { id: string }[]): TaskRowView[] =>
    list.flatMap((item) => {
      const task = byTaskId.get(item.id);
      return task ? [{ task, previousDue: previousDue.get(task.id) ?? null }] : [];
    });

  const groups = {
    adesso: rows(grouped.adesso),
    daRecuperare: rows(grouped.daRecuperare),
    prossimi3Mesi: rows(grouped.prossimi3Mesi),
    piuAvanti: rows(grouped.piuAvanti),
    fatti: rows(grouped.fatti),
  };

  const upcoming = [...grouped.prossimi3Mesi, ...grouped.piuAvanti].find((t) => t.dueDate !== null);
  const nextStep =
    upcoming && upcoming.dueDate && diffDays(today, upcoming.dueDate) >= 0
      ? { title: upcoming.title, due: upcoming.dueDate }
      : null;

  const diff =
    data.rite === null
      ? { additions: [] as Milestone[], removals: [] as TaskView[] }
      : (() => {
          const d = diffSuggestions(data.rite, data.tasks, data.dismissals);
          const byId = new Map(data.tasks.map((t) => [t.id, t]));
          return {
            additions: [...d.additions],
            removals: d.removals.flatMap((t) => {
              const task = byId.get(t.id);
              return task ? [task] : [];
            }),
          };
        })();

  const lastDecisionEvent = data.events.find((e) => e.kind === "chosen" || e.kind === "reopened");
  const reopened = !decisionTaken && lastDecisionEvent?.kind === "reopened";

  const partnerEvent = data.previousSeenAt
    ? data.events.find(
        (e) =>
          RECALC_EVENTS.has(e.kind) &&
          e.actorId !== null &&
          e.actorId !== data.userId &&
          Date.parse(e.at) > Date.parse(data.previousSeenAt as string),
      )
    : undefined;

  const hiddenIds = new Set(grouped.hidden.map((t) => t.id));

  return {
    reference,
    pickerScenarios,
    pickerAvailable,
    preview: previewRow
      ? {
          scenario: display(previewRow, data.locations, referenceId),
          changedCount: previewResult?.changedCount ?? 0,
        }
      : null,
    previewClosed,
    decisionTaken,
    groups,
    hiddenCount: hiddenIds.size,
    deleted: data.tasks.filter((t) => t.deleted).sort((a, b) => dateOf(b) - dateOf(a)),
    totalLive: live.length,
    shownCount: filtered.length - hiddenIds.size,
    activeFilters: countActiveFilters(filters),
    nextStep,
    suggestions: diff,
    reopened,
    reviewCount: live.filter((t) => t.needsReview && t.status === "todo").length,
    recalculated:
      partnerEvent && reference
        ? { byName: nameOfUser(data.partners, partnerEvent.actorId) }
        : null,
  };
}
