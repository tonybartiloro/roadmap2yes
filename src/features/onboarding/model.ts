import type { Rite } from "@/content/milestones/types";
import {
  daysInMonth,
  formatPlainDate,
  isPlainDate,
  parsePlainDate,
  type PlainDate,
} from "@/lib/dates/plain-date";

/**
 * Pure model of the onboarding (AC12-AC15, design §3.2). No Next.js, no React: the wizard, the server
 * actions, Impostazioni and the tests all share these constants and rules.
 */

/** Shown when a save fails: the draft stays on the device (AC39). */
export const SAVE_FAILED =
  "Non sono riuscito a salvare. Riprova: quello che hai scritto resta qui.";

// ---------------------------------------------------------------------------------------- steps

export const STEP_IDS = [
  "you",
  "partner",
  "rite",
  "dates",
  "guests",
  "budget",
  "style",
  "theme",
] as const;
export type StepId = (typeof STEP_IDS)[number];
export const STEP_COUNT = STEP_IDS.length;

export const STEP_TITLES: Readonly<Record<StepId, string>> = {
  you: "Iniziamo da te: come ti chiami?",
  partner: "Ora il tuo partner: prepariamo il suo accesso.",
  rite: "Che tipo di cerimonia avete in mente?",
  dates: "Quando vorresti sposarti?",
  guests: "Quanti invitati pensate di avere?",
  budget: "Quanto pensate di spendere in tutto?",
  style: "Che stile e che luogo sognate?",
  theme: "Scegli l'aspetto della tua app",
};

/** 1-based number shown as "Passo 3 di 8". */
export function stepNumber(step: StepId): number {
  return STEP_IDS.indexOf(step) + 1;
}

export function stepAt(number: number): StepId {
  return STEP_IDS[Math.min(Math.max(Math.trunc(number), 1), STEP_COUNT) - 1] as StepId;
}

/** Steps where "Non lo so ancora" is NOT valid: your own name (AC13). The email is the login. */
export const REQUIRED_STEPS: readonly StepId[] = ["you"];

// ------------------------------------------------------------------------------------- answers

export const PARTNER_MODES = ["code", "email", "later"] as const;
export type PartnerMode = (typeof PARTNER_MODES)[number];

/** A date scenario typed in the wizard; it is created by `complete_onboarding` at the end. */
export interface ScenarioDraft {
  /** Client-side key only (never sent to the database). */
  readonly id: string;
  readonly kind: "fixed" | "period";
  /** The date, or the first day of the period. */
  readonly dateFrom: PlainDate;
  /** Last day of a period. */
  readonly dateTo: PlainDate | null;
  readonly label: string | null;
}

/** What the wizard keeps in `weddings.onboarding_answers` (everything the wedding row has no column for). */
export interface OnboardingAnswers {
  /** Last step the couple confirmed (0 = none yet); the wizard resumes at `lastStep + 1`. */
  readonly lastStep: number;
  readonly partnerMode: PartnerMode | null;
  /** "Invia l'invito alla fine" (only for the email mode). */
  readonly inviteAtEnd: boolean;
  readonly scenarios: readonly ScenarioDraft[];
  readonly budgetCents: number | null;
}

export const EMPTY_ANSWERS: OnboardingAnswers = {
  lastStep: 0,
  partnerMode: null,
  inviteAtEnd: true,
  scenarios: [],
  budgetCents: null,
};

export const MAX_SCENARIOS = 10;
export const MAX_BUDGET_CENTS = 100_000_000_000;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Scenario as stored/typed; `null` when it is not a valid one (drops garbage instead of failing). */
export function parseScenario(raw: unknown): ScenarioDraft | null {
  if (!isObject(raw)) return null;
  const { id, kind, dateFrom, dateTo, label } = raw;
  if (typeof id !== "string" || id === "" || id.length > 60) return null;
  if (kind !== "fixed" && kind !== "period") return null;
  if (!inDatabaseRange(dateFrom)) return null;
  const cleanLabel = typeof label === "string" && label.trim() !== "" ? label.trim() : null;
  if (cleanLabel !== null && cleanLabel.length > 120) return null;
  if (kind === "fixed") {
    return { id, kind, dateFrom, dateTo: null, label: cleanLabel };
  }
  if (!inDatabaseRange(dateTo) || dateTo < dateFrom) return null;
  return { id, kind, dateFrom, dateTo, label: cleanLabel };
}

