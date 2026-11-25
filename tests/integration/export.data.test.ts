import { beforeAll, describe, expect, it } from "vitest";
import { gatherExportInput, loadLastExport, prepareExport } from "@/features/export/data";
import { addDays, todayInRome } from "@/lib/dates/plain-date";
import {
  addPartnerB,
  createWedding,
  serviceClient,
  type TestPartnerB,
  type TestWedding,
} from "../support/supabase";

/**
 * T15 Esportazione: everything of the wedding is read with the user's session (RLS), the files are
 * built by the pure `buildExport`, `record_export()` stamps the date, and no secret gets out (AC42).
 */
const NOW = new Date("2026-11-24T10:00:00Z");
const TOKEN_HEX = "ab".repeat(32);

describe("Esportazione (T15) on the local stack", () => {
  let wedding: TestWedding;
  let other: TestWedding;
  let inviting: TestWedding;
  let partnerB: TestPartnerB;
  let locationOptionId: string;

  beforeAll(async () => {
    wedding = await createWedding();
    partnerB = await addPartnerB(wedding);
    other = await createWedding("sposa");
    const a = wedding.founderClient;
    const id = wedding.weddingId;

    await a
      .from("wedding_partners")
      .update({ first_name: "Tony" })
      .eq("user_id", wedding.founder.id);
    const done = await a.rpc("complete_onboarding", {
      p_scenarios: [{ kind: "fixed", date_from: "2027-09-03", label: "3 settembre 2027" }],
    });
    if (done.error) throw new Error(`complete_onboarding: ${done.error.message}`);

    // A location candidate linked to the date scenario (Q7).
    const decisions = await a.from("decisions").select("id, key").eq("key", "location").single();
    if (decisions.error) throw new Error(`decisions: ${decisions.error.message}`);
    const option = await a
      .from("decision_options")
      .insert({ wedding_id: id, decision_id: decisions.data.id, title: "Villa dei Cedri" })
      .select("id")
      .single();
    if (option.error) throw new Error(`decision_options: ${option.error.message}`);
    locationOptionId = option.data.id;
    const linked = await a
      .from("date_scenarios")
      .update({ location_option_id: locationOptionId })
      .eq("wedding_id", id);
    if (linked.error) throw new Error(`date_scenarios: ${linked.error.message}`);

    const tasks = await a.from("tasks").insert([
      { wedding_id: id, title: "Chiamare il comune", due_date: "2026-12-01", assignee: "A" },
      { wedding_id: id, title: "Compito eliminato", assignee: "both" },
    ]);
    if (tasks.error) throw new Error(`tasks: ${tasks.error.message}`);
    const removed = await a
      .from("tasks")
      .update({ deleted_at: NOW.toISOString() })
      .eq("wedding_id", id)
      .eq("title", "Compito eliminato");
    if (removed.error) throw new Error(`tasks delete: ${removed.error.message}`);

    await a
      .from("budget_versions")
      .insert({ wedding_id: id, total_cents: 2000000, reason: "Inizio" });
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
    const payment = await a.from("payments").insert({
      wedding_id: id,
      item_id: item.data.id,
      kind: "deposit",
      amount_cents: 150000,
      due_date: "2026-12-01",
      paid: false,
    });
    if (payment.error) throw new Error(`payments: ${payment.error.message}`);

    // Another wedding with its own data: it must never show up.
    await other.founderClient
      .from("tasks")
      .insert({ wedding_id: other.weddingId, title: "SEGRETO-ALTRO-MATRIMONIO" });

    // A wedding with a PENDING email invitation: its row carries a token hash that must never leave.
    inviting = await createWedding();
    const inviteeEmail = "invitata-via-email@example.test";
    const partner = await inviting.founderClient.rpc("upsert_partner_b", { p_email: inviteeEmail });
    if (partner.error) throw new Error(`upsert_partner_b: ${partner.error.message}`);
    const invite = await inviting.founderClient.rpc("create_invitation", {
      p_email: inviteeEmail,
      p_method: "email",
      p_token_hash: `\\x${TOKEN_HEX}`,
    });
    if (invite.error) throw new Error(`create_invitation: ${invite.error.message}`);
  });

  it("gathers every part of the wedding, deleted rows included", async () => {
    const input = await gatherExportInput(wedding.founderClient);
    expect(input.partners).toHaveLength(2);
    expect(input.tasks.map((t) => t.title).sort()).toContain("Chiamare il comune");
    expect(input.tasks.find((t) => t.title === "Compito eliminato")?.deleted).toBe(true);
    expect(input.tasks.find((t) => t.title === "Chiamare il comune")?.assigneeLabel).toBe("Tony");
    expect(input.decisions.length).toBeGreaterThan(0);
    expect(input.decisionEvents.length).toBeGreaterThan(0);
    expect(input.budgetVersions).toHaveLength(1);
    expect(input.budgetCategories.some((c) => c.name === "Catering")).toBe(true);
    expect(input.budgetItems).toHaveLength(1);
    expect(input.payments).toHaveLength(1);
    expect(input.dateScenarios[0]?.locationOptionId).toBe(locationOptionId);
  });

  it("builds the four files with the date in the name and the linked location", async () => {
    const result = await prepareExport(wedding.founderClient, NOW);
    if (!result.ok) throw new Error(result.message);
    const { bundle } = result;
    expect(bundle.fileNames).toEqual({
      json: "roadmap2yes-2026-11-24.json",
      tasksCsv: "roadmap2yes-compiti-2026-11-24.csv",
      budgetCsv: "roadmap2yes-budget-2026-11-24.csv",
      guestsCsv: "roadmap2yes-invitati-2026-11-24.csv",
    });
    const doc = JSON.parse(bundle.json) as {
      schemaVersion: number;
      dateScenarios: { locationOption: { title: string } | null }[];
    };
    expect(doc.schemaVersion).toBe(1);
    expect(doc.dateScenarios[0]?.locationOption?.title).toBe("Villa dei Cedri");
    expect(bundle.tasksCsv).toContain("Chiamare il comune");
    expect(bundle.tasksCsv).not.toContain("Compito eliminato");
    expect(bundle.budgetCsv).toContain("Banchetto");
  });

  it("contains no secret and nothing from another wedding", async () => {
    const result = await prepareExport(wedding.founderClient, NOW);
    if (!result.ok) throw new Error(result.message);
    const all = [result.bundle.json, result.bundle.tasksCsv, result.bundle.budgetCsv].join("\n");
    expect(all).not.toContain("token_hash");
    expect(all).not.toContain("SEGRETO-ALTRO-MATRIMONIO");
    expect(all).not.toContain(other.weddingId);
  });

  it("carries no account user id anywhere: authors are partner slot and name", async () => {
    const result = await prepareExport(wedding.founderClient, NOW);
    if (!result.ok) throw new Error(result.message);
    const all = [result.bundle.json, result.bundle.tasksCsv, result.bundle.budgetCsv].join("\n");
    for (const id of [wedding.founder.id, partnerB.user.id]) expect(all).not.toContain(id);
    expect(all).not.toContain("actor_id");
    const doc = JSON.parse(result.bundle.json) as {
      decisionEvents: { actor: { slot: string; name: string } | null }[];
    };
    expect(doc.decisionEvents.some((e) => e.actor?.slot === "A" && e.actor.name === "Tony")).toBe(
      true,
    );
  });

  it("never carries the token hash of a pending email invitation", async () => {
    // Not vacuous: the secret really is stored for this wedding.
    const stored = await serviceClient()
      .from("invitations")
      .select("token_hash")
      .eq("wedding_id", inviting.weddingId)
      .not("token_hash", "is", null);
    expect(stored.data).toHaveLength(1);

    const result = await prepareExport(inviting.founderClient, NOW);
    if (!result.ok) throw new Error(result.message);
    const all = [result.bundle.json, result.bundle.tasksCsv, result.bundle.budgetCsv].join("\n");
    expect(all).not.toContain("token_hash");
    expect(all).not.toContain(TOKEN_HEX);
    // The API itself refuses to hand out the secret column.
    const direct = await inviting.founderClient.from("invitations").select("token_hash");
    expect(direct.error).not.toBeNull();
  });

  it("records the export for the person who asked, and only for them", async () => {
    // record_export() stamps with the database clock (now()), so "today" is the real Rome day.
    const mine = await loadLastExport(
      wedding.founderClient,
      wedding.founder.id,
      todayInRome(new Date()),
    );
    expect(mine.days).toBe(0);
    const state = await serviceClient()
      .from("user_wedding_state")
      .select("user_id, last_export_at")
      .eq("wedding_id", wedding.weddingId);
    const stampedFor = state.data?.filter((r) => r.last_export_at).map((r) => r.user_id);
    expect(stampedFor).toEqual([wedding.founder.id]);
  });

  it("lets partner B export the same wedding", async () => {
    const result = await prepareExport(partnerB.client, NOW);
    if (!result.ok) throw new Error(result.message);
    expect(result.bundle.tasksCsv).toContain("Chiamare il comune");
    // The stamp is the real database now(); look at it from exactly one Rome day later.
    const tomorrow = addDays(todayInRome(new Date()), 1);
    const last = await loadLastExport(partnerB.client, partnerB.user.id, tomorrow);
    expect(last.label).toBe("ultimo export: 1 giorno fa");
  });
});

