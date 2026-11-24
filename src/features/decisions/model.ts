import { formatDayMonth, formatLongDate, formatShortDate } from "@/components/format";
import { scenarioDateText, type DateScenarioItem } from "@/components/DateScenarioList";
import { resolveReference, previewDueDates, type TimelineTask } from "@/domain/timeline";
import { displayName } from "@/lib/display-name";
import {
  daysInMonth,
  formatPlainDate,
  isPlainDate,
  ROME_TIME_ZONE,
  type PlainDate,
} from "@/lib/dates/plain-date";
import { formatEuro, parseEuroToCents } from "@/lib/money";
import type { Tables } from "@/lib/supabase/database.types";
import { EVENT_FIELD_LABELS } from "./field-labels";
import type {
  DecisionDetailView,
  DecisionEventKind,
  DecisionListItem,
  DecisionState,
  EventView,
  OptionInput,
  OptionStatus,
  OptionView,
  ReactionKind,
  ReferenceView,
  ScenarioInput,
  ScenarioView,
} from "./types";

/** Date the couple wished for (BR3): earlier dates only get a non-blocking notice. */
export const DESIRED_DATE: PlainDate = "2027-09-03";
export const EARLIER_THAN_DESIRED =
  "È prima della data che desideravate: ricontrolla con la location.";

export const SYSTEM_ACTOR = "Il sistema";

/** Limits of the RPCs (`reopen_decision`, `add_decision_note`), shared by forms and zod. */
export const REASON_MAX = 500;
export const NOTE_MAX = 1000;

// ---------------------------------------------------------------------------------------------
// Database error codes (T8 contracts) to Italian messages
// ---------------------------------------------------------------------------------------------

const ERROR_MESSAGES: Readonly<Record<string, string>> = {
  version_conflict:
    "{partner} ha cambiato questa scelta mentre la guardavi. Ho ricaricato la pagina.",
  already_taken: "Questa scelta è già stata presa.",
  invalid_option: "Questa opzione non è più disponibile.",
  exact_date_required: "Indica il giorno esatto dentro il periodo.",
  exact_date_out_of_period: "Il giorno deve cadere dentro il periodo.",
  exact_date_not_applicable: "Questa scelta non ha bisogno di un giorno esatto.",
  scenario_missing: "Questa data non è completa: modificala e riprova.",
  reason_required: "Scrivi il motivo: serve a ricordare perché l'avete riaperta.",
  reason_too_long: "Il motivo è troppo lungo (massimo 500 caratteri).",
  not_taken: "Questa scelta è già aperta.",
  note_required: "Scrivi qualcosa nella nota.",
  note_too_long: "La nota è troppo lunga (massimo 1000 caratteri).",
  decision_taken: "La scelta è presa: per cambiare le date o aggiungere opzioni riaprila prima.",
  option_chosen: "Non puoi togliere l'opzione scelta: riapri prima la scelta.",
  invalid_location: "Puoi collegare solo una location candidata.",
  location_deleted: "Questa location non c'è più: scegline un'altra.",
  not_a_date_option: "Questa opzione non è una data.",
  no_date_decision: "La scelta della data non esiste ancora.",
  forbidden: "Non hai il permesso di farlo.",
};

export const GENERIC_ERROR = "Non sono riuscito a salvare. Riprova tra un attimo.";

/** `{ code, message }` of a Supabase/PostgREST error: our business codes arrive as the message. */
export function mapDbError(
  error: { code?: string; message?: string } | null | undefined,
  partnerName = "Il tuo partner",
): { code: string; message: string } {
  if (!error) return { code: "unknown", message: GENERIC_ERROR };
  if (error.code === "42501") return { code: "forbidden", message: ERROR_MESSAGES["forbidden"]! };
  const code = (error.message ?? "").trim();
  const text = ERROR_MESSAGES[code];
  if (text) return { code, message: text.replace("{partner}", partnerName) };
  return { code: "unknown", message: GENERIC_ERROR };
}

