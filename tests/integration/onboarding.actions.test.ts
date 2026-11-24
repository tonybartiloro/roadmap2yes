import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { EmailMessage } from "@/lib/email";
import {
  addPartnerB,
  anonClient,
  createUser,
  createWedding,
  randomCode,
  serviceClient,
  signInAs,
  stackEnv,
  uniqueEmail,
  type TestClient,
  type TestWedding,
} from "../support/supabase";

/**
 * T10: the onboarding server actions are the trust boundary. They run for real (zod, session, data
 * layer, RLS, the partner operations of T7b); only the cookie client, `revalidatePath` and the email
 * switch/sender are replaced.
 */
const state = vi.hoisted(() => ({
  client: null as unknown,
  revalidate: [] as unknown[][],
  emailOn: false,
  sent: [] as unknown[],
  sendOk: true,
}));

vi.mock("@/lib/supabase/server", () => ({ createClient: async () => state.client }));
vi.mock("next/cache", () => ({
  revalidatePath: (...args: unknown[]) => {
    state.revalidate.push(args);
  },
}));
vi.mock("@/lib/email", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/email")>();
  return {
    ...original,
    emailEnabled: () => state.emailOn,
    getEmailSender: () => ({
      transport: "smtp" as const,
      async send(message: EmailMessage) {
        state.sent.push(message);
        return state.sendOk
          ? { ok: true as const }
          : { ok: false as const, error: "refused", retryable: false };
      },
    }),
  };
});

import { finishOnboardingAction, saveStepAction } from "@/features/onboarding/actions";

beforeAll(() => {
  const env = stackEnv();
  process.env["NEXT_PUBLIC_SUPABASE_URL"] = env.url;
  process.env["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"] = env.publishableKey;
  process.env["SUPABASE_SECRET_KEY"] = env.secretKey;
});

const canSignIn = async (email: string, code: string) =>
  (await anonClient().auth.signInWithPassword({ email, password: code })).error === null;

