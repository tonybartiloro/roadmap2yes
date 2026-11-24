import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  createPartnerForEmailInvite,
  createPartnerWithCode,
  dbStep,
  revokePartnerInvitation,
  setTemporaryCode,
  updatePendingPartnerEmail,
  type AccountOpError,
} from "@/features/accounts/admin-ops";
import { validateAccessCode } from "@/lib/access-code";
import { displayName } from "@/lib/display-name";
import type { EmailSender } from "@/lib/email";
import { renderInviteEmail, renderTempCodeNotice } from "@/lib/email/templates";
import {
  CODE_CREATED,
  EMAIL_OFF_INVITE,
  failureMessage,
  INVITE_NOT_SENT,
  INVITE_SENT,
  OLD_LINK_NOT_KILLED,
  PARTNER_FAILED,
} from "./messages";
import { inviteUrl, type InviteToken } from "./token";

/**
 * Orchestration of the partner operations (plan §4.5, §4.6, §4.8). Every function takes the user's
 * cookie client (`db`: the JWT decides, RLS and the RPCs authorize) and returns a plain result; the
 * server actions only parse forms and translate results to `FormState`. The ORDER of every
 * operation (DB first, admin only on the id it returned) lives in `features/accounts/admin-ops.ts`;
 * this file never imports the secret-key client.
 */

export type PartnerInput = {
  email: string;
  firstName?: string | null;
  lastName?: string | null;
  label?: string | null;
};

export type InviteDeps = {
  emailOn: boolean;
  sender: EmailSender;
  siteUrl: string;
  newToken: () => InviteToken;
  now: () => Date;
};

export type ServiceFailure = {
  ok: false;
  error: AccountOpError | "email_off" | "weak_code";
  message: string;
  /** Form field the message belongs to (`email`, `code`). */
  field?: string;
};

const fail = (error: AccountOpError): ServiceFailure => ({
  ok: false,
  error,
  ...failureMessage(error),
});

type PartnerRow = {
  slot: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  label: string | null;
  user_id: string | null;
};

async function readPartners(db: SupabaseClient): Promise<PartnerRow[]> {
  const { data } = await db
    .from("wedding_partners")
    .select("slot,email,first_name,last_name,label,user_id");
  return (data as PartnerRow[] | null) ?? [];
}

const clean = (value: string | null | undefined): string | null => {
  const trimmed = (value ?? "").trim();
  return trimmed === "" ? null : trimmed;
};

/**
 * Makes sure partner B's row exists with this email and these names (DB only, no account yet).
 * An existing B with ANOTHER email is moved with `update_partner_email` first (after a revoke the
 * row keeps the old address and `create_invitation` would answer `partner_email_mismatch`).
 */
async function preparePartnerRow(
  db: SupabaseClient,
  input: PartnerInput,
): Promise<{ ok: true } | ServiceFailure> {
  const existing = (await readPartners(db)).find((row) => row.slot === "B");
  if (existing?.user_id) return fail("partner_already_joined");
  if (existing && existing.email.trim().toLowerCase() !== input.email) {
    const moved = await updatePendingPartnerEmail(db, input.email);
    if (!moved.ok) return fail(moved.error);
  }
  const step = await dbStep(db, "upsert_partner_b", {
    p_email: input.email,
    p_first_name: clean(input.firstName) ?? existing?.first_name ?? null,
    p_last_name: clean(input.lastName) ?? existing?.last_name ?? null,
    p_label: clean(input.label) ?? existing?.label ?? null,
  });
  return step.ok ? { ok: true } : fail(step.failure.error);
}

// -------------------------------------------------------------------------------- B with a code

export type CreateWithCodeResult =
  { ok: true; invitationId: string; message: string } | ServiceFailure;

/** "Crea l'accesso con un codice" (AC5): A hands the code over in person; it is never shown again. */
export async function createPartnerByCode(
  db: SupabaseClient,
  input: PartnerInput & { code: string },
): Promise<CreateWithCodeResult> {
  const policy = validateAccessCode(input.code, {
    email: input.email,
    firstName: input.firstName ?? null,
    lastName: input.lastName ?? null,
  });
  if (!policy.ok) {
    return { ok: false, error: "weak_code", message: policy.message, field: "code" };
  }
  const prepared = await preparePartnerRow(db, input);
  if (!prepared.ok) return prepared;
  const created = await createPartnerWithCode(db, { email: input.email, code: input.code });
  if (!created.ok) return fail(created.error);
  return { ok: true, invitationId: created.invitationId, message: CODE_CREATED };
}