// ---------------------------------------------------------------------------------------------
// Forms
// ---------------------------------------------------------------------------------------------

/** One entry per non-empty line, trimmed. */
export function parseLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

export interface OptionFormValues {
  title: string;
  comune: string;
  link: string;
  notes: string;
  prosText: string;
  consText: string;
  costText: string;
}

export const EMPTY_OPTION_FORM: OptionFormValues = {
  title: "",
  comune: "",
  link: "",
  notes: "",
  prosText: "",
  consText: "",
  costText: "",
};

export type OptionFormField = keyof OptionFormValues;
export type FormErrors<K extends string> = Partial<Record<K, string>>;

const LINK_RE = /^https?:\/\/[^\s]+$/i;

function blankToNull(text: string): string | null {
  const trimmed = text.trim();
  return trimmed === "" ? null : trimmed;
}

/** Mirrors the table checks so the user sees the problem before the round trip. */
export function parseOptionForm(
  values: OptionFormValues,
  titleRequired = true,
): { ok: true; input: OptionInput } | { ok: false; errors: FormErrors<OptionFormField> } {
  const errors: FormErrors<OptionFormField> = {};
  const title = values.title.trim();
  if (titleRequired && title === "") errors.title = "Scrivi un nome.";
  else if (title.length > 120) errors.title = "Il nome è troppo lungo (massimo 120 caratteri).";

  const comune = blankToNull(values.comune);
  if (comune && comune.length > 80)
    errors.comune = "Il comune è troppo lungo (massimo 80 caratteri).";

  const link = blankToNull(values.link);
  if (link && (!LINK_RE.test(link) || link.length > 600)) {
    errors.link = "Inserisci un indirizzo che inizia con https:// (massimo 600 caratteri).";
  }

  const notes = blankToNull(values.notes);
  if (notes && notes.length > 2000)
    errors.notes = "Le note sono troppo lunghe (massimo 2000 caratteri).";

  const pros = parseLines(values.prosText);
  if (pros.length > 20 || pros.join(" ").length > 2000) {
    errors.prosText = "Troppi pro: al massimo 20 righe.";
  }
  const cons = parseLines(values.consText);
  if (cons.length > 20 || cons.join(" ").length > 2000) {
    errors.consText = "Troppi contro: al massimo 20 righe.";
  }

  let costCents: number | null = null;
  if (values.costText.trim() !== "") {
    const parsed = parseEuroToCents(values.costText);
    if (parsed.ok) costCents = parsed.cents;
    else errors.costText = parsed.message;
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, input: { title, comune, link, notes, pros, cons, costCents } };
}

export function optionToFormValues(option: OptionView): OptionFormValues {
  return {
    title: option.title,
    comune: option.comune ?? "",
    link: option.link ?? "",
    notes: option.notes ?? "",
    prosText: option.pros.join("\n"),
    consText: option.cons.join("\n"),
    costText:
      option.costCents === null
        ? ""
        : (option.costCents / 100).toLocaleString("it-IT", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
            useGrouping: false,
          }),
  };
}

export interface MonthYearValue {
  year: number;
  month: number;
}

export interface ScenarioFormValues {
  kind: "fixed" | "period";
  /** `YYYY-MM-DD` or "" (fixed date). */
  date: PlainDate | "";
  from: MonthYearValue | null;
  to: MonthYearValue | null;
  /** Linked location option id, or "" for none. */
  locationId: string;
}

export function firstOfMonth({ year, month }: MonthYearValue): PlainDate {
  return formatPlainDate({ year, month, day: 1 });
}

export function lastOfMonth({ year, month }: MonthYearValue): PlainDate {
  return formatPlainDate({ year, month, day: daysInMonth(year, month) });
}

