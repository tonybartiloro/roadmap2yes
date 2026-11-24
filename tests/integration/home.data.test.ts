import { beforeAll, describe, expect, it, vi } from "vitest";
import { showWelcome } from "@/features/home/model";
import {
  addPartnerB,
  anonClient,
  createUser,
  createWedding,
  serviceClient,
  signInAs,
  type TestClient,
  type TestPartnerB,
  type TestWedding,
} from "../support/supabase";

/**
 * T14: the Home against the real local stack, with the user's clients (RLS and the T2/T8/T9
 * triggers and RPCs decide; nothing mocks Supabase). "Today" is injected, the real time only
 * separates one session from the next (`nowMs`).
 */
const session = vi.hoisted(() => ({ client: undefined as unknown }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => session.client }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { addOption, chooseOption } from "@/features/decisions/data";
import { dismissWelcomeAction } from "@/features/home/actions";
import { dismissWelcome, loadHomeData, registerVisit } from "@/features/home/data";

const TODAY = "2026-11-24";
const HOUR = 60 * 60 * 1000;

describe("Home (T14) on the local stack", () => {
  let wedding: TestWedding;
  let partnerB: TestPartnerB;
  let a: TestClient;
  let b: TestClient;
  let locationDecisionId: string;

  const loadA = (nowMs?: number) =>
    loadHomeData(a, wedding.founder.id, { today: TODAY, ...(nowMs ? { nowMs } : {}) });
  const loadB = (nowMs?: number) =>
    loadHomeData(b, partnerB.user.id, { today: TODAY, ...(nowMs ? { nowMs } : {}) });

  async function lastSeen(client: TestClient, userId: string): Promise<string | null> {
    const { data } = await client
      .from("user_wedding_state")
      .select("last_seen_at")
      .eq("user_id", userId)
      .maybeSingle();
    return data?.last_seen_at ?? null;
  }

  beforeAll(async () => {
    wedding = await createWedding();
    partnerB = await addPartnerB(wedding);
    a = wedding.founderClient;
    b = partnerB.client;
    await a
      .from("wedding_partners")
      .update({ first_name: "Tony" })
      .eq("user_id", wedding.founder.id);
    await serviceClient()
      .from("wedding_partners")
      .update({ first_name: "Jessica" })
      .eq("user_id", partnerB.user.id);

    const done = await a.rpc("complete_onboarding", {
      p_scenarios: [{ kind: "fixed", date_from: "2027-09-03", label: "3 settembre 2027" }],
    });
    if (done.error) throw new Error(`complete_onboarding failed: ${done.error.message}`);

    const id = wedding.weddingId;
    const tasks = await a.from("tasks").insert([
      { wedding_id: id, title: "Chiamare il comune", due_date: "2026-11-20", assignee: "A" },
      { wedding_id: id, title: "Scegliere la musica", due_date: "2026-11-22", assignee: "B" },
    ]);
    if (tasks.error) throw new Error(`tasks: ${tasks.error.message}`);

    const version = await a
      .from("budget_versions")
      .insert({ wedding_id: id, total_cents: 2000000 });
    if (version.error) throw new Error(`budget_versions: ${version.error.message}`);
    const category = await a
      .from("budget_categories")
      .insert({ wedding_id: id, name: "Catering" })
      .select("id")
      .single();
    if (category.error) throw new Error(`budget_categories: ${category.error.message}`);
    const item = await a
      .from("budget_items")
      .insert({
        wedding_id: id,
        category_id: category.data.id,
        description: "Banchetto",
        status: "agreed",
        planned_cents: 900000,
        agreed_cents: 950000,
      })
      .select("id")
      .single();
    if (item.error) throw new Error(`budget_items: ${item.error.message}`);
    const payments = await a.from("payments").insert([
      {
        wedding_id: id,
        item_id: item.data.id,
        kind: "deposit",
        amount_cents: 150000,
        due_date: "2026-12-01",
        paid: false,
      },
      {
        wedding_id: id,
        item_id: item.data.id,
        kind: "other",
        amount_cents: 10000,
        due_date: "2026-11-28",
        paid: true,
        paid_on: "2026-11-23",
      },
      {
        wedding_id: id,
        item_id: item.data.id,
        kind: "balance",
        amount_cents: 800000,
        due_date: "2027-03-01",
        paid: false,
      },
    ]);
    if (payments.error) throw new Error(`payments: ${payments.error.message}`);

    const decision = await a.from("decisions").select("id").eq("key", "location").single();
    if (decision.error) throw new Error(`decisions: ${decision.error.message}`);
    locationDecisionId = decision.data.id;
  });

  it("first visit of the founder: countdown, 'Prossimo passo' in AC27 order, payments, no news (AC26, AC27)", async () => {
    const home = await loadA();
    if (!home) throw new Error("no home");
    expect(home).toMatchObject({ mySlot: "A", myName: "Tony", partnerName: "Jessica" });

    expect(home.reference).toMatchObject({
      ok: true,
      data: { value: { kind: "provisional", date: "2027-09-03", days: 283, weeks: 40 } },
    });

    if (!home.steps.ok) throw new Error("steps failed");
    const { mine, all } = home.steps.data;
    expect(mine.primary).toMatchObject({ kind: "decision", decisionKind: "date" });
    // Decisions first (date, then location), then overdue tasks, then payments.
    expect(mine.secondary.map((s) => [s.kind, s.title])).toEqual([
      ["decision", "Scegli la location"],
      ["overdue-task", "Chiamare il comune"],
    ]);
    // With the switch the partner's overdue task joins the list, behind the decisions.
    expect(all.secondary.map((s) => s.title)).toEqual(["Scegli la location", "Chiamare il comune"]);
    expect(home.steps.data.hasPartnerTasks).toBe(true);

    // Only the unpaid payment due within 14 days; the paid one and the far one are out.
    if (!home.payments.ok) throw new Error("payments failed");
    expect(home.payments.data.budgetDefined).toBe(true);
    expect(home.payments.data.upcoming.map((p) => [p.itemDescription, p.amountCents])).toEqual([
      ["Banchetto", 150000],
    ]);

    // First visit: no "Novità", and the founder gets no welcome card.
    expect(home.visit.previousSeenAt).toBeNull();
    expect(home.news).toEqual({ ok: true, data: null });
    expect(showWelcome(home.visit, home.mySlot)).toBe(false);
    expect(home.lastExport).toMatchObject({ days: null, reminder: true });
  });

  it("a reload in the same session does not register again (the news are not wiped)", async () => {
    const before = await lastSeen(a, wedding.founder.id);
    expect(before).not.toBeNull();
    const again = await loadA(Date.now() + 60_000);
    expect(await lastSeen(a, wedding.founder.id)).toBe(before);
    expect(again?.visit.previousSeenAt).toBeNull();
  });

  it("the second partner's first visit shows the welcome card until 'Ho capito' (DES-20)", async () => {
    const first = await loadB();
    if (!first) throw new Error("no home");
    expect(first).toMatchObject({ mySlot: "B", myName: "Jessica", partnerName: "Tony" });
    expect(first.visit).toMatchObject({ previousSeenAt: null, welcomeDismissedAt: null });
    expect(showWelcome(first.visit, first.mySlot)).toBe(true);
    // B's own list: the shared and B's tasks, not A's.
    if (!first.steps.ok) throw new Error("steps failed");
    expect(first.steps.data.mine.secondary.map((s) => s.title)).toContain("Scegliere la musica");
    expect(first.steps.data.mine.secondary.map((s) => s.title)).not.toContain("Chiamare il comune");

    expect(await dismissWelcome(b)).toEqual({ ok: true });
    const after = await loadB();
    expect(after?.visit.welcomeDismissedAt).not.toBeNull();
    expect(showWelcome(after!.visit, after!.mySlot)).toBe(false);
  });

  it("'Novità' list the partner's changes since the previous session, never your own (AC41)", async () => {
    // Tony does things after Jessica's first visit.
    const loc = await addOption(a, {
      decisionId: locationDecisionId,
      option: {
        title: "Mamma Rosa",
        comune: "Lucca",
        link: null,
        notes: null,
        pros: [],
        cons: [],
        costCents: null,
      },
    });
    if (!loc.ok) throw new Error(loc.message);
    const row = await a.from("decisions").select("version").eq("id", locationDecisionId).single();
    const chosen = await chooseOption(a, wedding.founder.id, {
      decisionId: locationDecisionId,
      optionId: loc.data.optionId,
      expectedVersion: row.data!.version,
    });
    expect(chosen.ok).toBe(true);
    const task = await a
      .from("tasks")
      .insert({ wedding_id: wedding.weddingId, title: "Scegliere le fedi" });
    expect(task.error).toBeNull();
    // Jessica does one too: it must not show up for her.
    await b.from("tasks").insert({ wedding_id: wedding.weddingId, title: "Provare l'abito" });

    const back = await loadB(Date.now() + 2 * HOUR);
    if (!back?.news.ok || back.news.data === null) throw new Error("no news");
    const texts = back.news.data.map((n) => n.text);
    expect(texts).toContain("Tony ha scelto la location");
    expect(texts).toContain("Tony ha aggiunto un'opzione: Mamma Rosa");
    expect(texts).toContain("Tony ha aggiunto il compito «Scegliere le fedi»");
    expect(texts.join("|")).not.toContain("Provare l'abito");
    expect(texts.every((t) => t.startsWith("Tony "))).toBe(true);

    // Reload (same session): the same news, not an empty list.
    const reload = await loadB();
    expect(reload?.visit.previousSeenAt).toBe(back.visit.previousSeenAt);
    expect(reload?.news).toEqual(back.news);

    // Next session: they were seen.
    const next = await loadB(Date.now() + 4 * HOUR);
    expect(next?.news).toEqual({ ok: true, data: [] });
  });

  it("the date linked to a candidate location shows it with the countdown (AC60)", async () => {
    const date = await addOption(a, {
      decisionId: (await a.from("decisions").select("id").eq("key", "date").single()).data!.id,
      option: {
        title: "",
        comune: null,
        link: null,
        notes: null,
        pros: [],
        cons: [],
        costCents: null,
      },
      scenario: {
        kind: "fixed",
        dateFrom: "2027-06-12",
        dateTo: null,
        locationOptionId: (
          await a.from("decision_options").select("id").eq("title", "Mamma Rosa").single()
        ).data!.id,
      },
    });
    expect(date.ok).toBe(true);
    const home = await loadA();
    expect(home?.reference).toMatchObject({
      ok: true,
      data: {
        value: { kind: "provisional", date: "2027-06-12" },
        locationName: "Mamma Rosa",
      },
    });
  });

  it("two requests registering at once do not wipe the news (concurrent tabs)", async () => {
    const stored = await lastSeen(a, wedding.founder.id);
    const [one, two] = await Promise.all([
      registerVisit(a, wedding.founder.id, Date.now() + 8 * HOUR),
      registerVisit(a, wedding.founder.id, Date.now() + 8 * HOUR),
    ]);
    expect(Date.parse(one.previousSeenAt!)).toBe(Date.parse(stored!));
    expect(Date.parse(two.previousSeenAt!)).toBe(Date.parse(stored!));
  });

  it("one block failing leaves the others on screen (AC39)", async () => {
    const broken = new Proxy(a, {
      get(target, prop, receiver) {
        if (prop === "from") {
          return (table: string) =>
            target.from((table === "payments" ? "no_such_table" : table) as never);
        }
        return Reflect.get(target, prop, receiver) as unknown;
      },
    });
    const home = await loadHomeData(broken, wedding.founder.id, { today: TODAY });
    expect(home?.payments).toEqual({ ok: false });
    expect(home?.steps).toEqual({ ok: false }); // shares the budget read
    expect(home?.reference.ok).toBe(true);
    expect(home?.news.ok).toBe(true);
  });

  it("a space without date, budget or tasks: 'Data da decidere', 'Budget da definire' (AC26)", async () => {
    const other = await createWedding();
    const home = await loadHomeData(other.founderClient, other.founder.id, { today: TODAY });
    expect(home?.reference).toMatchObject({ ok: true, data: { value: { kind: "none" } } });
    expect(home?.payments).toMatchObject({
      ok: true,
      data: { budgetDefined: false, upcoming: [] },
    });
    expect(home?.steps).toMatchObject({ ok: true, data: { mine: { primary: null } } });
  });

  it("a signed-in user without a wedding gets no Home, an anonymous one cannot register or dismiss", async () => {
    const lonely = await signInAs(await createUser());
    const home = await loadHomeData(lonely, "00000000-0000-0000-0000-000000000000", {
      today: TODAY,
    });
    expect(home).toBeNull();

    const anon = anonClient();
    expect((await anon.rpc("record_seen")).error).not.toBeNull();
    expect((await dismissWelcome(anon)).ok).toBe(false);
  });

  it("the last export drives the 30-day reminder (AC42)", async () => {
    const exported = await a.rpc("record_export");
    expect(exported.error).toBeNull();
    const recent = await loadA();
    expect(recent?.lastExport).toMatchObject({
      days: 0,
      label: "ultimo export: oggi",
      reminder: false,
    });
    // 31 days later (injected calendar day): the reminder is on.
    const later = await loadHomeData(a, wedding.founder.id, { today: "2026-12-31" });
    expect(later?.lastExport.reminder).toBe(true);
  });

  describe("server action", () => {
    it("dismisses the welcome with the session of the caller, and refuses without one", async () => {
      const second = await createWedding();
      const partner = await addPartnerB(second);
      session.client = partner.client;
      expect(await dismissWelcomeAction()).toEqual({ ok: true });
      const row = await partner.client
        .from("user_wedding_state")
        .select("welcome_dismissed_at")
        .eq("user_id", partner.user.id)
        .single();
      expect(row.data?.welcome_dismissed_at).not.toBeNull();

      session.client = anonClient();
      const result = await dismissWelcomeAction();
      expect(result).toMatchObject({ ok: false, code: "session" });
    });
  });
});
