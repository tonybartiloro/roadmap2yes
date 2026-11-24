import type { PlainDate } from "@/lib/dates/plain-date";

/**
 * View models of the Scelte screens (T12). Everything here is plain JSON (no `Date`, no class),
 * so the server components can hand it to the client components as props.
 */

export type DecisionStatus = "open" | "taken";
export type OptionStatus = "candidate" | "chosen" | "discarded";
export type ReactionKind = "prefer" | "doubt";

/** "Aperta" / "Presa" / "Da rivedere" (open again after having been taken). */
export type DecisionState = "open" | "taken" | "review";

export interface ScenarioView {
  id: string;
  kind: "fixed" | "period";
  dateFrom: PlainDate;
  dateTo: PlainDate | null;
  locationOptionId: string | null;
  locationName: string | null;
  version: number;
}

export interface ReactionView {
  userId: string;
  name: string;
  reaction: ReactionKind;
  mine: boolean;
}

export interface OptionView {
  id: string;
  title: string;
  comune: string | null;
  link: string | null;
  notes: string | null;
  pros: string[];
  cons: string[];
  costCents: number | null;
  status: OptionStatus;
  version: number;
  /** Only for `date` decisions. */
  scenario: ScenarioView | null;
  reactions: ReactionView[];
}

export type DecisionEventKind =
  | "option_added"
  | "option_updated"
  | "option_removed"
  | "chosen"
  | "reopened"
  | "note"
  | "reference_set"
  | "reference_auto";

export interface EventView {
  id: number;
  kind: DecisionEventKind;
  at: string;
  /** Already resolved with `displayName`; "Il sistema" for automatic events. */
  actorName: string;
  optionId: string | null;
  optionTitle: string | null;
  reason: string | null;
  payload: Record<string, unknown>;
}

export interface ReferenceView {
  optionId: string;
  date: PlainDate;
  isPeriod: boolean;
  status: "provisional" | "definitive";
  source: "chosen" | "manual" | "automatic";
  /** Who set it by hand (only for a manual reference set through "Imposta come riferimento"). */
  setByName: string | null;
}

export interface LocationChoice {
  id: string;
  title: string;
}

export interface DecisionDetailView {
  id: string;
  weddingId: string;
  key: string;
  type: string;
  question: string;
  status: DecisionStatus;
  state: DecisionState;
  version: number;
  chosenOptionId: string | null;
  chosenAt: string | null;
  chosenByName: string | null;
  /** Not deleted, candidates first. */
  options: OptionView[];
  events: EventView[];
  /** Date decision only. */
  reference: ReferenceView | null;
  manualReferenceId: string | null;
  /** Scenario option id to "{N} scadenze cambiano" if it became the reference. */
  changedCounts: Record<string, number>;
  /** Candidate locations a date can be linked to (AC60). */
  locationChoices: LocationChoice[];
  partnerName: string;
  meName: string;
}

export interface DecisionListItem {
  id: string;
  key: string;
  type: string;
  question: string;
  state: DecisionState;
  optionCount: number;
  /** Title of the chosen option, or the chosen date. */
  chosenText: string | null;
}

export type ActionFailure = { ok: false; code: string; message: string };
export type ActionResult<T = undefined> = { ok: true; data: T } | ActionFailure;

/** A write of a versioned row that met a newer version (AC40). */
export interface ConflictInfo {
  /** Current row of the other partner, as stored. */
  current: Record<string, unknown> | null;
  changedByName: string | null;
  changedAt: string | null;
}
export type VersionedResult =
  | { ok: true; data: { version: number } }
  | ActionFailure
  | { ok: false; code: "conflict"; message: string; conflict: ConflictInfo };

/** Values of the add/edit option form, already parsed. */
export interface OptionInput {
  title: string;
  comune: string | null;
  link: string | null;
  notes: string | null;
  pros: string[];
  cons: string[];
  costCents: number | null;
}

export interface ScenarioInput {
  kind: "fixed" | "period";
  dateFrom: PlainDate;
  dateTo: PlainDate | null;
  locationOptionId: string | null;
}