export function parseScenarioForm(
  values: ScenarioFormValues,
): { ok: true; input: ScenarioInput } | { ok: false; errors: FormErrors<"date" | "period"> } {
  const locationOptionId = values.locationId === "" ? null : values.locationId;
  if (values.kind === "fixed") {
    if (values.date === "" || !isPlainDate(values.date)) {
      return { ok: false, errors: { date: "Scegli una data." } };
    }
    return {
      ok: true,
      input: { kind: "fixed", dateFrom: values.date, dateTo: null, locationOptionId },
    };
  }
  if (!values.from || !values.to) {
    return { ok: false, errors: { period: "Scegli il mese di inizio e quello di fine." } };
  }
  const dateFrom = firstOfMonth(values.from);
  const dateTo = lastOfMonth(values.to);
  if (dateTo < dateFrom) {
    return {
      ok: false,
      errors: { period: "La fine del periodo non può essere prima dell'inizio." },
    };
  }
  return { ok: true, input: { kind: "period", dateFrom, dateTo, locationOptionId } };
}

/** "14 maggio 2028" or "maggio–giugno 2028" for the label of a date option left blank. */
export function defaultScenarioTitle(input: ScenarioInput): string {
  if (input.kind === "fixed") return formatLongDate(input.dateFrom);
  return scenarioDateText({
    id: "x",
    label: "",
    kind: "period",
    dateFrom: input.dateFrom,
    dateTo: input.dateTo ?? input.dateFrom,
  }).split(" · ")[0]!;
}

export function scenarioToFormValues(scenario: ScenarioView): ScenarioFormValues {
  const ymd = (date: PlainDate): MonthYearValue => ({
    year: Number(date.slice(0, 4)),
    month: Number(date.slice(5, 7)),
  });
  return {
    kind: scenario.kind,
    date: scenario.kind === "fixed" ? scenario.dateFrom : "",
    from: scenario.kind === "period" ? ymd(scenario.dateFrom) : null,
    to: scenario.kind === "period" ? ymd(scenario.dateTo ?? scenario.dateFrom) : null,
    locationId: scenario.locationOptionId ?? "",
  };
}

/** Soft warning (never blocking) when the first day is before the wished date (BR3). */
export function earlierThanDesired(dateFrom: PlainDate | "" | null): boolean {
  return Boolean(dateFrom && isPlainDate(dateFrom) && dateFrom < DESIRED_DATE);
}

// ---------------------------------------------------------------------------------------------
// History
// ---------------------------------------------------------------------------------------------

const TIME_FORMAT = new Intl.DateTimeFormat("it-IT", {
  timeZone: ROME_TIME_ZONE,
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  year: "numeric",
});

/** "24 nov 2026, 14:30" in Europe/Rome. */
export function formatEventTime(at: string): string {
  const date = new Date(at);
  if (Number.isNaN(date.getTime())) return "";
  return TIME_FORMAT.format(date).replace(/\./g, "");
}

function str(value: unknown): string | null {
  return typeof value === "string" && value !== "" ? value : null;
}

function plainDate(value: unknown): PlainDate | null {
  return isPlainDate(value) ? value : null;
}

export interface EventText {
  text: string;
  /** Free text written by a person (reason of a reopening, note) shown under the line. */
  quote: string | null;
  /** Secondary line (e.g. the period kept when an exact day was chosen). */
  detail: string | null;
}