// ------------------------------------------------------------------------------- B by email

export type EmailInviteResult =
  | {
      ok: true;
      invitationId: string;
      /** `sent`, or `not_sent` when the provider refused (the pending invitation stays). */
      delivery: "sent" | "not_sent";
      /** The one-time link, returned this once so A can copy it (only the sha256 is stored). */
      link: string;
      message: string;
    }
  | ServiceFailure;

async function inviterAndInvitee(
  db: SupabaseClient,
): Promise<{ inviter: string; invitee: string | null }> {
  const rows = await readPartners(db);
  const a = rows.find((row) => row.slot === "A");
  const b = rows.find((row) => row.slot === "B");
  return {
    inviter: displayName(a ? { firstName: a.first_name, label: a.label } : null, "Il tuo partner"),
    invitee: b ? displayName({ firstName: b.first_name, label: b.label }, "") || null : null,
  };
}

async function deliverInvite(
  db: SupabaseClient,
  deps: InviteDeps,
  to: string,
  token: string,
  expiresAt: string | null,
): Promise<"sent" | "not_sent"> {
  try {
    const { inviter, invitee } = await inviterAndInvitee(db);
    const rendered = renderInviteEmail({
      inviteeName: invitee,
      inviterName: inviter,
      url: inviteUrl(deps.siteUrl, token),
      expiresAt: expiresAt ? new Date(expiresAt) : new Date(deps.now().getTime() + 7 * 86_400_000),
    });
    const sent = await deps.sender.send({ to, ...rendered });
    return sent.ok ? "sent" : "not_sent";
  } catch {
    return "not_sent";
  }
}

/** Invite by email (only with emails on): account without a code, link to `/invito/[token]`. */
export async function inviteByEmail(
  db: SupabaseClient,
  deps: InviteDeps,
  input: PartnerInput,
): Promise<EmailInviteResult> {
  if (!deps.emailOn) return { ok: false, error: "email_off", message: EMAIL_OFF_INVITE };
  const prepared = await preparePartnerRow(db, input);
  if (!prepared.ok) return prepared;

  const { token, hash } = deps.newToken();
  const created = await createPartnerForEmailInvite(db, { email: input.email, tokenHash: hash });
  if (!created.ok) return fail(created.error);

  const delivery = await deliverInvite(db, deps, input.email, token, created.expiresAt);
  return {
    ok: true,
    invitationId: created.invitationId,
    delivery,
    link: inviteUrl(deps.siteUrl, token),
    message: delivery === "sent" ? INVITE_SENT : INVITE_NOT_SENT,
  };
}

type PendingInvitation = { id: string; email: string; method: string };

/** A failed read is an error, never "no invitation" (a security step may depend on it). */
async function readPendingInvitation(
  db: SupabaseClient,
): Promise<{ ok: true; pending: PendingInvitation | null } | { ok: false }> {
  try {
    const { data, error } = await db
      .from("invitations")
      .select("id,email,method")
      .is("accepted_at", null)
      .is("revoked_at", null)
      .limit(1);
    if (error) return { ok: false };
    return { ok: true, pending: ((data as PendingInvitation[] | null) ?? [])[0] ?? null };
  } catch {
    return { ok: false };
  }
}

