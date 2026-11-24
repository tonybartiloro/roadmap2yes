import { beforeAll, describe, expect, it } from "vitest";
import { gatherExportInput, loadLastExport, prepareExport } from "@/features/export/data";
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

  it("builds the three files with the date in the name and the linked location", async () => {
    const result = await prepareExport(wedding.founderClient, NOW);
    if (!result.ok) throw new Error(result.message);
    const { bundle } = result;
    expect(bundle.fileNames).toEqual({
      json: "roadmap2yes-2026-11-24.json",
      tasksCsv: "roadmap2yes-compiti-2026-11-24.csv",
      budgetCsv: "roadmap2yes-budget-2026-11-24.csv",
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
    const mine = await loadLastExport(wedding.founderClient, wedding.founder.id, "2026-11-24");
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
    const last = await loadLastExport(partnerB.client, partnerB.user.id, "2026-11-25");
    expect(last.label).toBe("ultimo export: 1 giorno fa");
  });
});
