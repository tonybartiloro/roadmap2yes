"use server";

import { revalidatePath } from "next/cache";
import { updatePendingPartnerEmail, type UserRpc } from "@/features/accounts/admin-ops";
import { createPartnerAccount, invitePartnerByEmail } from "@/features/invitations/actions";
import { failureMessage } from "@/features/invitations/messages";
import { emailEnabled } from "@/lib/email";
import { createClient } from "@/lib/supabase/server";
import { DEFAULT_THEME_ID } from "@/themes/approved";
import {
  failureOf,
  finishOnboarding,
  loadOnboarding,
  saveStep,
  savePartnerRow,
  savePersonRow,
  type Db,
  type Failure,
  type OnboardingState,
  type StepPatch,
} from "./data";
import { toRpcScenario } from "./model";
import { finishSchema, stepSchema, type PartnerInput } from "./schemas";
import type {
  FinishActionResult,
  InviteOutcome,
  OnboardingSummary,
  StepActionResult,
} from "./types";

/**
 * Server actions of the onboarding. The session ALWAYS comes from the cookies; the input is parsed
 * with zod before anything runs; the data layer then writes with the USER's client (RLS and the RPCs
 * authorize). Only fixed messages go back. The initial code of partner B travels in the request of
 * the step "partner" once and is never stored, logged or returned.
 */

const SESSION_EXPIRED = "La sessione è scaduta. Entra di nuovo: non hai perso nulla.";
const INVALID = "Controlla i dati: qualcosa non torna.";

const expired: Failure = { ok: false, code: "forbidden", message: SESSION_EXPIRED };
const invalid: Failure = { ok: false, code: "invalid", message: INVALID };

type Ctx = { raw: UserRpc; db: Db; userId: string; onboarding: OnboardingState };

const NOT_FOUNDER: Failure = {
  ok: false,
  code: "forbidden",
  message: "Solo chi ha iniziato può compilare l'onboarding.",
};
const ALREADY_DONE: Failure = {
  ok: false,
  code: "completed",
  message: "L'onboarding è già concluso.",
};

/**
 * The session from the cookies AND the authorization of every entry point: the caller must be
 * partner A of a wedding. Steps also need the onboarding NOT completed; `allowCompleted` is only for
 * the idempotent retry of "finish". All of it before any write: the page redirect is UX, a server
 * action can be called directly.
 */
async function session(options: { allowCompleted?: boolean } = {}): Promise<Ctx | Failure> {
  const client = await createClient();
  const { data } = await client.auth.getClaims();
  const userId = data?.claims?.sub;
  if (!userId) return expired;
  const db = client as unknown as Db;
  let onboarding: OnboardingState | null;
  try {
    onboarding = await loadOnboarding(db, userId);
  } catch (error) {
    return failureOf(error as { code?: string });
  }
  if (!onboarding || onboarding.selfSlot !== "A") return NOT_FOUNDER;
  if (onboarding.completed && !options.allowCompleted) return ALREADY_DONE;
  return { raw: client as unknown as UserRpc, db, userId, onboarding };
}

const isFailure = (value: Ctx | Failure): value is Failure => "ok" in value;

/** Onboarding answers feed Home (next step), Percorso (tasks), Scelte (decisions) and Budget. */
function refreshAfterFinish(): void {
  revalidatePath("/");
  revalidatePath("/percorso");
  revalidatePath("/scelte");
  revalidatePath("/budget");
}

function fail(message: string, field?: string): Failure {
  return { ok: false, code: "invalid", message, ...(field ? { field } : {}) };
}

async function savePartnerStep(ctx: Ctx, input: PartnerInput): Promise<StepActionResult> {
  if (input.skip) {
    // "Non lo so ancora": nothing to create now. A partner already on file stays as it is.
    const hasPartner = (await ctx.db.from("wedding_partners").select("id").eq("slot", "B")).data;
    return saveStep(ctx.db, ctx.userId, {
      step: "partner",
      unknown: !hasPartner || hasPartner.length === 0,
      answers: { partnerMode: null },
    });
  }

  const emailAddress = (input.email ?? "").trim().toLowerCase();
  const mode = input.mode ?? "later";

  const own = await ctx.db.from("wedding_partners").select("email").eq("slot", "A").maybeSingle();
  if (own.data?.email.trim().toLowerCase() === emailAddress) {
    return fail(failureMessage("same_email").message, "email");
  }
  if (mode === "email" && !emailEnabled()) {
    return fail("Le email sono disattivate: scegli il codice oppure rimanda l'invito.", "mode");
  }

  const names = {
    firstName: input.firstName ?? null,
    lastName: input.lastName ?? null,
    label: input.label ?? null,
  };
  const changeEmail = async (email: string) => {
    const moved = await updatePendingPartnerEmail(ctx.raw, email);
    return moved.ok
      ? ({ ok: true } as const)
      : { ok: false as const, error: moved.error, ...failureMessage(moved.error) };
  };

  if (mode === "code") {
    const code = input.code ?? "";
    // The access for THIS email may already exist (a resumed step, or a retry after the access was
    // created but the step could not be saved): then it is kept as it is, whatever code was typed.
    // A new code is not set here: changes go through Altro > Invito (temporary code).
    const pending = await ctx.db
      .from("invitations")
      .select("email,method")
      .is("accepted_at", null)
      .is("revoked_at", null)
      .maybeSingle();
    const ready = pending.data?.method === "code" && pending.data.email === emailAddress;
    if (ready) {
      const row = await savePartnerRow(ctx.db, { email: emailAddress, ...names }, changeEmail);
      if (!row.ok) return row;
    } else if (code !== "") {
      const created = await createPartnerAccount({ email: emailAddress, code, ...names });
      if (!created.ok) {
        return fail(
          created.message,
          created.field ?? (created.error === "weak_code" ? "code" : undefined),
        );
      }
    } else {
      return fail("Scrivi o genera un codice da consegnare al tuo partner.", "code");
    }
  } else {
    const row = await savePartnerRow(ctx.db, { email: emailAddress, ...names }, changeEmail);
    if (!row.ok) return row;
  }

  return saveStep(ctx.db, ctx.userId, {
    step: "partner",
    unknown: false,
    answers: {
      partnerMode: mode,
      inviteAtEnd: mode === "email" ? (input.inviteAtEnd ?? true) : true,
    },
  });
}

