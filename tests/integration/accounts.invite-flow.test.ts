import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeAll, describe, expect, it } from "vitest";
import { consumeInviteToken, peekInviteToken } from "@/features/accounts/admin-ops";
import {
  changePendingEmail,
  createPartnerByCode,
  giveTemporaryCode,
  inviteByEmail,
  resendInvite,
  revokeInvite,
  type InviteDeps,
} from "@/features/invitations/service";
import { generateInviteToken, hashInviteToken } from "@/features/invitations/token";
import type { EmailMessage, EmailSender } from "@/lib/email";
import {
  anonClient,
  createUser,
  createWedding,
  randomCode,
  serviceClient,
  signInAs,
  stackEnv,
  uniqueEmail,
  type TestWedding,
} from "../support/supabase";

/**
 * The email invite and the surrounding orchestration (plan §4.5.2, §4.6, §4.8): the one-time link,
 * its single use, "Invia di nuovo", revoke, the email change with a pending link, the temporary
 * code and its notice. Emails go to a capturing sender (nothing leaves the machine).
 */

beforeAll(() => {
  const env = stackEnv();
  process.env["NEXT_PUBLIC_SUPABASE_URL"] = env.url;
  process.env["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"] = env.publishableKey;
  process.env["SUPABASE_SECRET_KEY"] = env.secretKey;
});

const SITE = "https://app.example.test";

function capture(result: { ok: true } | { ok: false; retryable: boolean } = { ok: true }) {
  const sent: EmailMessage[] = [];
  const sender: EmailSender = {
    transport: "smtp",
    async send(message) {
      sent.push(message);
      return result.ok
        ? { ok: true }
        : { ok: false, error: "refused", retryable: result.retryable };
    },
  };
  return { sent, sender };
}

const depsWith = (sender: EmailSender, emailOn = true): InviteDeps => ({
  emailOn,
  sender,
  siteUrl: SITE,
  newToken: () => generateInviteToken(),
  now: () => new Date(),
});

const asDb = (client: unknown) => client as SupabaseClient;
const tokenOf = (link: string) => link.replace(`${SITE}/invito/`, "");
const canSignIn = async (email: string, code: string) =>
  (await anonClient().auth.signInWithPassword({ email, password: code })).error === null;
const pendingInvitation = async (weddingId: string) => {
  const { data } = await serviceClient()
    .from("invitations")
    .select("id, email, method, invitee_user_id, expires_at, revoked_at, accepted_at, send_count")
    .eq("wedding_id", weddingId)
    .order("created_at", { ascending: false });
  return data ?? [];
};

async function inviteFlow(w: TestWedding, email = uniqueEmail("jessica")) {
  const mail = capture();
  const result = await inviteByEmail(asDb(w.founderClient), depsWith(mail.sender), { email });
  if (!result.ok) throw new Error(`setup failed: ${result.message}`);
  return { ...mail, email, result, token: tokenOf(result.link) };
}