describe("onboarding server actions", () => {
  let wedding: TestWedding;

  beforeEach(async () => {
    wedding = await createWedding("sposo");
    state.client = wedding.founderClient as TestClient;
    state.revalidate = [];
    state.emailOn = false;
    state.sent = [];
    state.sendOk = true;
  });

  it("rejects malformed input before touching anything, and without a session writes nothing", async () => {
    const bad = [
      await saveStepAction({ step: "you", firstName: "" }),
      await saveStepAction({ step: "rite", rite: "pagano" }),
      await saveStepAction({
        step: "style",
        skip: false,
        styleLabel: "Gotico",
        styleNote: null,
        region: null,
        comune: null,
      }),
      await saveStepAction("nope"),
      await finishOnboardingAction({ skipTheme: "si" }),
    ];
    for (const result of bad) expect(result).toMatchObject({ ok: false, code: "invalid" });

    state.client = anonClient();
    const noSession = await saveStepAction({ step: "rite", rite: "civile" });
    expect(noSession).toMatchObject({ ok: false, code: "forbidden" });
    expect(state.revalidate).toEqual([]);
    const row = await serviceClient().from("weddings").select("rite").eq("id", wedding.weddingId);
    expect(row.data).toEqual([{ rite: null }]);
  });

  it("step 1 saves name and label; step 2 rejects the same email and a bad one", async () => {
    const you = await saveStepAction({
      step: "you",
      firstName: "Anna",
      lastName: "Verdi",
      label: "sposa",
    });
    expect(you.ok && you.state.you).toMatchObject({ firstName: "Anna", label: "sposa" });

    const same = await saveStepAction({
      step: "partner",
      skip: false,
      email: wedding.founder.email.toUpperCase(),
      mode: "later",
    });
    expect(same).toMatchObject({ ok: false, field: "email" });
    const bad = await saveStepAction({ step: "partner", skip: false, email: "no", mode: "later" });
    expect(bad).toMatchObject({ ok: false, field: "email" });
  });

  it("step 2 with a code creates B's access at once; the code is never returned and B can enter", async () => {
    const email = uniqueEmail("luca");
    const code = randomCode();
    const result = await saveStepAction({
      step: "partner",
      skip: false,
      email,
      firstName: "Luca",
      mode: "code",
      code,
    });
    expect(result.ok, JSON.stringify(result)).toBe(true);
    expect(JSON.stringify(result)).not.toContain(code);
    if (!result.ok) return;
    expect(result.state.partner).toMatchObject({ email, firstName: "Luca", joined: false });
    expect(result.state.invitation).toMatchObject({ method: "code", email });
    expect(result.state.answers.partnerMode).toBe("code");
    // The code is not kept anywhere in the answers either.
    const stored = await serviceClient()
      .from("weddings")
      .select("onboarding_answers")
      .eq("id", wedding.weddingId);
    expect(JSON.stringify(stored.data)).not.toContain(code);
    expect(await canSignIn(email, code)).toBe(true);
  });

  it("step 2 with a code needs the code, unless the access for this email is already prepared (resume)", async () => {
    const email = uniqueEmail("luca");
    const missing = await saveStepAction({ step: "partner", skip: false, email, mode: "code" });
    expect(missing).toMatchObject({ ok: false, field: "code" });
    const weak = await saveStepAction({
      step: "partner",
      skip: false,
      email,
      mode: "code",
      code: "password1",
    });
    expect(weak).toMatchObject({ ok: false, field: "code" });

    const code = randomCode();
    await saveStepAction({ step: "partner", skip: false, email, mode: "code", code });
    const resumed = await saveStepAction({
      step: "partner",
      skip: false,
      email,
      firstName: "Luca",
      mode: "code",
    });
    expect(resumed.ok && resumed.state.partner?.firstName).toBe("Luca");
    expect(await canSignIn(email, code)).toBe(true);
  });

  it("'più tardi' saves the row without an account; the email can still be corrected before B enters", async () => {
    const first = uniqueEmail("luca");
    const fixed = uniqueEmail("luca");
    const later = await saveStepAction({
      step: "partner",
      skip: false,
      email: first,
      mode: "later",
    });
    expect(later.ok && later.state.partner?.email).toBe(first);
    expect(later.ok && later.state.invitation).toBeNull();
    const corrected = await saveStepAction({
      step: "partner",
      skip: false,
      email: fixed,
      firstName: "Luca",
      mode: "later",
    });
    expect(corrected.ok && corrected.state.partner).toMatchObject({
      email: fixed,
      firstName: "Luca",
    });
  });

  it("the email invite needs the emails on; with them it is sent at the end, not before", async () => {
    const email = uniqueEmail("luca");
    const off = await saveStepAction({ step: "partner", skip: false, email, mode: "email" });
    expect(off).toMatchObject({ ok: false, field: "mode" });

    state.emailOn = true;
    const saved = await saveStepAction({
      step: "partner",
      skip: false,
      email,
      firstName: "Luca",
      mode: "email",
      inviteAtEnd: true,
    });
    expect(saved.ok && saved.state.invitation).toBeNull();
    expect(state.sent).toEqual([]);

    const done = await finishOnboardingAction({ skipTheme: false });
    expect(done.ok).toBe(true);
    if (!done.ok) return;
    expect(done.summary.invite.kind).toBe("sent");
    expect(done.summary.invite.kind === "sent" && done.summary.invite.link).toMatch(/\/invito\//);
    expect(state.sent).toHaveLength(1);
  });

  it("'Non lo so ancora' on the partner step creates nothing and is remembered", async () => {
    const skipped = await saveStepAction({ step: "partner", skip: true });
    expect(skipped.ok && skipped.state.partner).toBeNull();
    expect(skipped.ok && skipped.state.unknown).toEqual(["partner"]);
  });

  it("finishing returns the summary, seeds the budget and revalidates only what changed", async () => {
    await saveStepAction({ step: "you", firstName: "Anna" });
    await saveStepAction({ step: "rite", rite: "civile" });
    await saveStepAction({
      step: "dates",
      skip: false,
      scenarios: [
        { id: "a", kind: "fixed", dateFrom: "2027-09-03", dateTo: null, label: null },
        {
          id: "b",
          kind: "period",
          dateFrom: "2028-05-01",
          dateTo: "2028-06-30",
          label: "Primavera",
        },
      ],
    });
    await saveStepAction({ step: "guests", band: "80_120" });
    await saveStepAction({ step: "budget", skip: false, totalCents: 2_000_000 });
    await saveStepAction({
      step: "style",
      skip: false,
      styleLabel: "Rustico",
      styleNote: "Legno e lino",
      region: "Umbria",
      comune: "Orvieto",
    });
    state.revalidate = [];

    const done = await finishOnboardingAction({ skipTheme: true });
    expect(done.ok).toBe(true);
    if (!done.ok) return;
    const { summary } = done;
    expect(summary.tasksCreated).toBeGreaterThan(10);
    expect(summary.referenceDate).toBe("2027-09-03");
    expect(summary.referenceStatus).toBe("provisional");
    expect(summary.warnings).toEqual([]);
    expect(summary.invite.kind).toBe("none");
    expect(summary.state.styleLabel).toBe("Rustico");
    expect(summary.state.unknown).toEqual(["theme"]);
    expect(state.revalidate).toEqual([["/"], ["/percorso"], ["/scelte"], ["/budget"]]);

    // Signed in again, the same wedding shows as completed (the page then goes Home).
    const again = await signInAs(wedding.founder);
    const row = await again.from("weddings").select("onboarding_completed_at").limit(1);
    expect(row.data?.[0]?.onboarding_completed_at).not.toBeNull();
  });

  it("with a code-ready partner the summary says so", async () => {
    const email = uniqueEmail("luca");
    await saveStepAction({ step: "partner", skip: false, email, mode: "code", code: randomCode() });
    const done = await finishOnboardingAction({ skipTheme: false });
    expect(done.ok && done.summary.invite).toEqual({ kind: "code_ready" });
  });

  describe("only founder A may fill in the onboarding (REV-1)", () => {
    it("partner B calling the actions directly is refused before any write", async () => {
      const b = await addPartnerB(wedding);
      state.client = b.client as TestClient;
      state.revalidate = [];
      const results = [
        await saveStepAction({ step: "you", firstName: "Intruso" }),
        await saveStepAction({ step: "rite", rite: "civile" }),
        await saveStepAction({ step: "partner", skip: false, email: uniqueEmail(), mode: "later" }),
        await finishOnboardingAction({ skipTheme: false }),
      ];
      for (const result of results) expect(result).toMatchObject({ ok: false, code: "forbidden" });
      expect(state.revalidate).toEqual([]);
      const service = serviceClient();
      const row = await service
        .from("weddings")
        .select("rite,onboarding_completed_at,onboarding_answers")
        .eq("id", wedding.weddingId)
        .single();
      expect(row.data?.rite).toBeNull();
      expect(row.data?.onboarding_completed_at).toBeNull();
      expect(row.data?.onboarding_answers).toEqual({});
      const partners = await service
        .from("wedding_partners")
        .select("first_name")
        .eq("wedding_id", wedding.weddingId)
        .eq("slot", "A");
      expect(partners.data).toEqual([{ first_name: null }]);
    });

    it("a user without a wedding is refused", async () => {
      const outsider = await createUser();
      state.client = await signInAs(outsider);
      expect(await saveStepAction({ step: "rite", rite: "civile" })).toMatchObject({
        ok: false,
        code: "forbidden",
      });
      expect(await finishOnboardingAction({ skipTheme: false })).toMatchObject({
        ok: false,
        code: "forbidden",
      });
    });

    it("after completion the steps are refused; finish stays an idempotent retry", async () => {
      expect((await finishOnboardingAction({ skipTheme: false })).ok).toBe(true);
      expect(await saveStepAction({ step: "rite", rite: "civile" })).toMatchObject({
        ok: false,
        code: "completed",
      });
      const again = await finishOnboardingAction({ skipTheme: false });
      expect(again.ok && again.summary.state.completed).toBe(true);
    });
  });

  describe("the partner step converges (REV-2)", () => {
    it("typing a new code when the access already exists keeps the access and the old code", async () => {
      const email = uniqueEmail("luca");
      const first = randomCode();
      const second = randomCode();
      await saveStepAction({ step: "partner", skip: false, email, mode: "code", code: first });
      const again = await saveStepAction({
        step: "partner",
        skip: false,
        email,
        firstName: "Luca",
        mode: "code",
        code: second,
      });
      expect(again.ok && again.state.partner?.firstName).toBe("Luca");
      expect(JSON.stringify(again)).not.toContain(second);
      expect(await canSignIn(email, first)).toBe(true);
      expect(await canSignIn(email, second)).toBe(false);
    });

    it("a retry with the same code after the step could not be saved succeeds", async () => {
      const email = uniqueEmail("luca");
      const code = randomCode();
      // The access is created (first call) but the client never got the answer: the same call again.
      await saveStepAction({ step: "partner", skip: false, email, mode: "code", code });
      const retry = await saveStepAction({
        step: "partner",
        skip: false,
        email,
        mode: "code",
        code,
      });
      expect(retry.ok).toBe(true);
      expect(retry.ok && retry.state.answers.partnerMode).toBe("code");
      expect(await canSignIn(email, code)).toBe(true);
    });
  });

  describe("finish retried (REV-3, REV-5, REV-6)", () => {
    it("an email invite that did not go out is not sent twice when finish is repeated", async () => {
      state.emailOn = true;
      state.sendOk = false;
      const email = uniqueEmail("luca");
      await saveStepAction({
        step: "partner",
        skip: false,
        email,
        mode: "email",
        inviteAtEnd: true,
      });
      const first = await finishOnboardingAction({ skipTheme: false });
      expect(first.ok && first.summary.invite.kind).toBe("not_sent");
      expect(state.sent).toHaveLength(1);
      const again = await finishOnboardingAction({ skipTheme: false });
      expect(again.ok && again.summary.invite).toEqual({ kind: "email_pending" });
      expect(state.sent).toHaveLength(1);
    });

    it("'Non lo so ancora' on the theme does not mark a saved theme as unknown", async () => {
      await serviceClient()
        .from("weddings")
        .update({ theme_id: "oliveto" })
        .eq("id", wedding.weddingId);
      const done = await finishOnboardingAction({ skipTheme: true });
      expect(done.ok && done.summary.state.unknown).not.toContain("theme");
    });
  });
});