/** Words for the history line (design §3.5, §3.8). */
export function describeEvent(event: EventView): EventText {
  const who = event.actorName;
  const title = event.optionTitle ?? str(event.payload["title"]);
  const quoted = title ? `«${title}»` : "un'opzione";
  switch (event.kind) {
    case "option_added":
      return {
        text:
          event.payload["restored"] === true
            ? `${who} ha rimesso ${quoted} tra le opzioni`
            : `${who} ha aggiunto ${quoted}`,
        quote: null,
        detail: null,
      };
    case "option_updated": {
      const fields = Array.isArray(event.payload["fields"])
        ? (event.payload["fields"] as unknown[])
            .map((field) => EVENT_FIELD_LABELS[String(field)] ?? null)
            .filter((label): label is string => label !== null)
        : [];
      return {
        text: `${who} ha modificato ${quoted}`,
        quote: null,
        detail: fields.length > 0 ? `Cambiato: ${fields.join(", ")}` : null,
      };
    }
    case "option_removed":
      return { text: `${who} ha tolto ${quoted}`, quote: null, detail: null };
    case "chosen": {
      const period = event.payload["period"];
      const exact = plainDate(event.payload["exact_date"]);
      let detail: string | null = null;
      if (exact && period && typeof period === "object") {
        const from = plainDate((period as Record<string, unknown>)["date_from"]);
        const to = plainDate((period as Record<string, unknown>)["date_to"]);
        if (from && to) {
          const text = scenarioDateText({
            id: "x",
            label: "",
            kind: "period",
            dateFrom: from,
            dateTo: to,
          }).split(" · ")[0];
          detail = `Giorno scelto: ${formatShortDate(exact)}, dentro il periodo ${text}`;
        }
      }
      return { text: `${who} ha scelto ${quoted}`, quote: null, detail };
    }
    case "reopened":
      return {
        text: `${who} ha riaperto la scelta`,
        quote: event.reason,
        detail: title ? `Prima era scelta ${quoted}` : null,
      };
    case "note":
      return {
        text: title ? `${who} ha scritto una nota su ${quoted}` : `${who} ha scritto una nota`,
        quote: event.reason,
        detail: null,
      };
    case "reference_set": {
      const date = plainDate(event.payload["reference_date"]);
      if (event.payload["kind"] === "period" && date) {
        return {
          text: `${who} ha impostato ${quoted} come riferimento provvisorio`,
          quote: null,
          detail: `Scadenze calcolate dal ${formatDayMonth(date)}`,
        };
      }
      return {
        text: date
          ? `${who} ha impostato il ${formatShortDate(date)} come riferimento provvisorio`
          : `${who} ha impostato ${quoted} come riferimento provvisorio`,
        quote: null,
        detail: null,
      };
    }
    case "reference_auto":
      return { text: `${who} è tornato al riferimento automatico`, quote: null, detail: null };
  }
}

// ---------------------------------------------------------------------------------------------
// Building the view models from table rows (pure: the loaders only fetch)
// ---------------------------------------------------------------------------------------------

export interface PartnerRow {
  user_id: string | null;
  first_name: string | null;
  last_name: string | null;
  label: string | null;
  slot: string;
}

function personName(partner: PartnerRow | undefined, fallback?: string): string {
  return displayName(
    partner
      ? { firstName: partner.first_name, lastName: partner.last_name, label: partner.label }
      : null,
    fallback,
  );
}

export interface NameBook {
  /** Name of a user id; `fallback` when the id is unknown (e.g. system). */
  nameOf(userId: string | null | undefined, fallback?: string): string;
  me: string;
  partner: string;
}

export function nameBook(partners: readonly PartnerRow[], meUserId: string): NameBook {
  const byUser = new Map(partners.filter((p) => p.user_id).map((p) => [p.user_id as string, p]));
  const other = partners.find((p) => p.user_id !== meUserId);
  return {
    nameOf: (userId, fallback) => {
      if (!userId) return fallback ?? SYSTEM_ACTOR;
      const partner = byUser.get(userId);
      return partner ? personName(partner) : (fallback ?? "Il tuo partner");
    },
    me: personName(byUser.get(meUserId), "Tu"),
    partner: personName(other),
  };
}

const KINDS: readonly DecisionEventKind[] = [
  "option_added",
  "option_updated",
  "option_removed",
  "chosen",
  "reopened",
  "note",
  "reference_set",
  "reference_auto",
];