describe("invite by email", () => {
  it("creates B's account without a code, stores only the hash and sends the link", async () => {
    const w = await createWedding();
    const { sent, email, result, token } = await inviteFlow(w);

    expect(result.delivery).toBe("sent");
    expect(sent).toHaveLength(1);
    expect(sent[0]?.to).toBe(email);
    expect(sent[0]?.text).toContain(`${SITE}/invito/${token}`);
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);

    const [invitation] = await pendingInvitation(w.weddingId);
    expect(invitation).toMatchObject({ email, method: "email" });
    const { data: hashRow } = await serviceClient()
      .from("invitations")
      .select("token_hash")
      .eq("id", invitation?.id ?? "")
      .single();
    expect(hashRow?.token_hash).toBe(hashInviteToken(token));
    expect(JSON.stringify(invitation)).not.toContain(token);
    expect(await canSignIn(email, randomCode())).toBe(false); // no code exists yet
  });

  it("the link page (GET) changes nothing; the POST sets the code, B enters, the link dies (AC6, AC7)", async () => {
    const w = await createWedding();
    const { email, token } = await inviteFlow(w);
    const hash = hashInviteToken(token);

    for (let i = 0; i < 2; i += 1) {
      const peek = await peekInviteToken(hash);
      // No first name on A's profile yet: the label from the founder's role is the inviter's name.
      expect(peek).toEqual({
        ok: true,
        inviterName: "sposo",
        maskedEmail: `${email[0]}***@example.test`,
      });
    }
    expect((await pendingInvitation(w.weddingId))[0]?.accepted_at).toBeNull();

    // The policy has the last word (the account's email is part of it).
    const weak = await consumeInviteToken(hash, `${email.split("@")[0]}9x9x9x`, (e) =>
      e === email ? "policy" : null,
    );
    expect(weak).toEqual({ ok: false, error: "policy", message: "policy" });
    expect(await canSignIn(email, "Whatever1234")).toBe(false);

    const code = randomCode();
    const consumed = await consumeInviteToken(hash, code, () => null);
    expect(consumed).toMatchObject({ ok: true, email });

    const b = await signInAs({ email, code });
    expect((await b.rpc("accept_pending_invitation")).data).toBe("ok");

    // Single use: the same link now says "not valid" and cannot change the code.
    expect(await peekInviteToken(hash)).toEqual({ ok: false, error: "invalid_link" });
    expect(await consumeInviteToken(hash, randomCode(), () => null)).toEqual({
      ok: false,
      error: "invalid_link",
    });
    expect(await canSignIn(email, code)).toBe(true);
  });

  it("a name on A's profile is shown as the inviter, never the email", async () => {
    const w = await createWedding();
    await w.founderClient.from("wedding_partners").update({ first_name: "Tony" }).eq("slot", "A");
    const { token } = await inviteFlow(w);
    const peek = await peekInviteToken(hashInviteToken(token));
    expect(peek).toMatchObject({ ok: true, inviterName: "Tony" });
  });

  it("every bad link gets the same neutral answer: unknown, wrong shape, expired, revoked", async () => {
    const w = await createWedding();
    const { token, result } = await inviteFlow(w);
    const hash = hashInviteToken(token);
    const neutral = { ok: false, error: "invalid_link" };

    expect(await peekInviteToken(hashInviteToken("never-issued"))).toEqual(neutral);
    expect(await peekInviteToken("not-bytea")).toMatchObject({ ok: false });

    // Expired (timestamp moved): the link no longer works.
    await serviceClient()
      .from("invitations")
      .update({ expires_at: new Date(Date.now() - 1000).toISOString() })
      .eq("id", result.invitationId);
    expect(await peekInviteToken(hash)).toEqual(neutral);
    expect(await consumeInviteToken(hash, randomCode(), () => null)).toEqual(neutral);

    // "Invia di nuovo" gives a new 7 days and a new link; the old one stays dead.
    const mail = capture();
    const again = await resendInvite(
      asDb(w.founderClient),
      depsWith(mail.sender),
      result.invitationId,
    );
    expect(again.ok).toBe(true);
    expect(await peekInviteToken(hash)).toEqual(neutral);
    if (again.ok)
      expect(await peekInviteToken(hashInviteToken(tokenOf(again.link)))).toMatchObject({
        ok: true,
      });
  });

  it("'Invia di nuovo' rotates the token and sends a new email; the old link is invalidated (AC5)", async () => {
    const w = await createWedding();
    const { token, result, email } = await inviteFlow(w);
    const mail = capture();
    const again = await resendInvite(
      asDb(w.founderClient),
      depsWith(mail.sender),
      result.invitationId,
    );
    if (!again.ok) throw new Error("setup");

    expect(mail.sent).toHaveLength(1);
    expect(mail.sent[0]?.to).toBe(email);
    expect(await peekInviteToken(hashInviteToken(token))).toMatchObject({ ok: false });
    expect(await peekInviteToken(hashInviteToken(tokenOf(again.link)))).toMatchObject({ ok: true });
    expect((await pendingInvitation(w.weddingId))[0]?.send_count).toBe(2);
  });

  it("revoke kills the link and removes the never-used account; a new invite then works", async () => {
    const w = await createWedding();
    const { token, result, email } = await inviteFlow(w);
    expect(await revokeInvite(asDb(w.founderClient), result.invitationId)).toEqual({ ok: true });
    expect(await peekInviteToken(hashInviteToken(token))).toEqual({
      ok: false,
      error: "invalid_link",
    });
    const { data } = await serviceClient().auth.admin.listUsers({ perPage: 1000 });
    expect(data.users.filter((user) => user.email === email)).toHaveLength(0);

    // A different address after a revoke: the stale partner row moves first (no partner_email_mismatch).
    const other = uniqueEmail("second");
    const next = await inviteByEmail(asDb(w.founderClient), depsWith(capture().sender), {
      email: other,
    });
    expect(next.ok).toBe(true);
    const partner = await w.founderClient.from("wedding_partners").select("email").eq("slot", "B");
    expect(partner.data).toEqual([{ email: other }]);
  });

  it("changing the email of a pending email invite rotates the link and mails the NEW address", async () => {
    const w = await createWedding();
    const { token, email } = await inviteFlow(w);
    const mail = capture();
    const newEmail = uniqueEmail("changed");

    const result = await changePendingEmail(asDb(w.founderClient), depsWith(mail.sender), newEmail);
    expect(result.ok).toBe(true);
    expect(mail.sent.map((m) => m.to)).toEqual([newEmail]);
    expect(await peekInviteToken(hashInviteToken(token))).toMatchObject({ ok: false });

    const link = (result as { link?: string }).link;
    expect(link).toBeDefined();
    const code = randomCode();
    const consumed = await consumeInviteToken(
      hashInviteToken(tokenOf(link ?? "")),
      code,
      () => null,
    );
    expect(consumed).toMatchObject({ ok: true, email: newEmail });
    expect(await canSignIn(email, code)).toBe(false);
    expect(await canSignIn(newEmail, code)).toBe(true);
  });

  it("emails off: no invite by email is offered and nothing is created", async () => {
    const w = await createWedding();
    const mail = capture();
    const email = uniqueEmail("noemail");
    const result = await inviteByEmail(asDb(w.founderClient), depsWith(mail.sender, false), {
      email,
    });
    expect(result).toMatchObject({ ok: false, error: "email_off" });
    expect(mail.sent).toEqual([]);
    expect(await pendingInvitation(w.weddingId)).toEqual([]);
    const { data } = await serviceClient().auth.admin.listUsers({ perPage: 1000 });
    expect(data.users.filter((user) => user.email === email)).toHaveLength(0);
  });

  it("a refused email leaves the invitation pending and still returns the link to copy", async () => {
    const w = await createWedding();
    const mail = capture({ ok: false, retryable: true });
    const result = await inviteByEmail(asDb(w.founderClient), depsWith(mail.sender), {
      email: uniqueEmail("refused"),
    });
    expect(result).toMatchObject({ ok: true, delivery: "not_sent" });
    if (!result.ok || result.delivery !== "not_sent") return;
    expect(await peekInviteToken(hashInviteToken(tokenOf(result.link)))).toMatchObject({
      ok: true,
    });
  });

  it("a different method is refused while one is pending, and an entered account is not usable", async () => {
    const w = await createWedding();
    const { email } = await inviteFlow(w);
    const byCode = await createPartnerByCode(asDb(w.founderClient), { email, code: randomCode() });
    expect(byCode).toMatchObject({ ok: false, error: "invitation_pending" });

    const entered = await createUser();
    await signInAs(entered);
    expect(
      await inviteByEmail(asDb(w.founderClient), depsWith(capture().sender), {
        email: entered.email,
      }),
    ).toMatchObject({ ok: false });
  });
});