/** `date_scenarios` only accepts 2000-01-01 .. 2100-12-31 (check constraint). */
function inDatabaseRange(value: unknown): value is PlainDate {
  return isPlainDate(value) && value >= "2000-01-01" && value <= "2100-12-31";
}

/** Tolerant reader of `weddings.onboarding_answers` (a bad value yields the empty answers). */
export function parseAnswers(raw: unknown): OnboardingAnswers {
  if (!isObject(raw)) return EMPTY_ANSWERS;
  const lastStep =
    typeof raw["lastStep"] === "number" && Number.isInteger(raw["lastStep"])
      ? Math.min(Math.max(raw["lastStep"], 0), STEP_COUNT)
      : 0;
  const partnerMode = PARTNER_MODES.find((mode) => mode === raw["partnerMode"]) ?? null;
  const scenarios = Array.isArray(raw["scenarios"])
    ? raw["scenarios"]
        .map(parseScenario)
        .filter((item): item is ScenarioDraft => item !== null)
        .slice(0, MAX_SCENARIOS)
    : [];
  const budget = raw["budgetCents"];
  const budgetCents =
    typeof budget === "number" &&
    Number.isInteger(budget) &&
    budget >= 0 &&
    budget <= MAX_BUDGET_CENTS
      ? budget
      : null;
  return {
    lastStep,
    partnerMode,
    inviteAtEnd: raw["inviteAtEnd"] !== false,
    scenarios,
    budgetCents,
  };
}

/** The step to show on opening or resuming: the one after the last confirmed one. */
export function resumeStep(answers: OnboardingAnswers): StepId {
  return stepAt(answers.lastStep + 1);
}

/** Moves the "last confirmed" marker forward only (going back and re-confirming never rewinds). */
export function advanceLastStep(answers: OnboardingAnswers, step: StepId): number {
  return Math.max(answers.lastStep, stepNumber(step));
}

/** `weddings.onboarding_unknown`: the steps the couple skipped with "Non lo so ancora". */
export function withUnknown(current: readonly string[], step: StepId, unknown: boolean): string[] {
  const rest = current.filter((id) => id !== step);
  return unknown ? [...rest, step] : rest;
}

export function parseUnknown(raw: unknown): StepId[] {
  if (!Array.isArray(raw)) return [];
  return STEP_IDS.filter((id) => raw.includes(id));
}

// ------------------------------------------------------------------------------------- options

export const RITE_OPTIONS: ReadonlyArray<{ value: Rite; label: string; hint?: string }> = [
  { value: "civile", label: "Civile" },
  { value: "religioso", label: "Religioso cattolico con effetti civili" },
  { value: "simbolico", label: "Simbolico" },
  { value: "unknown", label: "Non lo so ancora" },
];

export const RITE_LABELS: Readonly<Record<Rite, string>> = {
  civile: "Civile",
  religioso: "Religioso cattolico con effetti civili",
  simbolico: "Simbolico",
  unknown: "Non lo so ancora",
};

export const RITE_NOTE = "Cambia le tappe che ti proponiamo.";

export const GUEST_BANDS = ["up_to_50", "50_80", "80_120", "over_120", "unknown"] as const;
export type GuestBand = (typeof GUEST_BANDS)[number];

export const GUEST_BAND_LABELS: Readonly<Record<GuestBand, string>> = {
  up_to_50: "Fino a 50",
  "50_80": "Da 50 a 80",
  "80_120": "Da 80 a 120",
  over_120: "Oltre 120",
  unknown: "Non lo so ancora",
};