export async function saveStepAction(input: unknown): Promise<StepActionResult> {
  const parsed = stepSchema.safeParse(input);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    const field = typeof first?.path[0] === "string" ? first.path[0] : undefined;
    return field === "email"
      ? fail("Controlla l'email: non sembra un indirizzo valido.", "email")
      : invalid;
  }
  const ctx = await session();
  if (isFailure(ctx)) return ctx;
  const step = parsed.data;

  let result: StepActionResult;
  switch (step.step) {
    case "you": {
      const person = await savePersonRow(ctx.db, "A", {
        firstName: step.firstName,
        lastName: step.lastName,
        label: step.label,
      });
      if (!person.ok) return person;
      result = await saveStep(ctx.db, ctx.userId, { step: "you", unknown: false });
      break;
    }
    case "partner":
      result = await savePartnerStep(ctx, step);
      break;
    case "rite":
      result = await saveStep(ctx.db, ctx.userId, {
        step: "rite",
        unknown: step.rite === "unknown",
        columns: { rite: step.rite },
      });
      break;
    case "dates": {
      const scenarios = step.skip ? [] : step.scenarios;
      // Check once that the payload is what the database accepts: a bad date is refused here, not at the end.
      scenarios.forEach(toRpcScenario);
      result = await saveStep(ctx.db, ctx.userId, {
        step: "dates",
        unknown: step.skip || scenarios.length === 0,
        answers: { scenarios },
      });
      break;
    }
    case "guests":
      result = await saveStep(ctx.db, ctx.userId, {
        step: "guests",
        unknown: step.band === "unknown",
        columns: { guest_band: step.band },
      });
      break;
    case "budget":
      result = await saveStep(ctx.db, ctx.userId, {
        step: "budget",
        unknown: step.skip || step.totalCents === null,
        answers: { budgetCents: step.skip ? null : step.totalCents },
      });
      break;
    case "style": {
      const patch: StepPatch = {
        step: "style",
        unknown: step.skip,
        columns: step.skip
          ? { style_label: null, style_note: null, region: null, comune: null }
          : {
              style_label: step.styleLabel,
              style_note: step.styleNote,
              region: step.region,
              comune: step.comune,
            },
      };
      result = await saveStep(ctx.db, ctx.userId, patch);
      break;
    }
  }
  return result;
}

async function inviteOutcome(state: OnboardingSummary["state"]): Promise<InviteOutcome> {
  const partner = state.partner;
  if (!partner) return { kind: "none" };
  if (partner.joined) return { kind: "joined" };
  const mode = state.answers.partnerMode;
  // An invitation already exists (a retry, or access made at step 2): never send a second one.
  if (state.invitation) {
    return state.invitation.method === "code" ? { kind: "code_ready" } : { kind: "email_pending" };
  }
  if (mode === "email" && state.answers.inviteAtEnd) {
    if (!emailEnabled()) return { kind: "email_off" };
    const sent = await invitePartnerByEmail({
      email: partner.email,
      firstName: partner.firstName,
      lastName: partner.lastName,
      label: partner.label,
    });
    if (!sent.ok) return { kind: "failed", message: sent.message };
    return sent.delivery === "sent"
      ? { kind: "sent", link: sent.link ?? "" }
      : { kind: "not_sent", link: sent.link ?? "" };
  }
  return { kind: "later" };
}

/**
 * Closes the onboarding: `complete_onboarding`, the budget seed and total, then the invitation of
 * partner B if the couple asked for it "at the end" (AC14). Repeating it after a partial failure
 * finishes what is missing.
 */
export async function finishOnboardingAction(input: unknown): Promise<FinishActionResult> {
  const parsed = finishSchema.safeParse(input);
  if (!parsed.success) return invalid;
  const ctx = await session({ allowCompleted: true });
  if (isFailure(ctx)) return ctx;

  // The theme step is confirmed by finishing (the theme itself is saved by the gallery). "Non lo so
  // ancora" only counts as unknown while the theme is still the default: a saved choice is an answer.
  const marked = await saveStep(ctx.db, ctx.userId, {
    step: "theme",
    unknown: parsed.data.skipTheme && ctx.onboarding.themeId === DEFAULT_THEME_ID,
  });
  if (!marked.ok && marked.code !== "completed") return marked;

  const done = await finishOnboarding(ctx.db, ctx.userId);
  if (!done.ok) return done;
  refreshAfterFinish();

  const invite = await inviteOutcome(done.state).catch((error): InviteOutcome => ({
    kind: "failed",
    message: failureOf(error).message,
  }));
  return {
    ok: true,
    summary: {
      state: done.state,
      tasksCreated: done.tasksCreated,
      referenceDate: done.referenceDate,
      referenceStatus: done.referenceStatus,
      warnings: done.warnings,
      invite,
    },
  };
}
