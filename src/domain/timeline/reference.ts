import { comparePlainDates, type PlainDate } from "@/lib/dates/plain-date";

/** A date scenario, as far as the reference rule is concerned (AC24, D28). Deleted ones are not passed. */
export interface ScenarioInput {
  readonly id: string;
  /** Fixed date or first day of a period (a period uses its first day, D19). */
  readonly dateFrom: PlainDate;
  readonly isPeriod?: boolean;
  /** `chosen` = the date decision picked it; `open` = still a candidate; `discarded` = not chosen. */
  readonly state: "open" | "chosen" | "discarded";
}

export interface ReferenceInput {
  readonly scenarios: readonly ScenarioInput[];
  /** `weddings.manual_reference_option_id`, or null for the automatic reference. */
  readonly manualReferenceId?: string | null;
}

export type ReferenceSource = "chosen" | "manual" | "automatic";

export interface ResolvedReference {
  readonly scenarioId: string;
  readonly date: PlainDate;
  readonly isPeriod: boolean;
  /** "definitivo" only when the decision is taken (the chosen scenario). */
  readonly status: "definitive" | "provisional";
  readonly source: ReferenceSource;
}

function build(s: ScenarioInput, source: ReferenceSource): ResolvedReference {
  return {
    scenarioId: s.id,
    date: s.dateFrom,
    isPeriod: s.isPeriod ?? false,
    status: source === "chosen" ? "definitive" : "provisional",
    source,
  };
}

/**
 * Single reference scenario (AC24, D28):
 * 1. decision taken → the chosen scenario, "definitive";
 * 2. else the manual reference, if it is still an open scenario → "provisional" (manual);
 * 3. else the open scenario with the nearest (earliest) `dateFrom` → "provisional" (automatic);
 * 4. no scenarios → null.
 * A reopened decision no longer has a chosen scenario: the previous one is kept by the DB as
 * `manualReferenceId`, so it stays the reference but provisional.
 */
export function resolveReference(input: ReferenceInput): ResolvedReference | null {
  const { scenarios, manualReferenceId = null } = input;
  const chosen = scenarios.find((s) => s.state === "chosen");
  if (chosen) return build(chosen, "chosen");

  const open = scenarios.filter((s) => s.state === "open");
  const manual = manualReferenceId ? open.find((s) => s.id === manualReferenceId) : undefined;
  if (manual) return build(manual, "manual");

  const nearest = [...open].sort(
    (a, b) => comparePlainDates(a.dateFrom, b.dateFrom) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  )[0];
  return nearest ? build(nearest, "automatic") : null;
}
