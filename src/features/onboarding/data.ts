import type { SupabaseClient } from "@supabase/supabase-js";
import { isRite, type Rite } from "@/content/milestones";
import { seedDefaultCategories, setTotal } from "@/features/budget/data";
import type { Database, Json } from "@/lib/supabase/database.types";
import { classifyDbError } from "@/lib/supabase/errors";
import { versionedUpdate, type VersionedPatch } from "@/lib/supabase/versioned-update";
import { buildTaskPayload } from "./tasks";
import {
  advanceLastStep,
  isGuestBand,
  parseAnswers,
  parseUnknown,
  SAVE_FAILED,
  toRpcScenario,
  withUnknown,
  type GuestBand,
  type OnboardingAnswers,
  type StepId,
} from "./model";

/**
 * Reads and writes of the onboarding (AC12-AC15). Everything runs with the USER's client (RLS and the
 * RPCs authorize); nothing here imports Next.js, so the integration tests drive it directly. Only
 * fixed messages leave this file (allowlist, never the database text).
 */
export type Db = SupabaseClient<Database>;

// ------------------------------------------------------------------------------------- results

export type Failure = {
  readonly ok: false;
  readonly code: "invalid" | "forbidden" | "unreachable" | "completed" | "unknown";
  readonly message: string;
  readonly field?: string;
};

const UNREACHABLE = "Non riesco a raggiungere il servizio. Controlla la connessione e riprova.";
const PAUSED = "L'app è in pausa: riprova più tardi.";
const FORBIDDEN = "Non hai il permesso di fare questa modifica.";

export function failureOf(error: { code?: string; message?: string } | null | undefined): Failure {
  const infra = classifyDbError(error);
  if (infra === "paused") return { ok: false, code: "unreachable", message: PAUSED };
  if (infra === "unreachable") return { ok: false, code: "unreachable", message: UNREACHABLE };
  if (error?.code === "42501") return { ok: false, code: "forbidden", message: FORBIDDEN };
  if (error?.message === "already_completed") {
    return { ok: false, code: "completed", message: "L'onboarding è già concluso." };
  }
  if (error?.message === "invalid_scenario" || error?.message === "invalid_scenarios") {
    return {
      ok: false,
      code: "invalid",
      message: "Una delle date non è valida: controllale e riprova.",
    };
  }
  return { ok: false, code: "unknown", message: SAVE_FAILED };
}

// ---------------------------------------------------------------------------------------- state

export interface PartnerView {
  readonly id: string;
  readonly version: number;
  readonly slot: "A" | "B";
  readonly email: string;
  readonly firstName: string | null;
  readonly lastName: string | null;
  readonly label: string | null;
  /** B has accepted (first login): the email is then theirs to change. */
  readonly joined: boolean;
}

export interface PendingInvite {
  readonly id: string;
  readonly method: "code" | "email";
  readonly email: string;
  readonly expiresAt: string | null;
}

/** Everything the wizard needs. Plain JSON: it crosses the server/client boundary. */
export interface OnboardingState {
  readonly weddingId: string;
  readonly version: number;
  readonly completed: boolean;
  readonly selfSlot: "A" | "B";
  readonly rite: Rite | null;
  readonly guestBand: GuestBand | null;
  readonly styleLabel: string | null;
  readonly styleNote: string | null;
  readonly region: string | null;
  readonly comune: string | null;
  readonly themeId: string;
  readonly answers: OnboardingAnswers;
  readonly unknown: readonly StepId[];
  readonly you: PartnerView | null;
  readonly partner: PartnerView | null;
  readonly invitation: PendingInvite | null;
}

type PartnerRow = {
  id: string;
  version: number;
  slot: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  label: string | null;
  user_id: string | null;
};

export function toPartnerView(row: PartnerRow): PartnerView {
  return {
    id: row.id,
    version: row.version,
    slot: row.slot === "B" ? "B" : "A",
    email: row.email,
    firstName: row.first_name,
    lastName: row.last_name,
    label: row.label,
    joined: row.user_id !== null,
  };
}