describe("createPartnerByCode (service)", () => {
  it("checks the policy BEFORE touching anything: weak code, code with the email or the name", async () => {
    const w = await createWedding();
    const email = uniqueEmail("policy");
    const db = asDb(w.founderClient);
    const weak = await createPartnerByCode(db, { email, code: "password123" });
    expect(weak).toMatchObject({ ok: false, error: "weak_code", field: "code" });
    const named = await createPartnerByCode(db, {
      email,
      code: "Jessica2027xyz",
      firstName: "Jessica",
    });
    expect(named).toMatchObject({ ok: false, error: "weak_code" });
    expect(await pendingInvitation(w.weddingId)).toEqual([]); // no invitation, no event
    const { data } = await serviceClient()
      .from("account_events")
      .select("id")
      .eq("wedding_id", w.weddingId);
    expect(data).toEqual([]);
  });

  it("saves names and label on B's row; after a revoke another address is accepted", async () => {
    const w = await createWedding();
    const db = asDb(w.founderClient);
    const first = uniqueEmail("first");
    const created = await createPartnerByCode(db, {
      email: first,
      code: randomCode(),
      firstName: "Jessica",
      lastName: "Bianchi",
      label: "sposa",
    });
    expect(created.ok).toBe(true);
    const row = await w.founderClient
      .from("wedding_partners")
      .select("email, first_name, last_name, label")
      .eq("slot", "B");
    expect(row.data).toEqual([
      { email: first, first_name: "Jessica", last_name: "Bianchi", label: "sposa" },
    ]);

    const invitation = (await pendingInvitation(w.weddingId))[0];
    expect(await revokeInvite(db, invitation?.id ?? "")).toEqual({ ok: true });
    const second = uniqueEmail("second");
    const again = await createPartnerByCode(db, { email: second, code: randomCode() });
    expect(again.ok).toBe(true);
    const moved = await w.founderClient
      .from("wedding_partners")
      .select("email, first_name")
      .eq("slot", "B");
    expect(moved.data).toEqual([{ email: second, first_name: "Jessica" }]); // names kept
  });
});