/** "Invia di nuovo": `rotate_invitation` first (the old link stops working), the email after. */
export async function resendInvite(
  db: SupabaseClient,
  deps: InviteDeps,
  invitationId: string,
): Promise<EmailInviteResult> {
  if (!deps.emailOn) return { ok: false, error: "email_off", message: EMAIL_OFF_INVITE };
  const read = await readPendingInvitation(db);
  if (!read.ok) return { ok: false, error: "failed", message: PARTNER_FAILED };
  const pending = read.pending;
  if (!pending || pending.id !== invitationId || pending.method !== "email") {
    return { ok: false, error: "failed", message: PARTNER_FAILED };
  }
  const { token, hash } = deps.newToken();
  const rotated = await dbStep(db, "rotate_invitation", {
    p_invitation_id: invitationId,
    p_token_hash: hash,
  });
  if (!rotated.ok) return fail(rotated.failure.error);
  const expires = rotated.data["expires_at"];
  const delivery = await deliverInvite(
    db,
    deps,
    pending.email,
    token,
    typeof expires === "string" ? expires : null,
  );
  return {
    ok: true,
    invitationId,
    delivery,
    link: inviteUrl(deps.siteUrl, token),
    message: delivery === "sent" ? INVITE_SENT : INVITE_NOT_SENT,
  };
}

// ---------------------------------------------------------------------- revoke, email, temp code

export type SimpleResult = { ok: true; message?: string } | ServiceFailure;

export async function revokeInvite(
  db: SupabaseClient,
  invitationId: string,
): Promise<SimpleResult> {
  const revoked = await revokePartnerInvitation(db, invitationId);
  return revoked.ok ? { ok: true } : fail(revoked.error);
}

/**
 * A changes B's email while B has never entered. With an email invite pending the old link (sent to
 * the old address) is rotated away and a new one goes to the new address.
 */
export async function changePendingEmail(
  db: SupabaseClient,
  deps: InviteDeps,
  newEmail: string,
): Promise<EmailInviteResult | { ok: true; delivery: "none"; message: string } | ServiceFailure> {
  const changed = await updatePendingPartnerEmail(db, newEmail);
  if (!changed.ok) return fail(changed.error);

  // Fail CLOSED (code-16 REV-1): the old link, mailed to the address just corrected, must be
  // confirmed dead before this says "Fatto". Repeating the change is idempotent and retries it.
  const read = await readPendingInvitation(db);
  if (!read.ok) return { ok: false, error: "failed", message: OLD_LINK_NOT_KILLED };
  if (read.pending?.method === "email") {
    const resent = await resendInvite(db, deps, read.pending.id);
    if (resent.ok) return resent;
    // Emails went off meanwhile (or the first rotate failed): rotate anyway so the old link dies.
    const { hash } = deps.newToken();
    const rotated = await dbStep(db, "rotate_invitation", {
      p_invitation_id: read.pending.id,
      p_token_hash: hash,
    });
    if (!rotated.ok) return { ok: false, error: "failed", message: OLD_LINK_NOT_KILLED };
    return {
      ok: true,
      delivery: "none",
      message: "Fatto: l'email è cambiata. L'invito va rimandato.",
    };
  }
  return { ok: true, delivery: "none", message: "Fatto: l'email è cambiata." };
}

/**
 * Temporary code for the OTHER partner (AC57). The policy is checked first (no event for a code
 * that would be refused); the code is never returned. With emails on the target also gets a
 * security notice.
 */
export async function giveTemporaryCode(
  db: SupabaseClient,
  deps: InviteDeps,
  input: { selfSlot: "A" | "B"; code: string },
): Promise<SimpleResult> {
  const rows = await readPartners(db);
  const other = rows.find((row) => row.slot !== input.selfSlot);
  const me = rows.find((row) => row.slot === input.selfSlot);
  if (!other) return fail("no_account");

  const policy = validateAccessCode(input.code, {
    email: other.email,
    firstName: other.first_name,
    lastName: other.last_name,
  });
  if (!policy.ok) {
    return { ok: false, error: "weak_code", message: policy.message, field: "code" };
  }

  const set = await setTemporaryCode(db, input.code);
  if (!set.ok) return fail(set.error);

  if (deps.emailOn && set.targetEmail) {
    try {
      const rendered = renderTempCodeNotice({
        recipientName: displayName({ firstName: other.first_name, label: other.label }, "a te"),
        actorName: displayName({ firstName: me?.first_name, label: me?.label }, "Il tuo partner"),
        loginUrl: `${deps.siteUrl}/accesso`,
      });
      await deps.sender.send({ to: set.targetEmail, ...rendered });
    } catch {
      // The notice is best effort: the code is already set and the event is in Novità.
    }
  }
  return { ok: true };
}