export class OnboardingLoadError extends Error {
  readonly infra: "paused" | "unreachable" | null;
  constructor(message: string, cause: unknown) {
    super(message, { cause });
    this.name = "OnboardingLoadError";
    this.infra = classifyDbError(cause);
  }
}

/**
 * The wedding of the caller as the wizard sees it, or `null` when the user has no membership (the
 * proxy has already sent them elsewhere). A failed read throws: the page shows "Riprova".
 */
export async function loadOnboarding(db: Db, userId: string): Promise<OnboardingState | null> {
  const [membership, wedding, partners, invitations] = await Promise.all([
    db.from("memberships").select("partner_slot").eq("user_id", userId).limit(1).maybeSingle(),
    db.from("weddings").select("*").limit(1).maybeSingle(),
    db.from("wedding_partners").select("id,version,slot,email,first_name,last_name,label,user_id"),
    db
      .from("invitations")
      .select("id,email,method,expires_at")
      .is("accepted_at", null)
      .is("revoked_at", null)
      .order("created_at", { ascending: false })
      .limit(1),
  ]);
  for (const [what, result] of [
    ["membership", membership],
    ["wedding", wedding],
    ["partners", partners],
    ["invitations", invitations],
  ] as const) {
    if (result.error) throw new OnboardingLoadError(`Onboarding: ${what}`, result.error);
  }
  if (!wedding.data) return null;
  const row = wedding.data;
  const rows = (partners.data ?? []) as PartnerRow[];
  const slot = membership.data?.partner_slot === "B" ? "B" : "A";
  const you = rows.find((p) => p.slot === slot);
  const other = rows.find((p) => p.slot !== slot);
  const pending = invitations.data?.[0];
  return {
    weddingId: row.id,
    version: row.version,
    completed: row.onboarding_completed_at !== null,
    selfSlot: slot,
    rite: isRite(row.rite) ? row.rite : null,
    guestBand: isGuestBand(row.guest_band) ? row.guest_band : null,
    styleLabel: row.style_label,
    styleNote: row.style_note,
    region: row.region,
    comune: row.comune,
    themeId: row.theme_id,
    answers: parseAnswers(row.onboarding_answers),
    unknown: parseUnknown(row.onboarding_unknown),
    you: you ? toPartnerView(you) : null,
    partner: other ? toPartnerView(other) : null,
    invitation: pending
      ? {
          id: pending.id,
          method: pending.method === "email" ? "email" : "code",
          email: pending.email,
          expiresAt: pending.expires_at,
        }
      : null,
  };
}

// --------------------------------------------------------------------------------------- writes

export type StepResult = { readonly ok: true; readonly state: OnboardingState } | Failure;

function answersToJson(answers: OnboardingAnswers): Json {
  return {
    lastStep: answers.lastStep,
    partnerMode: answers.partnerMode,
    inviteAtEnd: answers.inviteAtEnd,
    scenarios: answers.scenarios.map((s) => ({
      id: s.id,
      kind: s.kind,
      dateFrom: s.dateFrom,
      dateTo: s.dateTo,
      label: s.label,
    })),
    budgetCents: answers.budgetCents,
  };
}

/** What a step changes: the wedding columns it owns and the answers it keeps in the JSON. */
export interface StepPatch {
  readonly step: StepId;
  /** `true` = the couple chose "Non lo so ancora" on this step. */
  readonly unknown: boolean;
  readonly columns?: VersionedPatch<"weddings">;
  readonly answers?: Partial<Omit<OnboardingAnswers, "lastStep">>;
}

const MAX_ATTEMPTS = 3;

/**
 * Saves one confirmed step on the wedding row. The step owns only its own fields, so when the other
 * partner wrote something in between (version conflict) the patch is merged onto the fresh row and
 * tried again: nothing of theirs is overwritten, no dialog is needed here.
 */