describe("giveTemporaryCode (service)", () => {
  it("refuses a code with the partner's email or name before any event; works and notifies with emails on", async () => {
    const w = await createWedding();
    const b = await createUser();
    await createPartnerByCode(asDb(w.founderClient), { email: b.email, code: b.code });
    const client = await signInAs(b);
    await client.rpc("accept_pending_invitation");
    const mail = capture();
    const deps = depsWith(mail.sender);

    const bad = await giveTemporaryCode(asDb(w.founderClient), deps, {
      selfSlot: "A",
      code: `${b.email.split("@")[0]}99`,
    });
    expect(bad).toMatchObject({ ok: false, error: "weak_code", field: "code" });
    const events = await serviceClient()
      .from("account_events")
      .select("kind")
      .eq("wedding_id", w.weddingId)
      .eq("kind", "temp_code_set");
    expect(events.data).toEqual([]);

    const temp = randomCode();
    const ok = await giveTemporaryCode(asDb(w.founderClient), deps, { selfSlot: "A", code: temp });
    expect(ok).toEqual({ ok: true });
    expect(await canSignIn(b.email, temp)).toBe(true);
    expect(await canSignIn(b.email, b.code)).toBe(false);
    expect(mail.sent).toHaveLength(1);
    expect(mail.sent[0]?.to).toBe(b.email);
    expect(`${mail.sent[0]?.text}${mail.sent[0]?.html}`).not.toContain(temp);
  });

  it("with emails off no notice is sent and it still works", async () => {
    const w = await createWedding();
    const b = await createUser();
    await createPartnerByCode(asDb(w.founderClient), { email: b.email, code: b.code });
    const mail = capture();
    const temp = randomCode();
    const result = await giveTemporaryCode(asDb(w.founderClient), depsWith(mail.sender, false), {
      selfSlot: "A",
      code: temp,
    });
    expect(result).toEqual({ ok: true });
    expect(mail.sent).toEqual([]);
    expect(await canSignIn(b.email, temp)).toBe(true);
  });
});