/**
 * T14 (FEAT-2026-003, AC12, AC21, AC22): guests, groups and tables in the full export. Own wedding,
 * so the counts above are not touched. Every name here is invented.
 */
describe("Esportazione degli invitati (T14) on the local stack", () => {
  const COUNT = 1200; // over the API's 1000-row cap: nothing may be cut
  let w: TestWedding;
  let strangers: TestWedding;

  beforeAll(async () => {
    w = await createWedding();
    strangers = await createWedding("sposa");
    const db = w.founderClient;
    const rows = Array.from({ length: COUNT }, (_, i) => ({
      wedding_id: w.weddingId,
      first_name: `Prova${i + 1}`,
      last_name: `Esempio${i + 1}`,
      category: "adult",
      phone: `+39 000 ${String(i + 1).padStart(6, "0")}`,
    }));
    for (let at = 0; at < rows.length; at += 500) {
      const inserted = await db.from("guests").insert(rows.slice(at, at + 500));
      if (inserted.error) throw new Error(`guests: ${inserted.error.message}`);
    }
    // a soft-deleted guest, group and table, and one live of each
    const groups = await db.from("guest_groups").insert([
      { wedding_id: w.weddingId, name: "Gruppo vivo" },
      { wedding_id: w.weddingId, name: "Gruppo eliminato" },
    ]);
    if (groups.error) throw new Error(`groups: ${groups.error.message}`);
    const tables = await db.from("guest_tables").insert([
      { wedding_id: w.weddingId, name: "Tavolo vivo", capacity: 8 },
      { wedding_id: w.weddingId, name: "Tavolo eliminato" },
    ]);
    if (tables.error) throw new Error(`tables: ${tables.error.message}`);
    const person = await db
      .from("guests")
      .insert({ wedding_id: w.weddingId, first_name: "Eliminato", last_name: "Finto" });
    if (person.error) throw new Error(`deleted guest: ${person.error.message}`);
    // The soft delete is not a column the user inserts: set it with the service client (a test setup).
    const when = { deleted_at: NOW.toISOString() };
    const admin = serviceClient();
    const marked = await Promise.all([
      admin
        .from("guest_groups")
        .update(when)
        .eq("wedding_id", w.weddingId)
        .eq("name", "Gruppo eliminato"),
      admin
        .from("guest_tables")
        .update(when)
        .eq("wedding_id", w.weddingId)
        .eq("name", "Tavolo eliminato"),
      admin.from("guests").update(when).eq("wedding_id", w.weddingId).eq("first_name", "Eliminato"),
    ]);
    for (const result of marked)
      if (result.error) throw new Error(`soft delete: ${result.error.message}`);
    await strangers.founderClient
      .from("guests")
      .insert({ wedding_id: strangers.weddingId, first_name: "Altrui", last_name: "Estraneo" });
  });

  it("reads all 1200 live guests plus the deleted one, with no duplicates", async () => {
    const input = await gatherExportInput(w.founderClient);
    expect(input.guests).toHaveLength(COUNT + 1);
    expect(new Set(input.guests.map((g) => g.id)).size).toBe(COUNT + 1);
    expect(input.guests.filter((g) => g.deleted)).toHaveLength(1);
    expect(input.guestGroups.map((g) => [g.name, g.deleted]).sort()).toEqual([
      ["Gruppo eliminato", true],
      ["Gruppo vivo", false],
    ]);
    expect(input.guestTables.map((t) => [t.name, t.deleted]).sort()).toEqual([
      ["Tavolo eliminato", true],
      ["Tavolo vivo", false],
    ]);
  });

  it("the JSON marks the deleted ones and the CSV has the 1200 live guests only", async () => {
    const result = await prepareExport(w.founderClient, NOW);
    if (!result.ok) throw new Error(result.message);
    const doc = JSON.parse(result.bundle.json) as {
      guests: { firstName: string; deleted: boolean }[];
      guestGroups: unknown[];
      guestTables: unknown[];
    };
    expect(doc.guests).toHaveLength(COUNT + 1);
    expect(doc.guests.find((g) => g.firstName === "Eliminato")?.deleted).toBe(true);
    expect(doc.guestGroups).toHaveLength(2);
    expect(doc.guestTables).toHaveLength(2);
    const lines = result.bundle.guestsCsv.split("\r\n");
    expect(lines).toHaveLength(COUNT + 2); // header + 1200 + trailing newline
    expect(result.bundle.guestsCsv).not.toContain("Eliminato");
    expect(result.bundle.fileNames.guestsCsv).toBe("roadmap2yes-invitati-2026-11-24.csv");
  });

  it("never carries another wedding's guests", async () => {
    const result = await prepareExport(w.founderClient, NOW);
    if (!result.ok) throw new Error(result.message);
    expect(result.bundle.json).not.toContain("Estraneo");
    expect(result.bundle.guestsCsv).not.toContain("Estraneo");
  });
});