export async function saveStep(db: Db, userId: string, patch: StepPatch): Promise<StepResult> {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    let state: OnboardingState | null;
    try {
      state = await loadOnboarding(db, userId);
    } catch (error) {
      return failureOf(error as { code?: string });
    }
    if (!state) return { ok: false, code: "forbidden", message: FORBIDDEN };
    if (state.completed) {
      return { ok: false, code: "completed", message: "L'onboarding è già concluso." };
    }
    const answers: OnboardingAnswers = {
      ...state.answers,
      ...patch.answers,
      lastStep: advanceLastStep(state.answers, patch.step),
    };
    try {
      const result = await versionedUpdate(db, "weddings", state.weddingId, state.version, {
        ...patch.columns,
        onboarding_answers: answersToJson(answers) as NonNullable<Json>,
        onboarding_unknown: withUnknown(state.unknown, patch.step, patch.unknown),
      });
      if (result.conflict) continue;
    } catch (error) {
      return failureOf(error as { code?: string });
    }
    try {
      const fresh = await loadOnboarding(db, userId);
      if (fresh) return { ok: true, state: fresh };
    } catch (error) {
      return failureOf(error as { code?: string });
    }
    return { ok: false, code: "unknown", message: SAVE_FAILED };
  }
  return { ok: false, code: "unknown", message: SAVE_FAILED };
}

/** Name, surname and label of the person who is filling in (partner A). */
export async function savePersonRow(
  db: Db,
  slot: "A" | "B",
  person: { firstName: string | null; lastName: string | null; label: string | null },
): Promise<{ ok: true } | Failure> {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const row = await db
      .from("wedding_partners")
      .select("id,version")
      .eq("slot", slot)
      .limit(1)
      .maybeSingle();
    if (row.error) return failureOf(row.error);
    if (!row.data) return { ok: false, code: "forbidden", message: FORBIDDEN };
    try {
      const result = await versionedUpdate(db, "wedding_partners", row.data.id, row.data.version, {
        first_name: person.firstName,
        last_name: person.lastName,
        label: person.label,
      });
      if (!result.conflict) return { ok: true };
    } catch (error) {
      return failureOf(error as { code?: string });
    }
  }
  return { ok: false, code: "unknown", message: SAVE_FAILED };
}

export type ChangeEmail = (
  email: string,
) => Promise<{ ok: true } | { ok: false; error: string; message: string; field?: string }>;

/**
 * Makes partner B's row exist with this email and these names, without creating any account (modes
 * "invito per email" and "più tardi"). An existing B with ANOTHER email is moved first, through
 * `changeEmail` (the T7b operation that keeps Auth in step); a B who has joined is never touched.
 */
export async function savePartnerRow(
  db: Db,
  input: { email: string; firstName: string | null; lastName: string | null; label: string | null },
  changeEmail: ChangeEmail,
): Promise<{ ok: true } | Failure> {
  const existing = await db
    .from("wedding_partners")
    .select("email,user_id")
    .eq("slot", "B")
    .limit(1)
    .maybeSingle();
  if (existing.error) return failureOf(existing.error);
  if (existing.data?.user_id) {
    return {
      ok: false,
      code: "forbidden",
      message: "Il tuo partner ha già fatto il primo accesso: i dati di accesso li gestisce da sé.",
    };
  }
  if (existing.data && existing.data.email.trim().toLowerCase() !== input.email) {
    const moved = await changeEmail(input.email);
    if (!moved.ok) {
      return {
        ok: false,
        code: "invalid",
        message: moved.message,
        ...(moved.field ? { field: moved.field } : {}),
      };
    }
  }
  const upserted = await db.rpc("upsert_partner_b", {
    p_email: input.email,
    p_first_name: input.firstName ?? undefined,
    p_last_name: input.lastName ?? undefined,
    p_label: input.label ?? undefined,
  });
  if (upserted.error) {
    if (upserted.error.message === "same_email") {
      return {
        ok: false,
        code: "invalid",
        message: "È la tua stessa email: scrivi quella del tuo partner.",
        field: "email",
      };
    }
    return failureOf(upserted.error);
  }
  return { ok: true };
}