export function isGuestBand(value: unknown): value is GuestBand {
  return typeof value === "string" && (GUEST_BANDS as readonly string[]).includes(value);
}

export const REGIONS = [
  "Abruzzo",
  "Basilicata",
  "Calabria",
  "Campania",
  "Emilia-Romagna",
  "Friuli-Venezia Giulia",
  "Lazio",
  "Liguria",
  "Lombardia",
  "Marche",
  "Molise",
  "Piemonte",
  "Puglia",
  "Sardegna",
  "Sicilia",
  "Toscana",
  "Trentino-Alto Adige",
  "Umbria",
  "Valle d'Aosta",
  "Veneto",
] as const;

// -------------------------------------------------------------------------------- partner labels

/** The label of a partner as the choice the form shows ("sposo" / "sposa" / free text / none). */
export type LabelChoice = "sposo" | "sposa" | "custom" | "none";

export function labelChoiceOf(label: string | null | undefined): LabelChoice {
  const value = (label ?? "").trim();
  if (value === "") return "none";
  return value === "sposo" || value === "sposa" ? value : "custom";
}

/** Text stored for a choice (`custom` stores what was typed; an empty custom text means no label). */
export function labelFromChoice(choice: LabelChoice, custom: string): string | null {
  if (choice === "sposo" || choice === "sposa") return choice;
  if (choice === "custom") return custom.trim() === "" ? null : custom.trim();
  return null;
}

// ------------------------------------------------------------------------------------ scenarios

/** The first scenario comes prefilled (AC12); `softMin` of the date field is the same day. */
export const DEFAULT_SCENARIO_DATE: PlainDate = "2027-09-03";
export const SOFT_MIN_MESSAGE = "È prima della data che desideravate: ricontrolla con la location.";

export function newScenarioId(): string {
  return `s-${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
}

export function defaultScenario(): ScenarioDraft {
  return {
    id: newScenarioId(),
    kind: "fixed",
    dateFrom: DEFAULT_SCENARIO_DATE,
    dateTo: null,
    label: null,
  };
}

/** A period from month/year to month/year: first day of the first month to the last day of the last. */
export function periodBounds(
  from: { year: number; month: number },
  to: { year: number; month: number },
): { dateFrom: PlainDate; dateTo: PlainDate } {
  return {
    dateFrom: formatPlainDate({ year: from.year, month: from.month, day: 1 }),
    dateTo: formatPlainDate({
      year: to.year,
      month: to.month,
      day: daysInMonth(to.year, to.month),
    }),
  };
}

export function monthYearOf(date: PlainDate): { year: number; month: number } {
  const { year, month } = parsePlainDate(date);
  return { year, month };
}

/** Why a scenario cannot be saved yet (inline text), or `null` when it is fine. */
export function scenarioProblem(scenario: ScenarioDraft): string | null {
  if (!isPlainDate(scenario.dateFrom)) return "Scegli la data.";
  if (scenario.kind === "period") {
    if (!scenario.dateTo || !isPlainDate(scenario.dateTo)) return "Scegli fino a quando.";
    if (scenario.dateTo < scenario.dateFrom) return "La fine del periodo è prima dell'inizio.";
  }
  return null;
}

/** Element of the `complete_onboarding(p_scenarios)` payload. */
export function toRpcScenario(scenario: ScenarioDraft): Record<string, string> {
  return {
    kind: scenario.kind,
    date_from: scenario.dateFrom,
    ...(scenario.kind === "period" && scenario.dateTo ? { date_to: scenario.dateTo } : {}),
    ...(scenario.label ? { label: scenario.label } : {}),
  };
}

// --------------------------------------------------------------------------------- date helpers

/** Years offered by the period selects: this year to five years ahead. */
export function periodYearRange(today: PlainDate): { minYear: number; maxYear: number } {
  const { year } = parsePlainDate(today);
  return { minYear: year, maxYear: year + 5 };
}
