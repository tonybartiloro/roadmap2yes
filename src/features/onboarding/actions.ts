"use server";

import { revalidatePath } from "next/cache";
import { updatePendingPartnerEmail, type UserRpc } from "@/features/accounts/admin-ops";
import { createPartnerAccount, invitePartnerByEmail } from "@/features/invitations/actions";
import { failureMessage } from "@/features/invitations/messages";
import { emailEnabled } from "@/lib/email";
import { createClient } from "@/lib/supabase/server";
import {
  failureOf,
  finishOnboarding,
  saveStep,
  savePartnerRow,
  savePersonRow,
  type Db,
  type Failure,
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

async function session(): Promise<{ raw: UserRpc; db: Db; userId: string } | null> {
  const client = await createClient();
  const { data } = await client.auth.getClaims();
  const userId = data?.claims?.sub;
  return userId ? { raw: client as unknown as UserRpc, db: client as unknown as Db, userId } : null;
}

/** Onboarding answers feed Home (next step), Percorso (tasks), Scelte (decisions) and Budget. */
function refreshAfterFinish(): void {
  revalidatePath("/");
  revalidatePath("/percorso");
  revalidatePath("/scelte");
  revalidatePath("/budget");
}

/**
 * Names for the partner operations of T7b. Their zod schema accepts a missing field but REJECTS
 * `null` (although the TypeScript signature allows it), so empty ones are left out.
 */
function optionalNames(names: {
  firstName?: string | null;
  lastName?: string | null;
  label?: string | null;
}): { firstName?: string; lastName?: string; label?: string } {
  return {
    ...(names.firstName ? { firstName: names.firstName } : {}),
    ...(names.lastName ? { lastName: names.lastName } : {}),
    ...(names.label ? { label: names.label } : {}),
  };
}

function fail(message: string, field?: string): Failure {
  return { ok: false, code: "invalid", message, ...(field ? { field } : {}) };
}

async function savePartnerStep(
  ctx: { raw: UserRpc; db: Db; userId: string },
  input: PartnerInput,
): Promise<StepActionResult> {
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
    if (code !== "") {
      const created = await createPartnerAccount({
        email: emailAddress,
        code,
        ...optionalNames(names),
      });
      if (!created.ok) {
        return fail(
          created.message,
          created.field ?? (created.error === "weak_code" ? "code" : undefined),
        );
      }
    } else {
      // No new code: fine only when the access for THIS email is already prepared (a resumed step).
      const state = await ctx.db
        .from("invitations")
        .select("email,method")
        .is("accepted_at", null)
        .is("revoked_at", null)
        .maybeSingle();
      const ready = state.data?.method === "code" && state.data.email === emailAddress;
      if (!ready) return fail("Scrivi o genera un codice da consegnare al tuo partner.", "code");
      const row = await savePartnerRow(ctx.db, { email: emailAddress, ...names }, changeEmail);
      if (!row.ok) return row;
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
  if (!ctx) return expired;
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
  if (state.invitation) {
    return state.invitation.method === "code" ? { kind: "code_ready" } : { kind: "later" };
  }
  if (mode === "email" && state.answers.inviteAtEnd) {
    if (!emailEnabled()) return { kind: "email_off" };
    const sent = await invitePartnerByEmail({ email: partner.email, ...optionalNames(partner) });
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
  const ctx = await session();
  if (!ctx) return expired;

  // The theme step is confirmed by finishing (the theme itself is saved by the gallery).
  const marked = await saveStep(ctx.db, ctx.userId, {
    step: "theme",
    unknown: parsed.data.skipTheme,
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