function asPayload(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

/** "Da rivedere": open again after having been taken (the last status event is a reopening). */
export function decisionState(
  status: string,
  events: readonly Pick<Tables<"decision_events">, "kind" | "id">[],
): DecisionState {
  if (status === "taken") return "taken";
  const last = [...events]
    .filter((event) => event.kind === "chosen" || event.kind === "reopened")
    .sort((a, b) => a.id - b.id)
    .at(-1);
  return last?.kind === "reopened" ? "review" : "open";
}

export interface RawDecisionDetail {
  decision: Tables<"decisions">;
  options: readonly Tables<"decision_options">[];
  scenarios: readonly Tables<"date_scenarios">[];
  reactions: readonly Tables<"option_reactions">[];
  events: readonly Tables<"decision_events">[];
  partners: readonly PartnerRow[];
  manualReferenceId: string | null;
  /** Options of the `location` decision (to link dates and show their names). */
  locationOptions: readonly Pick<
    Tables<"decision_options">,
    "id" | "title" | "status" | "deleted_at"
  >[];
  tasks: readonly TimelineTask[];
  meUserId: string;
  today: PlainDate;
}

const STATUS_ORDER: Record<OptionStatus, number> = { chosen: 0, candidate: 1, discarded: 2 };

function optionStatus(value: string): OptionStatus {
  return value === "chosen" || value === "discarded" ? value : "candidate";
}

export function buildDetailView(raw: RawDecisionDetail): DecisionDetailView {
  const { decision } = raw;
  const names = nameBook(raw.partners, raw.meUserId);
  const locationName = new Map(
    raw.locationOptions.filter((o) => !o.deleted_at).map((o) => [o.id, o.title]),
  );
  const scenarioByOption = new Map(raw.scenarios.map((s) => [s.option_id, s]));
  // A date option without its scenario is a leftover of a failed creation: never counted.
  const live = raw.options.filter(
    (o) => !o.deleted_at && (decision.type !== "date" || scenarioByOption.has(o.id)),
  );

  const options: OptionView[] = live
    .map((row): OptionView => {
      const scenario = scenarioByOption.get(row.id);
      return {
        id: row.id,
        title: row.title,
        comune: row.comune,
        link: row.link,
        notes: row.notes,
        pros: row.pros,
        cons: row.cons,
        costCents: row.cost_cents,
        status: optionStatus(row.status),
        version: row.version,
        scenario: scenario
          ? {
              id: scenario.id,
              kind: scenario.kind === "period" ? "period" : "fixed",
              dateFrom: scenario.date_from,
              dateTo: scenario.date_to,
              locationOptionId: scenario.location_option_id,
              locationName: scenario.location_option_id
                ? (locationName.get(scenario.location_option_id) ?? null)
                : null,
              version: scenario.version,
            }
          : null,
        reactions: raw.reactions
          .filter(
            (r) => r.option_id === row.id && (r.reaction === "prefer" || r.reaction === "doubt"),
          )
          .map((r) => ({
            userId: r.user_id,
            name: r.user_id === raw.meUserId ? names.me : names.nameOf(r.user_id),
            reaction: r.reaction as ReactionKind,
            mine: r.user_id === raw.meUserId,
          })),
      };
    })
    .sort(
      (a, b) =>
        STATUS_ORDER[a.status] - STATUS_ORDER[b.status] ||
        // Stable: creation order inside the same status.
        live.findIndex((o) => o.id === a.id) - live.findIndex((o) => o.id === b.id),
    );

  const titleById = new Map(raw.options.map((o) => [o.id, o.title]));
  const events: EventView[] = [...raw.events]
    .sort((a, b) => a.at.localeCompare(b.at) || a.id - b.id)
    .map((event) => ({
      id: event.id,
      kind: (KINDS as readonly string[]).includes(event.kind)
        ? (event.kind as DecisionEventKind)
        : "note",
      at: event.at,
      actorName: names.nameOf(event.actor_id),
      optionId: event.option_id,
      optionTitle: event.option_id ? (titleById.get(event.option_id) ?? null) : null,
      reason: event.reason,
      payload: asPayload(event.payload),
    }));

  let reference: ReferenceView | null = null;
  const changedCounts: Record<string, number> = {};
  if (decision.type === "date") {
    const resolved = resolveReference({
      scenarios: options.flatMap((o) =>
        o.scenario
          ? [
              {
                id: o.id,
                dateFrom: o.scenario.dateFrom,
                isPeriod: o.scenario.kind === "period",
                state: (o.status === "candidate"
                  ? "open"
                  : o.status === "chosen"
                    ? "chosen"
                    : "discarded") as "open" | "chosen" | "discarded",
              },
            ]
          : [],
      ),
      manualReferenceId: raw.manualReferenceId,
      today: raw.today,
    });
    if (resolved) {
      reference = {
        optionId: resolved.scenarioId,
        date: resolved.date,
        isPeriod: resolved.isPeriod,
        status: resolved.status,
        source: resolved.source,
        setByName: resolved.source === "manual" ? manualSetBy(events, resolved.scenarioId) : null,
      };
    }
    if (decision.status === "open") {
      for (const option of options) {
        if (option.status === "candidate" && option.scenario) {
          changedCounts[option.id] = previewDueDates(
            raw.tasks,
            option.scenario.dateFrom,
          ).changedCount;
        }
      }
    }
  }

  return {
    id: decision.id,
    weddingId: decision.wedding_id,
    key: decision.key,
    type: decision.type,
    question: decision.question,
    status: decision.status === "taken" ? "taken" : "open",
    state: decisionState(decision.status, raw.events),
    version: decision.version,
    chosenOptionId: decision.chosen_option_id,
    chosenAt: decision.chosen_at,
    chosenByName: decision.chosen_by ? names.nameOf(decision.chosen_by) : null,
    options,
    events,
    reference,
    manualReferenceId: raw.manualReferenceId,
    changedCounts,
    locationChoices: raw.locationOptions
      .filter((o) => !o.deleted_at && o.status !== "discarded")
      .map((o) => ({ id: o.id, title: o.title })),
    partnerName: names.partner,
    meName: names.me,
  };
}

/** Name of who set the manual reference, only if nothing else has touched the reference since. */
export function manualSetBy(events: readonly EventView[], optionId: string): string | null {
  const relevant = events.filter((e) =>
    ["reference_set", "reference_auto", "reopened", "chosen"].includes(e.kind),
  );
  const last = relevant.at(-1);
  return last && last.kind === "reference_set" && last.optionId === optionId
    ? last.actorName
    : null;
}

export function buildListItems(raw: {
  decisions: readonly Tables<"decisions">[];
  options: readonly Pick<
    Tables<"decision_options">,
    "id" | "decision_id" | "title" | "deleted_at"
  >[];
  scenarios: readonly Pick<
    Tables<"date_scenarios">,
    "option_id" | "kind" | "date_from" | "date_to"
  >[];
  events: readonly Pick<Tables<"decision_events">, "decision_id" | "kind" | "id">[];
}): DecisionListItem[] {
  const order = (key: string) => (key === "date" ? 0 : key === "location" ? 1 : 2);
  return [...raw.decisions]
    .sort((a, b) => order(a.key) - order(b.key) || a.created_at.localeCompare(b.created_at))
    .map((decision) => {
      const options = raw.options.filter(
        (o) =>
          o.decision_id === decision.id &&
          !o.deleted_at &&
          (decision.type !== "date" || raw.scenarios.some((s) => s.option_id === o.id)),
      );
      const chosen = decision.chosen_option_id
        ? options.find((o) => o.id === decision.chosen_option_id)
        : undefined;
      const scenario = chosen ? raw.scenarios.find((s) => s.option_id === chosen.id) : undefined;
      let chosenText: string | null = null;
      if (chosen) {
        chosenText = scenario
          ? scenarioDateText(scenarioItem(chosen.id, chosen.title, scenario))
          : chosen.title;
      }
      return {
        id: decision.id,
        key: decision.key,
        type: decision.type,
        question: decision.question,
        state: decisionState(
          decision.status,
          raw.events.filter((e) => e.decision_id === decision.id),
        ),
        optionCount: options.length,
        chosenText,
      };
    });
}

function scenarioItem(
  id: string,
  label: string,
  scenario: { kind: string; date_from: string; date_to: string | null },
): DateScenarioItem {
  return {
    id,
    label,
    kind: scenario.kind === "period" ? "period" : "fixed",
    dateFrom: scenario.date_from,
    ...(scenario.date_to ? { dateTo: scenario.date_to } : {}),
  };
}

/** Item for `DateScenarioList` from an option (date decisions). */
export function toScenarioItem(
  option: OptionView,
  detail: Pick<DecisionDetailView, "reference" | "status">,
): DateScenarioItem | null {
  const scenario = option.scenario;
  if (!scenario) return null;
  const isReference = detail.reference?.optionId === option.id;
  return {
    id: option.id,
    label: option.title,
    kind: scenario.kind,
    dateFrom: scenario.dateFrom,
    ...(scenario.dateTo ? { dateTo: scenario.dateTo } : {}),
    locationName: scenario.locationName,
    isReference,
    ...(isReference && detail.reference
      ? { referenceStatus: detail.reference.status, referenceSetBy: detail.reference.setByName }
      : {}),
    discarded: option.status === "discarded",
  };
}

// ---------------------------------------------------------------------------------------------
// Confronta 2
// ---------------------------------------------------------------------------------------------

export type CompareCell =
  | { kind: "empty" }
  | { kind: "text"; text: string }
  | { kind: "link"; href: string; text: string }
  | { kind: "list"; tone: "pro" | "con" | "plain"; items: string[] };

export interface CompareRow {
  label: string;
  cells: [CompareCell, CompareCell];
}

const EMPTY: CompareCell = { kind: "empty" };

function textCell(value: string | null): CompareCell {
  return value ? { kind: "text", text: value } : EMPTY;
}

export function reactionText(option: OptionView): string[] {
  return option.reactions.map(
    (r) => `${r.name}: ${r.reaction === "prefer" ? "preferisce" : "ha dei dubbi"}`,
  );
}

/** Hostname of an http(s) link, or null if it is not a safe link. */
export function linkHost(link: string | null): string | null {
  if (!link) return null;
  try {
    const url = new URL(link);
    return url.protocol === "https:" || url.protocol === "http:" ? url.hostname : null;
  } catch {
    return null;
  }
}

/** Same rows for both options, key/value as in the cards (AC17). */
export function comparisonRows(
  a: OptionView,
  b: OptionView,
  type: string,
  reference: ReferenceView | null,
): CompareRow[] {
  const pair = <T>(fn: (option: OptionView) => T): [T, T] => [fn(a), fn(b)];
  const rows: CompareRow[] = [];
  const add = (label: string, fn: (option: OptionView) => CompareCell) =>
    rows.push({ label, cells: pair(fn) });

  if (type === "date") {
    add("Data", (o) =>
      o.scenario
        ? textCell(
            scenarioDateText({
              id: o.id,
              label: o.title,
              kind: o.scenario.kind,
              dateFrom: o.scenario.dateFrom,
              ...(o.scenario.dateTo ? { dateTo: o.scenario.dateTo } : {}),
            }),
          )
        : EMPTY,
    );
    add("Location collegata", (o) => textCell(o.scenario?.locationName ?? null));
    add("Riferimento", (o) =>
      textCell(
        reference?.optionId === o.id
          ? reference.status === "definitive"
            ? "Riferimento · definitivo"
            : "Riferimento · provvisorio"
          : null,
      ),
    );
  } else {
    add("Comune", (o) => textCell(o.comune));
    add("Costo indicativo", (o) => textCell(o.costCents === null ? null : formatEuro(o.costCents)));
    add("Link", (o) => {
      const host = linkHost(o.link);
      return host && o.link ? { kind: "link", href: o.link, text: host } : EMPTY;
    });
    add("Pro", (o) => (o.pros.length ? { kind: "list", tone: "pro", items: o.pros } : EMPTY));
    add("Contro", (o) => (o.cons.length ? { kind: "list", tone: "con", items: o.cons } : EMPTY));
  }
  add("Note", (o) => textCell(o.notes));
  add("Reazioni", (o) => {
    const items = reactionText(o);
    return items.length ? { kind: "list", tone: "plain", items } : EMPTY;
  });
  return rows;
}