// ------------------------------------------------------------------------------------ completion

export type Warning = "categories" | "budget_total";

export type FinishResult =
  | {
      readonly ok: true;
      readonly state: OnboardingState;
      readonly tasksCreated: number;
      readonly referenceDate: string | null;
      readonly referenceStatus: "provisional" | "definitive" | null;
      readonly warnings: readonly Warning[];
      /** The call found the onboarding already completed (a retry after a partial failure). */
      readonly alreadyCompleted: boolean;
    }
  | Failure;

type CompleteData = {
  tasks?: { inserted?: number };
  reference_date?: string | null;
  reference_status?: string | null;
};

/**
 * Closes the onboarding (AC14, AC15): `complete_onboarding` (one transaction: decisions, date scenarios,
 * the initial Percorso, the completion stamp), THEN the budget: the 11 predefined categories and the
 * initial total as the first `budget_versions` row (append-only: only when there is none yet, so a
 * retry never doubles it). A second call is not an error: it finishes what is missing and reports
 * `alreadyCompleted`. A failure of the budget part does not undo the onboarding: it is returned as a
 * warning ("Budget" has a lazy fallback for the categories and the total can be set there).
 */
export async function finishOnboarding(db: Db, userId: string): Promise<FinishResult> {
  let state: OnboardingState | null;
  try {
    state = await loadOnboarding(db, userId);
  } catch (error) {
    return failureOf(error as { code?: string });
  }
  if (!state || state.selfSlot !== "A") return { ok: false, code: "forbidden", message: FORBIDDEN };

  let tasksCreated = 0;
  let referenceDate: string | null = null;
  let referenceStatus: "provisional" | "definitive" | null = null;
  let alreadyCompleted = state.completed;

  if (!alreadyCompleted) {
    const done = await db.rpc("complete_onboarding", {
      p_scenarios: state.answers.scenarios.map(toRpcScenario),
      p_tasks: buildTaskPayload(state.rite),
    });
    if (done.error) {
      const failure = failureOf(done.error);
      if (failure.code !== "completed") return failure;
      alreadyCompleted = true;
    } else {
      const data = (done.data ?? {}) as CompleteData;
      tasksCreated = data.tasks?.inserted ?? 0;
      referenceDate = data.reference_date ?? null;
      referenceStatus =
        data.reference_status === "definitive" || data.reference_status === "provisional"
          ? data.reference_status
          : null;
    }
  }
  if (alreadyCompleted) {
    const count = await db
      .from("tasks")
      .select("id", { count: "exact", head: true })
      .eq("source", "template");
    tasksCreated = count.count ?? 0;
  }

  const warnings: Warning[] = [];
  try {
    await seedDefaultCategories(db, state.weddingId);
  } catch {
    warnings.push("categories");
  }
  const totalCents = state.answers.budgetCents;
  if (totalCents !== null) {
    const versions = await db
      .from("budget_versions")
      .select("id", { count: "exact", head: true })
      .eq("wedding_id", state.weddingId);
    if (versions.error) {
      warnings.push("budget_total");
    } else if ((versions.count ?? 0) === 0) {
      const total = await setTotal(db, { totalCents, reason: "Budget iniziale" });
      if (!total.ok) warnings.push("budget_total");
    }
  }

  try {
    const fresh = await loadOnboarding(db, userId);
    if (!fresh) return { ok: false, code: "unknown", message: SAVE_FAILED };
    return {
      ok: true,
      state: fresh,
      tasksCreated,
      referenceDate,
      referenceStatus,
      warnings,
      alreadyCompleted,
    };
  } catch (error) {
    return failureOf(error as { code?: string });
  }
}
